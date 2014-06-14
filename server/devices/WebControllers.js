// WebControllers - a set of devices running a web browser and socket.io
//

// Node modules
var os = require('os');

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// Internal modules.
var Device = require('../lib/Device');

// The `WebControllers` class
var WebControllers = Device.subclass().name('WebControllers')
	.fields({
	})
	.constructor(function(config, options, events) {
		this._super(config, options, events);
		if (options)
			this.set(options);

		// Notify of creation and availability
		this.deviceCreated();
		this.deviceAvailable();

		// The window showing the QR code
		this.window = this.createUI();
	})
	.methods({
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
			var gui = process.mainModule.exports.gui;
			var url = '../content/qrcode.html#'+os.hostname()+':8080';	// URL is relative to the lib folder
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
		this.deviceAvailable();
	})
	.methods({
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

module.exports = WebControllers;
