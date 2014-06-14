// App - plugin mechanism
//
// An app is:
//	- a server-side node module, loaded at server startup
//	- a client-side node module, loaded when the client main window is ready
//	- other resources (html, js, etc.) that the app can inject in the framework
//	
// On the server side:
//	The app module is loaded before the platform is created, it is looked up in `apps:../apps`.
//	The app is started (`app.start()`) just after that.
//	`app.initPlatform(platform)` is called after the platform has been created.
//	This lets the app inject code in the platform UI, etc.
//
// For the client side, see `renderer/App.js`).
//

// Node modules
var fs = require('fs');
var Path = require('path');
var events = require('events');

// Shared modules
var OO = require('OO');
var SearchPath = require('searchpath');
var log = require('Log').shared();

// Local modules
var ObjectSharer = require('./ObjectSharer');
var SharingClient = require('./SharingClient');

// The server-side `App` class.
var App = OO.newClass().name('App')
	.fields({
		name: null,
	})
	.classFields({
		events: new events.EventEmitter(),		// event emitter to signal life cycle of apps
		modules: {},		// app modules by name (each module is an object with dirname, filename and module)
		instances: {},		// app instances by name
		apps: [],			// list of app instances
		defaultSearchPath: 'apps:../apps',	// default search path for apps
	})
	.classMethods({

		// Create the Apps menu
		makeMenu: function() {
			// Create Platform menu in UI
			var gui = null;
			try {
				gui = window.require('nw.gui');
			} catch(e) {
				// We're not running under node-webkit - give up
				this.menu = null;
				return;
			}

			// Create a menu item for the Apps menu
			var self = this;
			function makeItem(menu, appName) {
				menu.append(new gui.MenuItem({
					label: appName,
					type: 'checkbox',
					checked: self.instances[appName],
					click: function() { 
						if (self.instances[appName])
							self.unloadApp(appName);
						else
							self.loadApp(appName);
					}
				}));
			}

			var win = gui.Window.get();
			if (!win.menu)
				win.menu = new gui.Menu({ type: 'menubar' });
			var menuBar = win.menu;

			var appsMenu = new gui.Menu();
			var apps = this.availableApps();
			for (var i = 0; i < apps.length; i++)
				makeItem(appsMenu, apps[i]);
			
			menuBar.insert(new gui.MenuItem({
				label: 'Applications',
				submenu: appsMenu,
			}), 3);

			this.menu = appsMenu;
		},

		// Check/uncheck app in apps menu
		checkAppMenuItem: function(appName, checked) {
			log.message('*** checkAppMenu', appName, checked);
			if (! this.menu)
				return;	// no GUI

			log.message('*** looking up item');
			var items = this.menu.items;
			for (var i = 0; i < items.length; i++) {
				var item = items[i];
				if (item.label == appName) {
					item.checked = checked;
					return;
				}
			}
			log.warn.message('*** app', appName, 'not found in menu');
			// not found
		},

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

		// Return the list of runnin app names
		runningApps: function() {
			var appNames = [];
			for (var i = 0; i < this.apps.length; i++) {
				appNames.push(this.apps[i].name);
			}
			return appNames;
		},

		// Load the node module for an app.
		// The node module exports a single OO class with the same name as the app.
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

				// Create an instance of the module
				// and store its location so that the app can load other resources if needed
				app = m.module.create(config);
				app.__dirname = m.dirname;
				app.__filename = m.filename;

				// Register the app, start it and signal that it's up
//				this.register(app);	// constructor normally has already registered it
				app.start();
				app.started();

				// Check it in App menu
				this.checkAppMenuItem(appName, true);

				log.exit(this, 'loadApp', '- app', appName, 'created');
				return app;
			} else
				log.method(this, 'loadApp', '- could not load app module');

			log.exit(this, 'loadApp', '- app', appName, 'not found');
			return null;
		},

		// Unload an app
		// *** This most likely does not clean up properly. We should probably use node's vm module
		// *** to run the app in a sandbox, but it's a bit involved.
		unloadApp: function(appName) {
			log.enter(this, 'unloadApp', appName);

			// Find the app
			var app = this.getApp(appName);
			if (!app) {
				log.warn.exit(this, 'unloadApp:', appName, 'not running');
				return;
			}

			// Signal that the app is gone and then stop it
			app.stopped();
			app.stop();

			this.unregister(app);

			log.exit(this, 'unloadApp', appName);
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

		// Register an app so that we only load it once
		register: function(app) {
			log.enter(this, 'register', app.name);

			if (this.apps.indexOf(app) >= 0) {
				log.warn.exit(this, 'register', app.name, 'already registered');
				return;
			}
			
			this.apps.push(app);
			this.instances[app.className()] = app;

			log.exit(this, 'register', app.name);
		},

		unregister: function(app) {
			log.enter(this, 'unregister', app.name);

			// Uncheck it in App menu
			this.checkAppMenuItem(app.name, false);

			// Remove the app from our records
			var i = this.apps.indexOf(app);
			if (i >= 0)
				this.apps.splice(i, 1);
			delete this.instances[app.name];
// *** If we unload the module, we loose the sharer that we store with the class!!
log.exit(this, 'unregister', app.name);
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
				if (path)
					delete require.cache[path];
				else
					log.warn.method(this, 'unregister', 'path to app module not resolved.');
			}

			delete this.modules[app.name];

			log.exit(this, 'unregister', app.name);
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

		// Notify apps of a new client
		clientConnected: function(socket, server, appNames) {
			log.enter(this, 'clientConnected', appNames);

			var i;
			if (appNames) {
				// Notify only these apps
				for (i = appNames.length - 1; i >= 0; i--) {
					var app = this.instances[appNames[i]];
					if (app)
						app.clientConnected(socket, server);
				}
			} else {
				// Notify all apps
				for (i = 0; i < this.apps.length; i++) 
					this.apps[i].clientConnected(socket, server);
			}

			log.exit(this, 'clientConnected');
		},
		clientDisconnected: function(socket, server, appNames) {
			log.enter(this, 'clientDisconnected', appNames);

			var i;
			if (appNames) {
				// Notify only these apps
				for (i = appNames.length - 1; i >= 0; i--) {
					var app = this.instances[appNames[i]];
					if (app)
						app.clientDisconnected(socket, server);
				}
			} else {
				// Notify all apps
				for (i = 0; i < this.apps.length; i++) 
					this.apps[i].clientDisconnected(socket, server);
			}

			log.exit(this, 'clientDisconnected');
		},

		// Call start for each app
		start: function() {
			for (var i = 0; i < this.apps.length; i++)
				this.apps[i].start();
		},

		// Call stop for each app (note that this does not unload it)
		stop: function() {
			for (var i = 0; i < this.apps.length; i++)
				this.apps[i].stop();
		},

		// Call initPlatform for each app
		initPlatform: function(platform) {
			log.enter(this, 'initPlatform');
			for (var i = 0; i < this.apps.length; i++) {
				var app = this.apps[i];
				app.platform = platform;
				app.initPlatform(platform);
			}
			log.exit(this, 'initPlatform');
		},

		// Set up an object sharer to share this app's state with clients
		// This must be called before the app is created, typically when creating the class.
		shareState: function(sharedFields, sharedMethods, notifyMethods, when) {
			log.enter(this, 'shareState');
			this.sharer = ObjectSharer.create().name(this.className()+'ObjectSharer')
							.master(this, sharedFields || 'own', sharedMethods, notifyMethods, when || 'after');
			log.exit(this, 'shareState');
			return this;
		},

		// Notify app lifecycle
		appStarted: function(app) { this.events.emit('appStarted', app); },
		appStopped: function(app) { this.events.emit('appStopped', app); },

		// Define handlers for app lifecycle notifications
		onAppStarted: function(cb) { return this.events.on('appStarted', cb); },
		onAppStopped: function(cb) { return this.events.on('appStopped', cb); },
	})
	.constructor(function(config) {
		this.name = this.className();
		App.register(this);

		// Copy configuration into object
		if (config)
			this.set(config);

		// Used when sharing state
		this.sharer = this.classs().sharer;			// object sharer to share our state

		log.newObject(this);
	})
	.methods({
		// Called when a new client is connected
		clientConnected: function(socket, server) {
			if (this.sharer)
				server.registerClient(socket, SharingClient.create(socket).addSharer(this.sharer));
		},
		clientDisconnected: function(socket, server) {
		},

		// Called just after the app module is created
		// Subclasses can extend.
		start: function() {
			// nothing
		},

		// Called just after the app is unloaded
		// Subclasses can extend.
		stop: function() {
			if (this.sharer)
				this.die();
		},

		// Notification of the app lifecycle
		started: function() {
			App.appStarted(this);
		},

		stopped: function() {
			App.appStopped(this);
		},

		// Called after the platform is loaded, so that the app
		// can use the platform to complete its setup,
		// e.g. by injecting code into the platform's UI 
		initPlatform: function(platform) {
			// nothing - subclasses can redefine
		},
	})
;

// Initialize search path.
App.setSearchPath(App.defaultSearchPath);

log.spyMethods(App);

module.exports = App;
