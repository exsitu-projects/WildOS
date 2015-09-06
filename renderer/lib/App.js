// App - plugin mechanism
//
// An app is:
//	- a server-side node module, loaded at server startup
//	- a client-side node module, loaded when the client main window is ready
//	- other resources (html, js, etc.) that the app can inject in the framework
//	
// On the client side:
//	The app module is loaded once the client is connected to the server,
// 	because the list of apps is sent by the server.
//  Apps are looked up in `apps:../apps`.
//	The app is started (`app.start()`) just after being loaded.
//
// For the server side, see `server/App.js`).
//

// Node modules
var fs = require('fs');
var Path = require('path');
var events = require('events');

// Shared modules
var OO = require('OO');
var log = require('Log').logger('App');
var SearchPath = require('searchpath');

// Local modules
var ObjectSharer = require('./ObjectSharer');
var SharingServer = require('./SharingServer');

// The client-side `App` class.
// This is almost identical to the `App` class in the server. 
// (Differences are highlighted).
//
var App = OO.newClass().name('App')
	.fields({
		name: null,
		tiles: [],		// The tiles running this application
	})
	.classFields({
		events: new events.EventEmitter(),		// event emitter to signal life cycle of apps
		modules: {},		// app modules by name (each module is an object with dirname, filename and module)
		instances: {},		// app instances by name
		apps: [],			// list of app instances
		defaultSearchPath: 'apps:../apps',	// default search path for apps
	})
	.classMethods({
		// Change the search paths for app modules.
		// Defaults to `apps` and `../apps` (relative to `server`)
		setSearchPath: function(path) {
			this.searchPath = new SearchPath(path);
			this.searchPath.extensions('.js');
			// configure search type
			this.searchPath.lookupAll = true;
			this.searchPath.lookupCwd = false;		
		},

		// Return the list of available app names.
		availableApps: function() {
			return this.searchPath.find();
		},

		// Return the list of running app names
		runningApps: function() {
			var appNames = [];
			for (var i = 0; i < this.apps.length; i++) {
				appNames.push(this.apps[i].name);
			}
			return appNames;
		},

		// Load the node module for an app.
		// The node module export a single OO class with the same name as the app.
		loadModule: function(appName) {
			log.enter(this, 'loadClass', appName);

			// Check if the module has already been loaded
			if (this.modules[appName]) {
				log.exit(this, 'loadClass', appName, '- already loaded');
				return this.modules[appName];
			}

			// Find module for that app
			var path = this.searchPath.get(appName);
			var module = null;

			// Load the module
			if (path) {
				try {
					// account for the fact that we are in the lib directory
					// while cwd (used by searchPath) is the parent directory
					if (!path.match(/^\//))
						path = '../'+path;
					module = require(path);
				} catch(e) {
					log.method(this, 'loadClass', '- require failed: ', e);
				}
			} else
				log.method(this, 'loadClass', '- app not found');

			// Return an object with the module and its location.
			// This is so that the app can locate other resources relative to its own directory
			var res = null;
			if (module) {
				path = require.resolve(path);
				res = this.modules[appName] = {
												module: module,
												dirname: Path.dirname(path),
												filename: Path.basename(path),
											  };
				log.exit(this, 'loadClass', appName);
			} else
				log.exit(this, 'loadClass', appName, '- failed');

			return res;
		},

		// Load a new app into the system
		loadApp: function(appName, config) {
			log.enter(this, 'loadApp', appName);
			var app = this.getApp(appName);

			// Each app can be loaded only once
			if (app) {
				log.exit(this, 'loadApp', '- app', appName, 'already loaded');
				return app;
			}

			// Load the module representing the app.
			var m = this.loadModule(appName);
			if (m) {
				if (! config)
					config = {};
				if (! config.name)
					config.name = appName;

				// Create an instance of the module
				// and store its location so that the app can load other resources if needed
				app = m.module.create(config);
				app.__dirname = m.dirname;
				app.__filename = m.filename;

				// register the app and start it
//				this.register(app);	// constructor normally has already registered it
				app.start();
				app.started();

				log.exit(this, 'loadApp', '- app', appName, 'created');
				return app;
			} else
				log.method(this, 'loadApp', '- could not load app module');

			log.exit(this, 'loadApp', '- app', appName, 'not found');
			return null;
		},

		// Unload an app
		unloadApp: function(appName) {
			log.enter(this, 'unloadApp', appName);
			var app = this.getApp(appName);
			if (!app) {
				log.warn.exit('unloadApp:', appName, 'not running');
				return;
			}

			// Signal that the app is gone and then stop it
			app.stopped();
			app.stop();

			this.unregister(app);
			log.exit(this, 'unloadApp');
		},

		// Load a set of apps and call cb with the loaded apps when they are ready
		loadApps: function(appNames, cb) {
			var loadedAppNames = [];
			for (var i = appNames.length - 1; i >= 0; i--) {
				var appName = appNames[i];
				if (this.loadApp(appName))
					loadedAppNames.push(appName);
			}
			// *** note that we're not doing this asynchronously
			// *** loadApp and start should taks a callback.
			// *** or we should use promises...
			if (cb)
				cb(loadedAppNames);
		},

		// Unload all apps
		unloadAllApps: function() {
			log.enter(this, 'unloadAllApps');
			var self = this;
			this.apps.forEach(function(app) {
				log.message('unloading', app.name);
				app.stopped();
				app.stop();
				self.unregister(app);
			});
			log.exit(this, 'unloadAllApps');
		},

		// Register an app so that we only load it once
		register: function(app) {
			log.enter(this, 'register', app.name);
			if (this.apps.indexOf(app) >= 0) {
				log.exit(this, 'register', app.name, 'already registered');
				return;
			}
			
			this.apps.push(app);
			this.instances[app.className()] = app;
			log.exit(this, 'register');
		},

		// Remove an app
		unregister: function(app) {
			log.enter(this, 'unregister', app.name);
			// Remove the app from our records
			var i = this.apps.indexOf(app);
			if (i >= 0)
				this.apps.splice(i, 1);
			delete this.instances[app.name];
// *** If we unload the module, we loose the sharer that we store with the class!!
log.exit(this, 'unregister');
return;
			// Remove the app from node's cache so if reloaded it will reload the code
			var path = this.searchPath.get(app.name);
			if (path) {
				if (!path.match(/^\//))
					path = '../'+path;
			} else
				log.warn.method(this, 'unregister', 'path to app module not found.');

			if (path) {
				path = require.resolve(path);
				log.method(this, 'unregister', 'path', path);
				if (path)
					delete require.cache[path];
				else
					log.warn.method(this, 'unregister', 'path to app module not resolved.');
			}

			delete this.modules[app.name];
			log.exit(this, 'unregister');
		},

		// Find an app by name
		getApp: function(appName) {
			return this.instances[appName];
		},

		// Call f for each app
		foreach: function(f) {
			for (var i = 0; i < this.apps.length; i++)
				f(this.apps[i]);
		},

		// Call start for each app
		start: function() {
			for (var i = 0; i < this.apps.length; i++)
				this.apps[i].start();
		},

		// Call start for each app
		stop: function() {
			for (var i = 0; i < this.apps.length; i++)
				this.apps[i].stop();
		},

		// The next methods differ from the server-side implementation
		// since the callbacks are different on the server and client side.

		// Call `initTile` for each app.
		initTile: function(tile, state) {
			log.enter(this, 'initTile');
			for (var i = 0; i < this.apps.length; i++)
				this.apps[i].initTile(tile, state);
			log.exit(this, 'initTile');
		},

		// Call `tileReady` for each app.
		tileReady: function(tile) {
			log.enter(this, 'tileReady');
			for (var i = 0; i < this.apps.length; i++)
				this.apps[i].tileReady(tile);
			log.exit(this, 'tileReady');
		},

		// Call `tileGone` for each app.
		tileGone: function(tile, state) {
			log.enter(this, 'tileGone');
			for (var i = 0; i < this.apps.length; i++)
				this.apps[i].tileGone(tile);
			log.exit(this, 'tileGone');
		},

		// Configure the sharer to manage app state.
		// This must be called before the app is created, 
		// typically when creating the class (after defining the fields and methods to be shared).
		shareState: function(sharedFields, sharedMethods, callableMethods) {
			log.enter(this, 'shareState');
			this.sharer = ObjectSharer.create().name(this.className()+'ObjectSharer')
							.slave(this, sharedFields || 'own', sharedMethods, 'after', callableMethods);
			log.exit(this, 'shareState');
			return this;
		},

		// Notify app lifecycle
		appStarted: function(app) { this.events.emit('appStarted', app); },
		appStopped: function(app) { this.events.emit('appStopped', app); },

		// Define handlers for app lifecycle notifications
		onAppStarted: function(cb) { return this.events.on('appStarted', cb); },
		onAppStopped: function(cb) { return this.events.on('appStopped', cb); },

		// Used by ObjectSharer to find pre-existing objects
		// or special-build objects
		findObject: function(oid, obj) {
			log.enter(this, 'findObject', oid, obj);
			var appName = oid.split('_')[0];
			var app = this.instances[appName];
			log.message(this, 'findObject:', app ? 'found existing app' : 'loading app');
			if (! app)
				app = this.loadApp(appName, obj);
			if (app)
				app.set(obj);
			log.exit(this, 'findObject', app);
			return app;
		},
	})
	.constructor(function(config) {
		// The server to communicate with
		this.server = App.server;

		this.name = this.className();
		App.register(this);

		// Copy configuration into object
		if (config)
			this.set(config);

		// Used when sharing state
		this.sharer = this.classs().sharer;			// object sharer to share our state
		if (this.sharer)
			this.server.addSharer(this.sharer);

		// The set of tiles
		this.tiles = [];

		log.newObject(this);
	})
	.methods({
		// Called just after the app module is created.
		// Subclasses can extend.
		start: function() {
			// nothing
		},

		// Called just after the app is unloaded.
		// Subclasses can extend.
		stop: function() {
/*
			// Reset to default web page
			this.mapTiles(function(tile) { tile.reset(); });
*/
			// Stop sharing.
			if (this.sharer)
				this.sharer.removeObject(this);
		},

		// Notification of the app lifecycle.
		started: function() {
			App.appStarted(this);
		},

		stopped: function() {
			App.appStopped(this);
		},

		// The next callback methods differ from the server-side implementation.
		// They are the client-side equivalent to the server-side `initPlatform`.

		// Called after a new tile is created, so that the app
		// can use the tile information to complete its setup.
		// Subclasses can redefine or (preferably) extend.
		initTile: function(tile, state) {
			this.tiles.push(tile);
		},

		// Called after the window representing a tile is finished loading, 
		// so that the app, e.g. inject code into the page. 
		tileReady: function(tile) {
			// nothing - subclasses can redefine
		},

		// Called when a tile has disappeared, usually because the server has disconnected.
		// Subclasses can redefine or (preferably) extend.
		tileGone: function(tile) {
			var i = this.tiles.indexOf(tile);
			if (i >= 0)
				this.tiles.splice(i, 1);
		},

		// These are redundant with Tile.mapTiles and Tile.mapReadyTiles
		// Execute `f` for each tile
		mapTiles: function(f) {
			for (var i = this.tiles.length - 1; i >= 0; i--)
				f(this.tiles[i]);			
		},
		
		// Execute `f` for each tile that is ready
		mapReadyTiles: function(f) {
			for (var i = this.tiles.length - 1; i >= 0; i--) {
				var tile = this.tiles[i];
				if (tile.ready && tile.window)
					f(tile);			
			}
		},
	})
;

log.spyMethods(App);

// Initialize default search path.
App.setSearchPath(App.defaultSearchPath);


module.exports = App;
