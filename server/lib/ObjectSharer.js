// ObjectSharer - Shares the objects of a set of classes.
//
// Main building block of the distributed object support.
// Adds a mixin to these classes to monitor its objects, their fields and their methods.
// Emits events when they change.
// `SharingClient` listens to those messages to send them to remote clients.
//
// A class can be added to a sharer as either a master or a slave.
// A master class holds the master copy, and changes to it are broadcast to the clients.
// A slave class holds a copy, and changes are received from the clients.
// In practice, in a server, classes are generally masters.

// Node modules
var events = require('events');

// Shared modules
var ObjectStore = require('ObjectStore');
var log = require('Log').logger('ObjectSharer');

// The server-side `ObjectSharer` class.
var ObjectSharer = ObjectStore.subclass().name('ObjectSharer')
	.fields({
		events: null,		// Where to send / listen to events
	})
	.constructor(function(eventEmitter) {
		// Create an event source if we're not given one.
		this.events = eventEmitter || new events.EventEmitter();

		this.recordNew = true;	// add oid when recording objects that don't have one.
		this._super();
	})
	.methods({
		// --- Master ---

		// Make the objects of a class be the masters of the distributed class.
		//	- `fields` is a list of field names, or `'all'` for all fields, or `'own'` for own fields.
		//		These fields are monitored so their changes are notified to the clients.
		//	- `methods` is a list of methods, or `'all'` for all methods, or `'own'` for own methods.
		//		Remote calls to these methods can be done by the clients.
		//	- `notifyMethods` is a list of methods, or `'all'` for all methods, or `'own'` for own methods.
		//		Each method can be suffixed with `':before'` or `':after'`, overriding the `when` parameter.
		//		Calls to these methods are notified to the clients.
		//	- `when` can be omitted, or can be `'before'` or `'after'`,
		//	  to notify of method calls only before or after (default = both)
		master: function(cls, fields, methods, notifyMethods/*opt*/, when/*opt*/) {
			log.method(this, 'master', cls.className(), fields, methods);
			var sharer = this;
			var i;

			// The mixin adds a constructor to record the object and notify its creation,
			// and a `die` method to remove the object from the sharer.
			cls.mixin({
				constructor: function() {
					log.method(this, 'MIXIN CONSTRUCTOR');
					this.oid = sharer.recordObject(this);
					log.method(this, 'OID=', this.oid);
					sharer.notifyNew(this);
				},
				methods: {
					die: function() {
						var oid = sharer.removeObject(this);
						if (oid)
							sharer.notifyDie(oid);
					}
				},
			});

			// Wrap the object fields to notify when they change value.
			// `'all'` wraps all the fields (of the object's class _and_ its ancestors),
			// `'own'` wraps only the fields defined in its class.
			// Other values must be a list of field names.
			// *** Maybe we should have a value `'mixin'` to include mixin fields?
			if (fields == 'all')
				fields = cls.listFields();
			else if (fields == 'own')
				fields = cls.listOwnFields();
			if (fields)
				for (i = 0; i < fields.length; i++)
					this.wrapFieldNotify(cls, fields[i]);

			// Listen to method calls to execute them locally
			// `'all'` and `'own'` are as above, otherwise a list of methods
			// *** Maybe we should have a value `'mixin'` to include mixin methods?
			if (methods == 'all')
				methods = cls.listMethods();
			else if (methods == 'own')
				methods = cls.listOwnMethods();
			this.events.on('callMethod', function(data) {
				return this.callMethod(data.oid, data.method, data.args);
			});

			// Wrap object methods to notify when they are called
			// `'all'` and `'own'` are as above, otherwise a list of methods
			// *** Maybe we should have a value `'mixin'` to include mixin methods?
			if (notifyMethods == 'all')
				notifyMethods = cls.listMethods();
			else if (notifyMethods == 'own')
				notifyMethods = cls.listOwnMethods();
			if (notifyMethods)
				for (i = 0; i < notifyMethods.length; i++) {
					var method = notifyMethods[i].split(':');	// parse 'foo:after'
					this.wrapCallNotify(cls, method[0], method[1] || when);
				}

			// Store info about the class being shared.
			// *** Note that this assumes that the class name is unique 
			// (at least within the classes shared by this sharer). 
			// This is already necessary for the `oid`s to work.
			this.sharedClasses[cls.className()] = {
				cls: cls,
				fields: fields || [],
				methods: methods || [],
				notifyMethods: notifyMethods || [],
			};

			return this;
		},

		// Helper method to wrap a field with a function that notifies the change.
		wrapFieldNotify: function(cls, field) {
			var sharer = this;
			cls.wrapField(field, null, function(value) {
				var ret = this._set(value);
				sharer.notifySet(this, field, value);
				return ret;
			});
		},

		// Helper method to wrap a method with a function that notifies the call.
		// `when` notifies when notification takes place: before the call, after or both.
		wrapCallNotify: function(cls, method, when) {
			var sharer = this;
			var before = true, after = true;
			if (when == 'after')
				before = false;
			if (when == 'before')
				after = false;
			cls.wrap(method, function() {
				var args = [].slice.apply(arguments);
				if (before)
					sharer.notifyCall(this, method, 'before', args);
				var ret = this._inner.apply(this, arguments);
				if (after)
					sharer.notifyCall(this, method, 'after', args);
				return ret;
			});
		},

		// --- Slave ---

		// Make the objects of a class be the slaves of a distributed class.
		//	- `fields` is a list of field names, or `'all'` for all fields, or `'own'` for own fields
		//	- `methods` is a list of methods, or `'all'` for all methods, or `'own'` for own methods
		slave: function(cls, fields, methods, when) {

			// Record the description of the class.
			if (fields == 'all')
				fields = cls.listFields();
			else if (fields == 'own')
				fields = cls.listOwnFields();

			if (methods == 'all')
				methods = cls.listMethods();
			else if (methods == 'own')
				methods = cls.listOwnMethods();

			this.sharedClasses[cls.className()] = {
				cls: cls,
				fields: fields || [],
				methods: methods || [],
			};

			// Note that the handlers for the events notifying the changes are not set up here.
			// They should be set up by the client.
/*
			if (! this.events)
				return this;

			this.events.on('newObject', function(obj) {
				return this.makeObject(obj);
			});
			this.events.on('dieObject', function(oid) {
				return this.killObject(oid);
			});
			this.events.on('setField', function(data) {
				return this.setField(data.oid, data.field, data.value);
			});
			this.events.on('callMethod', function(data) {
				return this.callMethod(data.oid, data.method, data.args);
			});
			this.events.on('callNotify', function(data) {
				return this.callNotify(data.oid, data.method, data.when, data.args);
			});
*/
			return this;
		},

		// Helper method to wrap a method with a function that 
		wrapRemoteCall: function(cls, method) {
			var sharer = this;
			cls.wrap(method, function() {
				sharer.remoteCall(this, method, [].slice.apply(arguments));
				// Don't call body - or should we???
				//var ret = this._inner.apply(this, arguments);
				//return ret;
			});
		},

		// --- Send notifications ---

		// An object was created.
		notifyNew: function(obj) {
			if (! this.events) log.method(this, 'notifyNew', obj._name, 'NO EVENTS');
			if (! obj.oid) log.method(this, 'notifyNew', obj._name, 'NO OID');
			if (! this.events || ! obj.oid)
				return;
			log.method(this, 'notifyNew', obj._name, '- new', obj.oid);
			this.events.emit('newObject', this.encodeNew(obj));
		},
		// An object's `die()` method was called.
		notifyDie: function(oid) {
			if (! this.events)
				return;
			log.method(this, 'notifyDie', oid);
			this.events.emit('dieObject', oid);
		},
		// An object's field value was changed
		notifySet: function(obj, field, value) {
			if (! this.events) log.method(this, 'notifySet', obj._name, 'NO EVENTS');
			if (! obj.oid) log.method(this, 'notifySet', obj._name, 'NO OID');
			if (! this.events || ! obj.oid)
				return;
			log.method(this, 'notifySet', obj._name, '-', obj.oid+'.'+field, '=', value);
			this.events.emit('setField', {
				oid: obj.oid,
				field: field,
				value: this.encode(value),
			});
		},
		// An object's method was called.
		notifyCall: function(obj, method, when, args) {
			if (! this.events || ! obj.oid)
				return;
			log.method(this, 'notifyCall', when, obj._name, '-', obj.oid+'.'+method, '(', args, ')');
			this.events.emit('callNotify', {
				oid: obj.oid,
				method: method,
				when: when,
				args: this.encode(args),
			});
		},
		// We want to call a remote object method.
		remoteCall: function(obj, method, args) {
			if (! this.events || ! obj.oid)
				return;
			log.method(this, 'remoteCall', obj._name, '-', obj.oid+'.'+method, '(', args, ')');
			this.events.emit('callMethod', {
				oid: obj.oid,
				method: method,
				args: this.encode(args),
			});
		},

		// --- Send / handle events ---

		// Add listener
		on: function(msg, listener) {
			if (this.events)
				this.events.on(msg, listener);
		},

		// Remove a listener.
		// Note that if `listener` is null, all listeners for `msg` are removed.
		// If `msg` is also null, all listeners are removed.
		off: function(msg, listener) {
			if (this.events)
				if (listener)
					this.events.removeListener(msg, listener);
				else
					this.events.removeAllListeners(msg);
		},

		// Emit an event.
		emit: function(msg, data) {
			if (this.events)
				this.events.emit(msg, data);
		}
	})
;

log.spyMethods(ObjectSharer);

module.exports = ObjectSharer;
