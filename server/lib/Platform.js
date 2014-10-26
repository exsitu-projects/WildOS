// Platform - a hierarchy of devices
//
// A platform represents the various equipments available, typically in a room.
// It is described by a configuration file (a json file).
//
// Once the platform is initialized, the following properties are set:
//	- apps: App class, to access loaded apps
//	- program: program arguments
//	- menu: menubar
//	- window: platform control window


// Shared modules
var log = require('Log').logger('Platform');

// Internal modules
var Device = require('./Device');

// The `Platform` class.
var Platform = Device.subclass().name('Platform')
	.constructor(function(config, options, events) {
		this._super(config, options, events);
		if (options)
			this.set(options);

		if (config.serverPort)
			this.serverPort = config.serverPort;
	})
	.methods({
		// Notify that the platform object is created,
		// add the component devices to it, and notify that the platform is available
		addDevices: function() {
			this.deviceCreated();
			this._super();
			this.deviceAvailable();
		},

		// Callback when a new client connects/disconnects.
		// Find a matching device and if so notify it.
		// The device can register itself to the server with be notified of the disconnection
		clientConnected: function(socket, server, clientInfo) {
			var device = this.findDevice(clientInfo.device);
			if (device)
				device.clientConnected(socket, server, clientInfo);
			return device;
/*
			this.mapDevices(function(device) {
				if (device.clientConnected)
					device.clientConnected(socket, server);
			});
*/
		},
		clientDisconnected: function(socket, server) {
			this.mapDevices(function(device) {
				if (device.clientDisconnected)
					device.clientDisconnected(socket, server);
			});
		},

		// Start/Stop/Restart the platform.
		// Emits an event that devices can listen to.
		start: function() {
			log.method(this, 'start');
			this.emit('start');
		},
		stop: function() {
			log.method(this, 'stop');
			this.emit('stop');
		},
		restart: function() {
			log.method(this, 'restart');
			this.emit('restart');
		},

		// Shudown the platform.
		// Emits a 'shutdown' events that devices can listen to.
		shutdown: function() {
			log.method(this, 'shutdown');
			this.emit('shutdown');
		},
	});

log.spyMethods(Platform);

module.exports = Platform;
