// SocketIOClient - Base class for a client connecting to a SocketIO server
//
// Represents a connection to a client using socket.io.
// This is typically used to create a client object in the `newClient`
// callback of a `SocketIO` object.
// (Both `SocketIO` and `SocketIOClient` should be subclassed, of course).
//

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// The `SocketIOClient` class.
var SocketIOClient = OO.newClass().name('SocketIOClient')
	.fields({
		socket: null,
	})
	.constructor(function(socket) {
		this.socket = socket;

		var self = this;	// needed for the closure
		this.on('disconnect', function(reason) {
			log.eventEnter(self, 'disconnect', '- reason:', reason);
			self.socket = null;
			self.disconnected();
			log.eventExit(self, 'disconnect');
		});
	})
	.methods({
		// Shutdown the connection.
		close: function() {
			if (this.socket) {
				log.method(this, 'close');
				this.socket.disconnect();
				this.socket = null;
			} else
				log.method(this, 'close', '- not open');
		},

		// Callback when the client disconnects.
		// Subclasses can redefine.
		disconnected: function() {
			// subclasses can redefine
		},

		// Manage events being sent to / received from the client.

		// Utility function to log events
		logEvent: function(type, msg) {
			if (this.socket)
				log.method(this, type, msg, '- has', this.socket.listeners(msg).length, 'listeners');
			else
				log.method(this, type, msg, '- no socket');
		},

		// Same functions as an event emitter: `on`, `off`, `once`, `emit`.
		// (See a small difference for `off` though).
		on: function(msg, listener) {
			this.logEvent('on', msg);
			if (this.socket)
				this.socket.on(msg, listener);
		},

		once: function(msg, listener) {
			this.logEvent('once', msg);
			if (this.socket)
				this.socket.once(msg, listener);
		},

		// `cl.off('msg')` removes all listeners for `'msg'`.
		// `cl.off() removes all listeners.
		off: function(msg, listener) {
			this.logEvent('off', msg);
			if (this.socket)
				if (listener)
					this.socket.removeListener(msg, listener);
				else
					this.socket.removeAllListeners(msg);
		},

		emit: function(msg, data) {
			this.logEvent('emit', msg);
			if (this.socket)
				this.socket.emit(msg, data);
		},

	})
;

log.spyMethodsExcept(SocketIOClient, ['logEvent']);

module.exports = SocketIOClient;
