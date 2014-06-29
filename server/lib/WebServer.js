// WebServer - HTTP server
//
// Uses `express`.
//

// Node modules
var express = require('express');
var http = require('http');

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// The `WebServer` class.
var WebServer = OO.newClass().name('WebServer')
	.fields({
		port: 8080,		// port
		routes: null,	// array of static routes `{ path: <prefix>, dir: <fulldir> }`
		root: null,		// directory for static content (static route without prefix)
		http: null,		// http server
		app: null,		// express app
		io: null,		// websocket
	})
	.constructor(function(config) {
		// Copy configuration into object
		if (config)
			this.set(config);
		log.newObject(this);
	})
	.methods({
		// Edit the routes in the Express server.
		// *** This is not officially supported, but there does not seem to be a proper way to do it.
		insertRoute: function(path, dir) {
			this.removeRoute(path);
			this.app.stack.splice(0, 0, { route: path, handle: express.static(dir) });
			return true;
		},

		removeRoute: function(path) {
			for (var i = 0; i < this.app.stack.length; i++) {
				if (this.app.stack[i].route == path) {
					this.app.stack.splice(i, 1);
					return true;
				}
			}
			return false;
		},

		// Start Express and the HTTP server.
		start: function() {
			// Create Express app and HTTP server if not already configured in.
			if (! this.app)
				this.app = express();
			if (! this.http)
				this.http = http.createServer(this.app);

			// Configure Express app with routes.
			if (this.routes) {
				for (var i = 0; i < this.routes.length; i++) {
					var route = this.routes[i];
					this.app.use(route.path, express.static(route.dir));
				}
			}
			if (this.root)
				this.app.use(express.static(__dirname + '/../' + this.root));
			this.app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

			// Give up if address in use.
			var self = this;
			this.http.on('error', function(e) {
				if (e.code == 'EADDRINUSE') {
					log.error.event(self, 'error', ' - port', self.port, 'in use - giving up on local server');
					self.running = false;
				}
			});

			// Start http server.
			log.method(this, 'start', '- listening to port', this.port);
			this.http.listen(this.port);
			this.running = true;

			return this;
		},

		stop: function() {
			if (! this.running)
				return;

			if (this.http) {
				this.http.close();
				this.http = null;
				this.app = null;
			}

			this.running = false;
		},

	});

log.spyMethods(WebServer);

module.exports = WebServer;
