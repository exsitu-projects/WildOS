// Renderer - main module for the client
//
// A `Renderer` object is a sharing client that shares 
// instances of `Tile` with the server.
// A single renderer can manage multiple tiles, e.g.
// when several monitors are connected to the client computer,
// or if a single screen should be tiled with multiple windows.
//


// Node modules
var os = require('os');

// Node-Webkit module
var gui;

// Shared modules
var log = require('Log').shared();

// Internal modules
var SharingServer = require('./SharingServer');
var ObjectSharer = require('./ObjectSharer');
var App = require('./App');
var Tile = require('./Tile');

// Command line options
var program = require('commander');

program
	.version('0.2.1')
	.usage('[options] [app ...]')
	.option('-l, --local', 'Run locally: server is on localhost')
	.option('-s, --server <name[:port]>', 'Server to connect to (defaults to $SSH_CLIENT)')
	.option('-p, --port <number>', 'Port number (defaults to 8080)', parseInt)
	.option('-i, --instance <name>', 'Instance name (required)')
;

// Quit the application.
function quit() {
	if (gui)
		gui.App.quit();
	else
		process.exit(0);
}

// The `Renderer` class
var Renderer = SharingServer.subclass().name('Renderer')
	.fields({
		sharer: null,
		host: null,		// the base name of the host we are on
		instance: 0,	// distinguishes multiple renderer instances on the same machine
	})
	.constructor(function(instance) {
		log.enter(this, 'constructor');
		
		this.host = os.hostname().split('.')[0];
		// If running clients locally, call ourselves 'localhost'
		if (program.local)
			this.host = 'localhost';

		// Parse the host name argument, if any.
		// It can be a simple host, or of the form host:port
		if (program.server) {
			var h = program.server.split(':');
			if (h[1]) {
				program.server = h[0];
				if (! program.port)
					program.port = h[1];
			}
		}

		this.instance = instance;
		this._super(program.server, program.port);

		log.exit(this, 'constructor', this.host+'_'+instance, 'connected to server', this.hostname+':'+this.port);
	})
	.methods({
		// Configure the sharer to manage objects of class `Tile`.
		// This is done only once even if the method is called multiple times 
		// (after a reconnect, typically).
		startSharing: function() {
			if (this.sharer)
				return;

			this.sharer = ObjectSharer.create().name('renderingSharer').slave(Tile, 'own');
			this.addSharer(this.sharer);
		},

		stopSharing: function() {
			log.message('killing all tiles');
			var self = this;
			this.sharer.allObjects('oid', function(oid) {
				self.sharer.killObject(oid);
			});
		},

		// Called when the connection is created.
		created: function() {
			this._super();

			// If we have already set our listeners, give up.
			// This typically happens when the server is not there on the first attempt
			// and we try to reconnect.
			if (this.socket.listeners('helloClient').length > 0) {
				log.message(this, 'created', '- already configued');
				return;
			}

			// Set up a listener for the `'hello'` message, which tells us
			// that the server is ready and which apps to load.
			var self = this;
			this.on('helloClient', function(serverInfo) {
				log.eventEnter(self, 'helloClient', serverInfo);

				// Create the sharer so we can receive tile information.
				self.startSharing();

				// Tell the server who we are.
				// This will trigger the sending of the tile information.
				log.event(self, 'helloClient', self.host, self.instance);

				self.emit('helloServer', {
					client: 'device',
					device: {
						type: 'Surface',
					},
					host: self.host,
					instance: self.instance,
				});

				log.eventExit(self, 'helloClient');
			});

			self.on('deviceReady', function(serverInfo) {
				log.eventEnter(self, 'deviceReady');
				App.loadApps(serverInfo.apps, function(apps) {
					self.emit('clientReady', {
						apps: apps
					});
				});
				log.eventExit(self, 'deviceReady');
			});

			// Start/stop an app - these are sent when apps are loaded/stopped dynamically
			this.on('startApp', function(appName) {
				log.eventEnter(self, 'startApp', appName);

				App.loadApp(appName, self);

				// Let client know we're ready.
				// *** This should be done in a callback (or promise)
				// *** passed to loadApp to make sure it's really ready 
				self.emit('appReady', appName);

				log.eventExit(self, 'startApp');
			});

			this.on('stopApp', function(appName) {
				log.eventEnter(self, 'stopApp', appName);

				App.unloadApp(appName);

				log.eventExit(self, 'stopApp');
			});

			// Set up a listener for the `'quit'` message, which tells us to ... quit!
			this.on('quit', function() {
				quit();
			});
		},
		
		// Called when we loose the connection.
		// Delete all the tiles since they will be recreated when we reconnect.
		disconnected: function() {
			this._super();
			if (! this.sharer)
				return;

			log.message('unloading all apps');
			App.unloadAllApps();

			this.stopSharing();
		},
	})
;

log.spyMethods(Renderer);

// The main function, called from the window created when node-webkit starts.
// This is so that we have access to that window during start-up (e.g., for logging).
//
exports.init = function () {
	gui = exports.gui = window.require('nw.gui');

	// Process arguments: need to prepend 2 arguments for commander to work
	var args = ['nw', 'renderer'];
	for (var i = 0; i < gui.App.argv.length; i++)
		args.push(gui.App.argv[i]);
	program.parse(args);

	// Backward compatibility: if no --instance flag and only one loose argument, take it as instance name
	if (! program.instance && program.args.length == 1)
		program.instance = program.args[0];

	if (! program.instance)
		program.instance = 'default';

	// Create and start the client.
	App.server = Renderer.create(program.instance).connect();
};

