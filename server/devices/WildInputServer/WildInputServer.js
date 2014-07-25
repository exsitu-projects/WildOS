// WildInputServer - a device that connects to the WILD Input Server with websockets
//
// Config options:
//		host, port, path: elements for the WIS websocket url
//			host defaults to 'localhost', port to 8025 and path to 'icon'.
//		url: alternative to above options, should be of the form 'ws://<host>:<port>/<path>'
//		devices: the list of devices to monitor. 
//			"devices": { "pointer": {
//					"type": "WISDevice",
//					"path": "laserpointer",
//					"fields": {"x": 0, "y": 0}
//				}
//			}
//			The name ("pointer") is used as name of the device unless the descriptor has a "name" property.
//			The "type" property is the class of the object representing the device. It defaults to "WISDevice".
//			The "path" property is the path to add to the WIS websocket connection to access the device. It defaults to the device name.
//			The "fields" property is the set of properties that are tracked by the device. If undefined, all fields are tracked.
//			They are initialized to the specified values and should correspond to fields sent by the WIS for this device.
//			Note that fields that are object literals (i.e., declared as, e.g., "pos.x" in WIS) are not supported.
//			When the state of a device changes, the "WISDeviceChanged" method is called.
//			By default, i.e. in the WISDevice class, this method sends a `WISDeviceChanged` event.
//
// *** should we also support an array with "name" fields for the devices ?
// *** should we add a "changesOnly" property to only send events when the state actually changes ?
// *** should we support some kind of timeout to declare the device unavailable if an event is not received within n ms?
// *** should we support a throttle property to avoid sending events too quickly?
//
// *** need to add a section in the platform UI to display the devices and their states

// Node modules
var WebSocket = require('ws');

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// Internal modules.
var Device = require('../lib/Device');

// The `WildInputServer` class.
// Manages a set of `WISDevice` objects, as declared in the config file.
var WildInputServer = Device.subclass().name('WildInputServer')
	.fields({
		websocketURL: null,
	})
	.constructor(function(config, options, events) {
		this._super(config, options, events);
		if (options)
			this.set(options);

		var host = this.config.host || 'localhost';
		var port = this.config.port || 8025;
		var path = this.config.path || 'icon';
		this.websocketURL = this.config.url || 'ws://'+host+':'+port+'/'+path;

		// Notify of creation
		this.deviceCreated();
	})
	.methods({
		added: function() {
			for (var devName in this.config.devices) {
				var devDescr = this.config.devices[devName];
				var devClass = devDescr.type || "WISDevice";
				var devPath = devDescr.path || devName;
				// *** find device class (currently always WISDevice)
				this.addDevice(WISDevice.create({
					name: devName,
					path: devPath,
					fields: devDescr.fields,
				}));
			}

			this.deviceAvailable();
		},
	});

log.spyMethods(WildInputServer);

// The `WISDevice` class.
// Represents devices of the Wild Input Server.
// Emits `WISDeviceChanged` events when the state of the input device changes.
var WISDevice = Device.subclass().name('WISDevice')
	.fields({
	})
	.constructor(function(config, options, events) {
		this._super(config, options, events);
		if (options)
			this.set(options);

		this.WIS = null;
		this.websocketURL = null;

		// Initialize device state
		for (var field in this.config.fields) {
			this[field] = this.config.fields[field];
		}

		// Notify of creation
		this.deviceCreated();
	})
	.methods({
		// Called when the device is added to its parent.
		// Open the connection to the proper channel of the Wild Input Server.
		added: function() {
			this.websocketURL = this.parent.websocketURL + '/' + this.config.path;

			this.open();
		},

		// Connect to the Wild Input Server and monitor device state.
		open: function() {
			if (this.WIS)
				return;

			// Connect to WIS
			this.WIS = new WebSocket(this.websocketURL);

			var self = this;
			this.WIS.on('open', function() {
				log.event(self, 'open');
				self.deviceAvailable();
			});
			this.WIS.on('error', function() {
				log.event(self, 'error');
				self.close();
			});
			this.WIS.on('close', function() {
				log.event(self, 'close');
				self.deviceUnavailable();
				self.WIS = null;
			});
			this.WIS.on('message', function(data, flags) {
				log.event(self, 'message', data);
				if (flags && flags.binary)
					return;	// ignore binary messages - just in case
				self.WISDeviceChanged(JSON.parse(data));
			});
		},

		// Close connection to the Wild Input Server
		close: function() {
			if (this.WIS) {
				this.WIS.close();
				this.WIS = null;
				this.deviceUnavailable();
			}
		},

		// Called when receiving a message from the Wild Input Server.
		// Update device state and notify change by sending an event if the state changed
		WISDeviceChanged: function(data) {
			var changed = false;
			for (var field in data.values) {
				if (!this.config.fields || field in this.config.fields /* && this[field] !== data[field] */) {
					this[field] = data.values[field];
					changed = true;
				}
			}

			if (changed)
				this.emit('WISDeviceChanged');
		},

		// Shortcut to set up a handler for a `WISDeviceChanged` event.
		onWISDeviceChanged: function(cb) {
			return this.on('WISDeviceChanged', cb);
		},

	});

log.spyMethodsExcept(WISDevice, ['message']);

module.exports = WildInputServer;
