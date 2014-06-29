// SocketIOServer
//
// Represents a connection to a server using socket.io

// Node modules
var io = require('socket.io-client');

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// The `SocketIOServer` class.
var SocketIOServer = OO.newClass().name('SocketIOServer')
	.fields({
		hostname: null,		// Defaults to localhost
		port: 80,			// Defaults to Web server port
		path: '',			// Defaults to global namespace
		retry: true,		// Whether to retry on error
		retryDelay: 5000,	// Retry delay
	})
	.constructor(function(hostname, port, path) {
		this.socket = null;

		this.hostname = hostname;
		if (port)
			this.port = port;
		if (path && ! path.match(/^\//))
			path = '/'+path;
		this.path = path || '';

		if (this.hostname)
			this.url = this.hostname+':'+this.port+this.path;
		else
			this.url = this.path || null;
		
		this.connectionUp = false;	// Whether the connection is actually live
		this.retryPending = false;	// As it says...
		log.newObject(this);
	})
	.methods({
		// Connect to server.
		connect: function() {
			// We can manage only one connection per object.
			if (this.socket) {
				log.message(this, 'connect', '- socket already exists');
				return this;
			}

			// Open the socket.
			// This will in general return a non-null value, but we won't know
			// until a `connect` event that the connection went through.
			this.socket = io.connect(this.url, {
				'force new connection': true,	// critical to retry on initial connect
				'reconnect': true,
				'reconnection delay': 5000,
				'reconnection limit': 5000,		// to avoid exponential backoff
				'max reconnection attempts': 1000,
			});

			if (! this.socket) {
				log.warn.message(this, 'connect', ' - could not get socket');
				return this;
			}

			// Set the listeners to manage the connection.
			// We can do this even though we don't know yet that the connection is up.
			this.setListeners();
			// Let subclasses extend without having to redefine `connect`.
			this.created();
			log.message(this, 'connect');

			return this;
		},

		// Internal methods to set the listeners that manage the connection.
		// Note that `this.connectionUp` 
		setListeners: function() {
			var self = this;

			// connection management //
			this.on('connect', function() {
				log.eventEnter(self, 'connect', self.url);

				self.connectionUp = true;
				self.connected();

				log.eventExit(self, 'connect');
			});

			// We don't use reconnect, except for logging
			this.on('reconnect', function() {
				log.event(self, 'reconnect', self.url);
				// connect is also called, so this is not useful
			});

			// When a disconnect is notified while the socket exists,
			// automatic reconnection will take place.
			this.on('disconnect', function (reason) {
				log.eventEnter(self, 'disconnect', self.url, '- reason:', reason);
				self.connectionUp = false;
				self.disconnected();
				// socket.io's auto-reconnect will kick in
				log.eventExit(self, 'disconnect');
			});

			// Not sure this one works
			this.on('connect_failed', function (reason) {
				log.warn.event(self, 'connect_failed', self.url, '- reason:', reason);
			});

			// When an error occurs, the connection could not established
			// when the socket was first created. 
			// In this case, we need to try to reconnect ourselves, 
			// i.e. socket.io's automatic reconnect does not kick in
			this.on('error', function (reason) {
				log.warn.eventEnter(self, 'error', self.url, '- reason:', reason);
				// this only occurs on first connection attempt
				if (self.retry) {
					self.socket = null;
					self.tryReconnect();
				}
				log.warn.eventExit(self, 'error');
			});

		},
		
		// Called when the socket is created.
		created: function(socket) {
			// empty - subclasses can redefine
			// Typically they set up their event handlers here
		},

		// Called when the connection is established.
		connected: function(socket) {
			// empty - subclasses can redefine
		},

		// Called when the connection is lost.
		// The transport layer will try reconnecting (unless `retry` is false).
		disconnected: function(socket) {
			// empty - subclasses can redefine
		},

		// Shut down the connection.
		disconnect: function() {
			if (this.socket) {
				log.method(this, 'disconnect');
				this.socket.removeAllListeners();
				this.socket.disconnect();
				this.socket = null;
			} else
				log.method(this, 'disconnect', ' - not connected');
		},

		// Internal method to reconnect. This is only used when
		tryReconnect: function() {
			if (this.retryPending || this.connectionUp) {
				log.method(this, 'tryReconnect', '- unnecessary',
					'(pending=', retryPending, ' - connectionUp=', this.connectionUp);
				return;
			}

			log.method(this, 'tryReconnect', '- will try in', this.retryDelay/1000, 'seconds');

			var self = this;
			this.retryPending = true;
			setTimeout(function(){
				self.retryPending = false;
				if (! this.connectionUp) {
					log.method(self, 'tryReconnect', '- retrying');
					self.connect();
				} else
					log.method(self, 'tryReconnect', '- already connected');
			}, this.retryDelay);
		},

		// --- Manage events ---
		// This gives a similar API as node's event emitters.

		// Internal method to log events.
		logEvent: function(type, msg) {
			if (this.socket)
				log.method(this, type, msg, '- has', this.socket.listeners(msg).length, 'listeners');
			else
				log.method(this, type, msg, '- no socket');
		},

		// Set a listener.
		on: function(msg,listener) {
			this.logEvent('on', msg);
			if (this.socket)
				this.socket.on(msg, listener);
		},

		// Set a listener to be called only once.
		once: function(msg, listener) {
			this.logEvent('once', msg);
			if (this.socket)
				this.socket.once(msg, listener);
		},

		// Remove a listener.
		// If `listener` is `null`, remove all listeners for `msg`.
		// If `msg` is also `null`, remove all listeners.
		off: function(msg, listener) {
			this.logEvent('off', msg);
			if (this.socket)
				if (listener)
					this.socket.removeListener(msg, listener);
				else
					this.socket.removeAllListeners(msg);
		},

		// Emit an event.
		emit: function(msg, data) {
			this.logEvent('emit', msg);
			if (this.socket)
				this.socket.emit(msg, data);
		},
	});

log.spyMethodsExcept(SocketIOServer, ['logEvent']);

module.exports = SocketIOServer;
