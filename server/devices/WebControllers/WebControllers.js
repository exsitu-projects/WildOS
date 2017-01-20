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
			/*this.window = */this.createUI();
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
			log.enter(this, 'createUI');
			var platform = this.findAncestor({type: 'Platform'});
			var gui = platform.GUI.getGUI();
			if (! gui)
				return null;

			var url = '../content/qrcode.html'; // relative to the lib folder
			var hostname = this.config.hostname || os.hostname();
			var port = platform.serverPort;
			var self = this;

			log.message('opening window', url, hostname, port);
			var win = gui.Window.open(url, { 
				show: false,		// We can't set the position here so we hide the window and it positions and shows itself
				width: 210,
				height: 290,
				resizable: false,				
			}, function (win) { 
				log.message('QRcode window created', url); 
				self.window = win;
				win.window.onload = function() {
					log.message('QRcode window loaded', hostname, port); 
					win.window.setAddress(hostname, port);
				};
			});
			log.exit(this, 'createUI');
			return win;
		},
	});

log.spyMethods(WebControllers);

module.exports = WebControllers;
