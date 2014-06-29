// Device - a generic device
//
// A device has:
//	a `name`, specified in the configuration object (or generated as <DeviceClass>_<nn>)
//	a `parent` device (null for the root)
//	a set of `devices` that it controls (can be empty)
//
// A device is created from a configuration object (`config`),
//	an optional set of values (`options`), and an event source (`events`).
//
// A device emits 4 events:
//	`deviceCreated` and `deviceDeleted` when the object is created / destroyed
//	`deviceAvailable` and `deviceUnavailable` when the device goes "online/offline"
//
// Subclasses must register with the Device class for the `addDevices` method to work:
//	`addDevices` walks the configuration object to find properties that
//	describe children devices and create them. For this to work:
//		- the type of the subdevice must be the name of the class representing it, e.g.
//				`type: 'Foo',`
//		- the class whose name is `'Foo'`, e.g. `TheClassFoo` must have been registerd:
//			`var TheClassFoo = Device.subclass().name('Foo');`
//			`Device.addClass(TheClassFoo);`
//		Note that unlike this example, it is good practice for the class to have the same name
//		as the variable holding it: 
//			`var Foo = Device.subclass().name(Foo);`
//			`Device.addClass(Foo);`
//

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// The `Device` class.
var Device = OO.newClass().name('Device')
	.fields({
		name: null,		// device name
		config: null,	// config record
		options: null,	// options record
		events: null,	// event emitter
		parent: null,	// parent device (can be null)
		devices: [],	// children devices (can be empty)
	})
	.classFields({
		classes: {},		// record device classes
	})
	.classMethods({
		// Record a new device class.
		addClass: function(classs) {
			var cname = classs.className();
			this.classes[cname] = classs;
		},

		// Get the class from the class name
		getClass: function(className) {
			return this.classes[className];
		},
	})
	.constructor(function(config, options, eventEmitter) {
		log.newObject(this);

		// Copy dir/file info from config record to object
		if (config.__dirname) this.__dirname = config.__dirname;
		if (config.__filename) this.__filename = config.__filename;

		// Record the parameters.
		this.config = config;
		this.options= options || {};
		this.events = eventEmitter;

		// make sure a device has a name
		if (config.name)
			this.name = config.name;
		else
			this.name = this._name;	// *** set by log.newObject !!!

		// Subclass constructors may want to call:
		//	this.set(options);
		//	this.deviceCreated();
		//	this.addDevices();
	})
	.methods({
		// Return the config file directory and file name.
		// Since these typically exist only for the root device, walk up the chain.
		dirname: function() {
			var res = this.__dirname;
			var obj = this;
			while (!res && obj) {
				obj = obj.parent;
				if (obj) res = obj.__dirname;
			}
			return res;
		},
		filename: function() {
			var res = this.__filename;
			var obj = this;
			while (!res && obj) {
				obj = obj.parent;
				if (obj) res = obj.__filename;
			}
			return res;
		},

		// Create a new device from a config
		makeDevice: function(config, options) {
			// Check if the class is already loaded.
			var deviceClass = Device.getClass(config.type);
			if (!deviceClass) {
				// Otherwise try to load it.
				try {
					deviceClass = require('../devices/'+config.type);
					// Register it.
					Device.addClass(deviceClass);
				} catch(e) {
					log.warn.method(this, 'makeDevice', '- could not load device class', config.type, '-', e);
				}
			}
			// Create the device.
			var device = null;
			if (deviceClass)
				device = deviceClass.create(config, options, this.events);
			return device;
		},

		// Called when a device is added.
		// Subclasses can redefine / extend.
		// By default it does nothing.
		added: function() {
			// nothing
		},

		// Add a child device.
		addDevice: function(device) {
			if (device) {
				this.devices.push(device);
				device.parent = this;
				device.added();
			}
			return device;
		},

		// Add the devices specified in the config record.
		// All properties of the config record are looked up.
		// Any property that is an object with a `type` property
		// is considered a device and loaded.
		addDevices: function() {
			for (var prop in this.config) {
				// Skip predefined properties.
				if (['type', 'name', 'inherit', 'basedOn', 'UI'].indexOf(prop) >= 0)
					continue;

				var config = this.config[prop];
				if (config && config.type) {
					// Looks like a legit device descriptor.
					this.addDevice(this.makeDevice(config, this.options[prop]));
				}
			}
			return this;
		},

		// Called when a device is removed.
		// Subclasses can redefine / extend.
		// By default it sends a `deviceDeleted` event.
		removed: function(parent) {
			this.deviceDeleted();
		},

		// Remove a child device.
		removeDevice: function(device) {
			if (device) {
				var i = this.devices.indexOf(device);
				if (i >= 0) {
					this.devices.splice(i, 1);
					device.parent = null;
					device.removed(this);
				}
			}
			return device;
		},

		// Remove all the children devices.
		removeDevices: function() {
			this.mapDevices(function(device) {
				device.parent = null;
				device.removed(this);
			});
			this.devices = [];
		},

		// Call `f` for all child devices.
		mapDevices: function(f) {
			for (var i = 0; i < this.devices.length; i++)
				f(this.devices[i], i);
		},

		// Return true if this devices matches the options in `o`.
		matches: function(o) {
			for (var p in o)
				if (o[p] !== this.config[p])
					return false;
			return true;
		},

		// Find the first child device matching the properties in `o`.
		findDevice: function(o) {
			for (var i = 0; i < this.devices.length; i++) {
				var device = this.devices[i];
				if (device.matches(o))
					return device;
			}
			return null;
		},

		// Find the first device up the chain (including this one) matching the properties in `o`.
		findAncestor: function(o) {
			var device = this;
			while (device) {
				if (device.matches(o))
					return device;
				device = device.parent;
			}
			return null;
		},

		// Managing events.
		// Devices send 4 events:
		//	- `deviceCreated` when the device object is created (but not necessarily the subdevices)
		//	- `deviceAvailable` when the device is ready and, when the device has a physical counterpart,
		//	  when the physical device is up and running
		//	- `deviceUnavailable` when the device becomes unusable, e.g. when the physical device
		//	  is turned off or removed
		//	- `deviceDeleted` when the device is removed from its parent

		// Emit an event.
		emit: function(event) {
			if (this.events)
				this.events.emit(event, this);
			return this;
		},

		// Emit the predefined events.
		deviceCreated    : function() { return this.emit('deviceCreated'    );},
		deviceAvailable  : function() { return this.emit('deviceAvailable'  );},
		deviceUnavailable: function() { return this.emit('deviceUnavailable');},
		deviceDeleted    : function() { return this.emit('deviceDeleted'    );},

		// Set event handlers
		on: function(event, cb) {
			var self = this;
			if (this.events)
				this.events.on(event, function(device) {
					log.eventEnter(self, event, 'for device', device.name);
					cb(device);
					log.eventExit(self, event);
				});
			return this;
		},

		// Set event handlers for the predefined events.
		onDeviceCreated     : function(cb) { return this.on('deviceCreated', cb    ); },
		onDeviceAvailable   : function(cb) { return this.on('deviceAvailable', cb  ); },
		onDeviceUnavailable : function(cb) { return this.on('deviceUnavailable', cb); },
		onDeviceDeleted     : function(cb) { return this.on('deviceDeleted', cb    ); },

	});

log.spyMethodsExcept(Device, ['filename', 'dirname']);

module.exports = Device;
