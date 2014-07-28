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
var OO = require('OO');
var log = require('Log').logger('ObjectSharer');

// The server-side `ObjectSharer` class.
var ObjectSharer = OO.newClass().name('ObjectSharer')
	.classFields({
		nextId: 1,
	})
	.fields({
		objects: {},		// Set of objects being monitored.
		events: null,		// Where to send / listen to events
		sharedClasses: {},	// The set of classes being shared
	})
	.constructor(function(eventEmitter) {
		// Create an event source if we're not given one.
		this.events = eventEmitter || new events.EventEmitter();
		log.newObject(this);
	})
	.methods({
		// Give a name to the object to facilitate debugging.
		name: function(name) {
			this._name = name;	// `_name` property is also used by logging
			return this;
		},

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

		// --- Manage the object store ---

		// Add an object to the object store.
		// If the object does not have an `oid`, it is added to it.
		// The `oid` is used to communicate object identites with the client.
		recordObject: function(obj) {
			// For the object id, we use the _name property set by the logger, if available
			if (! obj.oid)
				obj.oid = obj._name || (obj.className()+'_'+(ObjectSharer.nextId++));
			log.method(this, 'recordObject', obj.oid);
			this.objects[obj.oid] = obj;
			return obj.oid;
		},

		// Remove an object from the object store.
		removeObject: function(obj) {
			var oid = obj.oid;
			log.method(this, 'removeObject', oid);
			if (oid) {
				delete this.objects[oid];

			}
			return oid;
		},

		// Find an object in the object store.
		getObject: function(oid) {
			return this.objects[oid];
		},

		// Turn an arbitrary value into a literal object or array that can be sent to the client.
		encode: function(value) {
			// Simple value: as is.
			if (!value || typeof(value) != 'object')
				return value;

			// One of our objects: use the `oid`.
			if (value.oid && this.objects[value.oid])
				return {oid: value.oid};

			// Array: recurse over its elements.
			if (value instanceof Array) {
				res = [];
				for (var i = 0; i < value.length; i++)
					res[i] = this.encode(value[i]);
				return res;
			}

			// Other object: recurse over its properties.
			res = {};
			for (var field in value)
				res[field] = this.encode(value[field]);
			return res;
		},

		// Encode an object so it can be sent to the client.
		encodeNew: function(obj) {
			var object = {
				oid: obj.oid,
			};
			var sharedClasses = this.sharedClasses[obj.className()];
			if (! sharedClasses || ! sharedClasses.fields)
				return object;
			for (var i = 0; i < sharedClasses.fields.length; i++) {
				var field = sharedClasses.fields[i];
				object[field] = this.encode(obj[field]);
			}
			return object;
		},

		// Decode values received from a client into actual values
		decode: function(value) {
			// Simple value: as is.
			if (!value || typeof(value) != 'object')
				return value;

			// An object with an `oid` property: one of our objects.
			if (value.oid && this.objects[value.oid])
				return this.objects[value.oid];

			// An array: recurse over its elements.
			if (value instanceof Array) {
				res = [];
				for (var i = 0; i < value.length; i++)
					res[i] = this.decode(value[i]);
				return res;
			}

			// Other object: recurse over its properties.
			res = {};
			for (var field in value)
				res[field] = this.decode(value[field]);
			return res;
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

		// --- Local execution ---
		// These are typically triggered when receiving events.

		// Create an object.
		// *** Note: the client-side version is quite different.
		// *** Since this is not used in the server, the client version may be more up to date.
		makeObject: function(obj) {
			if (! obj.oid)
				return null;
			log.method(this, 'makeObject', obj);
			if (this.objects[obj.oid]) {
				// Object already exists.
				log.method(this, 'makeObject', '- returning existing object', this.objects[obj.oid]);
				return this.objects[obj.oid];
			}
			// Parse object id to extract class name
			var match = obj.oid.match(/^(.*)_[0-9]+$/);
			if (match && match[1]) {
				var clinfo = this.sharedClasses[match[1]];
				if (clinfo)
					return clinfo.cls.create(obj);
			}
			return null;
		},

		// 'Kill' an object, i.e. remove it from the object list.
		// *** Object should probably be notified
		killObject: function(oid) {
			var obj = this.getObject(oid);
			if (!obj) log.method(this, 'killObject', oid, '- object not found');
			if (!obj)
				return;
			this.removeObject(obj);
			// Notify the object.
			if (obj.die)
				obj.die();
		},

		// Set the value of an object field.
		setField: function(oid, field, value) {
			var obj = this.getObject(oid);
			if (!obj) log.method(this, 'setField', oid+'.'+field, '- object not found');
			if (!obj)
				return;
			// Check that `field` belongs to the list of shared fields.
			var cls = obj.classs();
			if (this.sharedClasses[cls.className()].fields.indexOf(field) < 0) {
				log.method(this, 'setField '+oid+'.'+field+': field not found');
				return;
			}
			obj[field] = this.decode(value);
		},

		// Call an object method.
		callMethod: function(oid, method, args) {
			var obj = this.getObject(oid);
			if (!obj) log.method(this, 'callMethod', oid+'.'+method, '- object not found');
			if (!obj)
				return false;
			// Check that method belongs to the list of shared methods.
			var cls = obj.classs();
			if (this.sharedClasses[cls.className()].methods.indexOf(method) < 0) {
				log.method(this, 'callMethod', oid+'.'+method, '- method not found');
				return false;
			}
			var m = cls.getMethod(method);
			if (!m) {
				log.method(this, 'callMethod', oid+'.'+method, '- method not defined');
				return false;
			}
			m.apply(obj, this.decode(args));
			return true;
		},

		// Call an object method. 
		// Unlike `callMethod`, the method does not have to be in the list of allowed methods.
		callNotify: function(oid, method, when, args) {
			var obj = this.getObject(oid);
			if (!obj) log.method(this, 'callNotify', oid+'.'+method, '- object not found');
			if (!obj)
				return;
			// Check if the method exists.
			var cls = obj.classs();
			var m = cls.getMethod(method+'_'+when);
			if (m)
				m.apply(obj, this.decode(args));
		},

		// Call `f` for all shared objects. By default `f` is called with each object, however:
		//	- if `how` is `'oid'`, `f` is passed the object's `oid`
		//	- if `how` is `'encode'`, `f` is passed `encodeNew(o)`
		allObjects: function(how /*opt*/, f) {
			if (typeof(how) != 'string') {
				f = how;
				how = 'obj';
			}
			var oid;
			switch (how) {
				case 'oid':
					for (oid in this.objects)
						f(oid);
					break;
				case 'encode':
					for (oid in this.objects)
						f(this.encodeNew(this.objects[oid]));
					break;
				default:
					for (oid in this.objects)
						f(this.objects[oid]);
			}
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
