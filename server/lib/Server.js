// Server - communicates with all clients

// Node modules
var events = require('events');
var fs = require('fs');

// Shared modules
var log = require('Log').shared();

// Internal modules
var App = require('./App');
var WebSocketServer = require('./WebSocketServer');

// The `Server` class, combining a web server and a websocket server
var Server = WebSocketServer.subclass().name('Server')
	.fields({
		platform: null,
	})
	.constructor(function(platform, config) {
		if (! config)
			config = {};
		config.root = 'content/';

		this._super(config);
		this.platform = platform;

		var self = this;

		// Say hello/goodbye to each new client.
		//	server              client
		//	    -- helloClient -->
		//      <-- helloServer --
		//      -- deviceReady -->
		//      <-- clientReady --
		this.onNewClient(function(socket, server) {
			var serverInfo = {
				platform: this.platform.name,
				apps: App.runningApps(),
			};

			// First say hi
			socket.emit('helloClient', serverInfo);

			// Wait for `ready` message
			// We expect the following fields in clientInfo:
			//	`client`: type of client. `'device'` for a device client (only one supported at the moment)
			//	`device`: record identifying the device - typically `{ type: 'Surface' }`
			socket.on('helloServer', function(clientInfo) {
				if (clientInfo.client === 'device') {
					var device = platform.clientConnected(socket, server, clientInfo);
					if (device)
						socket.emit('deviceReady', serverInfo);
					else
						socket.emit('quit');
				}
			});

			socket.on('clientReady', function(clientInfo) {
				App.clientConnected(socket, server, clientInfo.apps);
			});

			socket.on('appReady', function(appName) {
				App.clientConnected(socket, server, [appName]);
			});

		}, function(socket, server) {
			platform.clientDisconnected(socket, self);
			App.clientDisconnected(socket, self);
		}, App);

		// When an app starts, notify clients
		App.onAppStarted(function(app) {
			self.appStarted(app);
		});

		App.onAppStopped(function(app) {
			self.appStopped(app);
		});

	})
	.methods({
		appStarted: function(app) {
			// Tell the web browser to add a route for the app
			this.insertAppRoute(app.name);

			// Tell clients about the new app
			this.emit('startApp', app.name);

			// Tell the app to setup itself
			app.initPlatform(this.platform);
		},

		appStopped: function(app) {
			this.removeAppRoute(app.name);
			this.emit('stopApp', app.name);
		},

		// Manage apps
		insertAppRoute: function(appName) {
			var appContentDir = __dirname + '/../apps/'+appName+'/content/';
			if (fs.existsSync(appContentDir))
				this.insertRoute('/'+appName, appContentDir);
		},

		removeAppRoute: function(appName) {
			this.removeRoute('/'+appName);
		},
	})
;

log.spyMethods(Server);

module.exports = Server;
