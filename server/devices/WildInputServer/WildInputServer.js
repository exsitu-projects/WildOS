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

// Shared modules
var log = require('Log').logger('WildInputServer');

// Internal modules
var Device = require('../../lib/Device');

// Local modules
var WISDevice = require('./WISDevice');

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

module.exports = WildInputServer;
