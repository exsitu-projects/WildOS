// WebController - A connection to a device running a web controller

// Local modules
var log = require('Log').logger('./WebController');

// Internal modules.
var Device = require('../../lib/Device');

// Internal class to manage the individual controllers
var WebController = Device.subclass().name('WebController')
	.fields({
		socket: null,	// The socket to communicate with this client
	})
	.constructor(function(socket, server, clientInfo) {
		this._super({}, {});
		this.socket = socket;

		server.registerClient(socket, this);

		// Notify of creation
		this.deviceCreated();
	})
	.methods({
		// Called when the device is added to the device tree
		added: function() {
			// Notify of availability
			this.deviceAvailable();
		},

		disconnected: function() {
			this.deviceUnavailable();
			this.parent.removeDevice(this);
			this.socket = null;
		},

		emit: function(msg, data) {
			if (this.socket)
				this.socket.emit(msg, data);
		}
	});

log.spyMethods(WebController);

module.exports = WebController;
