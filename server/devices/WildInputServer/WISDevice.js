// WISDevice - a physical device managed by the WILD Input Server
//

// Shared modules
var log = require('Log').logger('WISDevice');

// Internal modules
var Device = require('../../lib/Device');

// Node modules
var WebSocket = require('ws');

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

log.spyMethodsExcept(WISDevice, []);//'WISDeviceChanged']);

module.exports = WISDevice;
