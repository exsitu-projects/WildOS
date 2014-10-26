// WebControllers - a set of devices running a web browser and socket.io
//
// Configuration properties:
//	- "hostname": the host name to use in the URL. Defaults to `os.hostname()`

// Node modules
var os = require('os');

// Shared modules
var log = require('Log').logger('WebControllers');

// Internal modules
var Device = require('../../lib/Device');

// Local modules
var WebController = require('./WebController');

// The `WebControllers` class
var WebControllers = Device.subclass().name('WebControllers')
	.fields({
	})
	.constructor(function(config, options, events) {
		this._super(config, options, events);
		if (options)
			this.set(options);

		// Notify of creation
		this.deviceCreated();
	})
	.methods({
		// Called when the device is added to the device tree
		added: function() {
			// Notify of availability
			this.deviceAvailable();

			// Create the window showing the QR code
			this.window = this.createUI();
		},

		// Callback when a new client has successfully connected.
		clientConnected: function(socket, server, clientInfo) {
			this.addDevice(WebController.create(socket, server, clientInfo));
		},

		// Send a message to all connected devices
		emit: function(msg, data) {
			this.mapDevices(function(device) {
				device.emit(msg, data);
			});
		},

		//
		createUI: function() {
			var platform = this.findAncestor({type: 'Platform'});
			var gui = platform.GUI.getGUI();
			if (! gui)
				return null;

			var hostname = this.config.hostname || os.hostname();
			var url = '../content/qrcode.html#'+hostname+':'+platform.serverPort;	// URL is relative to the lib folder
			// We can't set the position here so we hide the window and it positions and shows itself
			var win = gui.Window.open(url, {
				show: false,
				width: 210,
				height: 260,
				toolbar: false,
				resizable: false,				
			});
			return win;
		},
	});

log.spyMethods(WebControllers);

module.exports = WebControllers;
