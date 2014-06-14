// WebServer - web + websocket server
//
// Uses `express` for the web server and `socket.io` for web sockets.
//

// Node modules
var socketio = require('socket.io');

// Shared modules
var log = require('Log').shared();

// Internal modules
var WebServer = require('./WebServer');

// The `WebSocketServer` class.
var WebSocketServer = WebServer.subclass().name('WebSocketServer')
	.fields({
		io: null, 		// websocket server
	})
	.constructor(function(config) {
		this._super(config);

		// List of connected client sockets.
		// Each entry is the socket of a connected client and has zero or more client objects.
		this.connections = [];

		// Keep trakc of the connect/disconnect listeners
		this.listeners = [];
	})
	.methods({
		start: function() {
			this._super();
			if (this.running)
				this.startSocketIO();
		},

		stop: function() {
			this._super();
			this.io = null;
		},

		// Start the websocket server.
		// When a new client connects, `newClient` is called to create a client object.
		// When a client disconnects, all client objects are notified by calling their `disconnected` method.
		// Listeners for client connection / disconnection can also be set up with `onNewClient`.
		startSocketIO: function() {
			if (this.io)
				return;

			// Start listening
			this.io = socketio.listen(this.http);
			this.io.set('log level', 1);	// 0-error, 1-warning, 2-info, 3-debug (default)
			this.io.set('transports', ['websocket']);

			// Set the connection handler
			var self = this;
			this.io.sockets.on('connection', function(socket) {
				log.eventEnter(self, 'connection');

				// Get a client object and register it (even if null)
				self.registerClient(socket, null);

				// Set up disconnect handler to notify clients and clean up table.
				socket.on('disconnect', function() {
					self.removeSocket(socket);
				});

				log.eventExit(self, 'connection');
			});

			// Set up existing listeners since they could not be created before the server was started
			this.listeners.forEach(function(listener) {
				log.method(self, 'startSocketIO', 'enabling listeners for token', listener.token);
				self.io.sockets.on('connection', listener.connected);
			});
		},
		
		// Register the client associated with a particular socket.
		// This is called automatically if newClient returns a non-null object.
		registerClient: function(socket, client) {
			// Find the connection for this socket, if any
			var connection = null;
			for (var i = 0; i < this.connections.length; i++) {
				if (this.connections[i].socket == socket) {
					connection = this.connections[i];
					break;
				}
			}

			// Register the connection when there is no client object
			if (! client) {
				if (! connection)
					this.connections.push({
						socket: socket,
						clients: [],
					});
				log.method(this, 'registerClient', 'no client, connection =', connection);
				return;
			}

			// Register the connection when there is a client object
			if (connection) {
				// Add the client to this connection if not already there
				if (connection.clients.indexOf(client) <= 0)
					connection.clients.push(client);
				log.method(this, 'registerClient', 'adding to connection =', connection);
			} else {
				// Create a new connection for this socket/client
				this.connections.push({
					socket: socket,
					clients: [client],
				});
				log.method(this, 'registerClient', 'new connection =', connection);
			}
		},

		// Unregister client from all connected sockets
		unregisterClient: function(client) {
			if (!client)
				return;

			for (var i = 0; i < this.connections.length; i++) {
				var clients = this.connections[i].clients;
				var c = clients.indexOf(client);
				if (c >= 0) log.method(this, 'unregisterClient', 'removed client from connection', this.connections[i]);
				if (c >= 0)
					clients.splice(c, 1);
			}
		},

		// Remove a socket (typically once it is disconnected).
		// If there are connected clients, their `disconnected` method, if any, is called.
		removeSocket: function(socket) {
			for (var i = 0; i < this.connections.length; i++) {
				if (this.connections[i].socket == socket) {
					var connection = this.connections[i];
					connection.clients.forEach(function(client) {
						if (client.disconnected)
							client.disconnected(socket);
					});
					this.connections.splice(i, 1);
					break;
				}
			}
		},

		// Call `cb` for all connected clients
		// (registered with `newClient` or `registerClient`).
		// The callback is called with the client and socket as arguments.
		forClients: function(cb) {
			for (var i = 0; i < this.connections.length; i++)
				this.connections[i].clients.forEach(function(client) { cb(client, socket, server); });
		},

		// Call `cb` for each connected client socket.
		// `cb` is called with the socket object, _not_ the client that may have been registered for it
		// (through `newClient` or `registerClient`).
		forSockets: function(cb) {
			for (var i = 0; i < this.connections.length; i++)
				cb(this.connections[i].socket, this);
		},

		// Specify listeners when a client connects / disconnects.
		// The listeners are called with the client's socket, the server and the `token`.
		// The `token`, if not null, is also used to unregister the listeners with `offNewClient`.
		// A single set of listener can be associated with a given token.
		// The `disconnected` callback is optional.
		onNewClient: function(connected, disconnected, token) {
			if (!this.io)
				if (token)
					log.method(this, 'onNewClient', 'server not listening yet. Storing for later activation.');
				else
					log.warn.method(this, 'onNewClient', 'server not listening yet. Ignored!');

			// Adjust for optional `disconnected` arg
			if (typeof disconnected != 'function') {
				token = disconnected;
				disconnected = null;
			}

			// The record keeping track of the listeners
			var listeners = {
				token: token,
				connected: null,
				disconnected: null,
				socket: null,
			};

			var self = this;

			// Listener when the client disconnects:
			// Call `disconnected` and remove listener from table.
			if (disconnected || token)
				listeners.disconnected = function() {
					log.eventEnter(self, 'disconnect', '- token', token);
					if (disconnected)
						disconnected(listeners.socket, self, token);
					log.eventExit(self, 'disconnect');
				};

			// Listener when a client connects:
			// Call `connected` and set up disconnect listener.
			listeners.connected = function(socket) {
				log.eventEnter(self, 'connect', '- token', token);

				listeners.socket = socket;
				if (connected)
					connected(socket, self, token);

				if (listeners.disconnected)
					socket.on('disconnect', listeners.disconnected);

				log.eventExit(self, 'connect');
			};

			// Record listener in table, removing old one if any.
			if (token) {
				this.offNewClient(token);
				this.listeners.push(listeners);
			}

			// Setup connection listener.
			// If server is not running yet and `token` was not null,
			// the listeners will be established when the server starts (see `startSocketIO`).
			if (this.io)
				this.io.sockets.on('connection', listeners.connected);
		},

		// Remove the listeners for client connections associated with `token`,
		// or all such listeners if `token` is null.
		offNewClient: function(token) {
			if (! token) {
				// remove all listeners
				this.listeners = [];
				if (this.io)
					this.io.sockets.off('connection');
				log.method(this, 'offNewClient', 'removed all listeners');
				return;
			}

			var listeners = null;
			for (var i = 0; i < this.listeners.length; i++) {
				if (this.listeners[i].token == token) {
					listeners = this.listeners[i];
					break;
				}
			}
			
			if (listeners) {
				log.method(this, 'offNewClient', 'found listener for token', token);
				if (this.io)
					this.io.sockets.removeListener('connection', listeners.connected);
				if (listeners.socket)
					listeners.socket.removeListener('disconnect', listeners.disconnected);
				this.listeners.splice(i, 1);
			}
			else log.method(this, 'offNewClient', 'no listeners for token', token);
		},

		// Send message to all connected clients
		emit: function(msg, data) {
			if (this.io)
				this.io.sockets.emit(msg, data);
		},
	});

log.spyMethods(WebSocketServer);

module.exports = WebSocketServer;
