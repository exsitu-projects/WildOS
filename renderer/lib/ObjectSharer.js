// ObjectSharer - Shares the objects of a set of classes.
//
// This is a simplified version of the server's `ObjectSharer` class,
// because we do not need to support master classes here.
// (Essentially, we removed `master` and related methods).
//
// This is the main building block of the distributed object support.
// It modifies classes to be able to create their objects, change their
// properties and call their methods through events received from a server.
// `SharingServer` implements the server itself.
//

// Shared modules
var OO = require('OO');
var log = require('Log').logger('ObjectSharer');

// The client-side `ObjectSharer` class.
var ObjectSharer = OO.newClass().name('ObjectSharer')
	.classFields({
		nextId: 1,
	})
	.fields({
		objects: {},		// Set of objects being monitored.
		server: null,		// Where to send / listen to events
		sharedClasses: {},	// The set of classes being shared
	})
	.constructor(function() {
		// Assign a unique name to the object (assuming class names are unique).
		this._name = this.className()+'_'+(ObjectSharer.nextId++);
	})
	.methods({
		// Give a name to the object to facilitate debugging.
		name: function(name) {
			this._name = name;	// `_name` property is also used by logging
			return this;
		},

		// --- Slave ---
		// This is almost identical to the slave section of the server version of `ObjectSharer`.
		// Differences are pointed out.

		// Make the objects of a class be the slaves of a distributed class.
		//	- `fields` is a list of field names that are shared, or `'all'` for all fields, or `'own'` for own fields
		//	- `methods` is a list of methods that are called remotely, or `'all'` for all methods, or `'own'` for own methods
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
			if (methods)
				for (i = 0; i < methods.length; i++) {
					var method = methods[i];
					this.wrapRemoteCall(cls, method);
				}

			this.sharedClasses[cls.className()] = {
				cls: cls,
				fields: fields || [],
				methods: methods || [],
			};
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
			// Since all objects are received, unlike on the server side,
			// we do not assign an oid if there isn't one.
			if (! obj.oid) {
				log.warn.method(this, 'recordObject', '- missing oid');
				return null;
			}
			log.method(this, 'recordObject', obj.oid, 'sharer', this._name);
			this.objects[obj.oid] = obj;
			return obj.oid;
		},

		// Remove an object from the object store.
		removeObject: function(obj) {
			var oid = obj.oid;
			log.method(this, 'removeObject', oid, 'sharer', this._name);
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

		// The server-side version has `encodeNew`, which we do not need.

		// Decode values received from a client into actual values
		decode: function(value) {
			// Simple value: as is.
			if (!value || typeof(value) != 'object')
				return value;

			// An object with an `oid` property: one of our objects.
			// *** Should we request it if we don't have it?
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
		// This section exists on the server side but we do not need it here.

		// --- Local execution ---
		// These are typically triggered when receiving events.

		remoteCall: function(obj, method, args) {
			log.method(this, 'remoteCall', obj.oid+'.'+method, '(',this.encode(args),')');
			if (! this.server || ! obj.oid)
				return;
			this.server.emit('callMethod', {
				oid: obj.oid,
				method: method,
				args: this.encode(args),
			});
		},

		// Create an object.
		makeObject: function(obj) {
			if (! obj.oid)
				return null;
			var object = this.objects[obj.oid];
			if (object) {
				// Object already exists.
				log.method(this, 'makeObject', '- returned existing object ', object);
				// Update its state with the received object.
				object.set(obj);
				return this.objects[obj.oid];
			}
			// Parse object id to extract class name
			var match = obj.oid.match(/^(.*)_[0-9]+$/);
			if (match && match[1]) {
				var clinfo = this.sharedClasses[match[1]];
				// If we find the class, find or create the object.
				if (clinfo) {
					/*** hack for Apps ***/
					if (clinfo.cls.findObject)
						object = clinfo.cls.findObject(obj.oid, obj);
					if (!object)
					/*** end hack ***/
					object = clinfo.cls.create(obj);
				}
				// If we have a new object, record it.
				if (object) {
					object.oid = obj.oid;
					this.recordObject(object);
				}
			}
			return object;
		},

		// 'Kill' an object, i.e. remove it from the object list.
		// Return true if it was indeed found and removed.
		killObject: function(oid) {
			var obj = this.getObject(oid);
			if (!obj) log.method(this, 'killObject', oid, '- object not found');
			if (!obj)
				return false;
			this.removeObject(obj);
			// Notify the object.
			if (obj.die)
				obj.die();
			return true;
		},

		// Set the value of an object field.
		// Return true if the object was found and the field was set.
		setField: function(oid, field, value) {
			var obj = this.getObject(oid);
			if (!obj) log.method(this, 'setField', oid+'.'+field, '- object not found');
			if (!obj)
				return false;
			// Check that `field` belongs to the list of shared fields.
			var cls = obj.classs();
			if (this.sharedClasses[cls.className()].fields.indexOf(field) < 0) {
				log.method(this, 'setField', oid+'.'+field, '- field not found');
				return false;
			}
			obj[field] = this.decode(value);
			return true;
		},

		// Call an object method.
		// Return true if the object was found and the method was called.
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
		// Return true if the object was found and the method was called.
		callNotify: function(oid, method, when, args) {
			var obj = this.getObject(oid);
			if (!obj) log.method(this, 'callNotify', oid+'.'+method, '- object not found');
			if (!obj)
				return false;
			// Check if the method exists.
			var cls = obj.classs();
			var m = cls.getMethod(method+'_'+when);
			if (m)
				m.apply(obj, this.decode(args));
			return true;
		},

		// Request an object from the server.
		// This method does not exist on the server-side version,
		// because the server never requests objects.
		requestObject: function(oid) {
			for (var i = 0; i < this.sharers.length; i++) {
				var obj = this.sharers[i].getObject(oid);
				if (obj)
					return obj;
			}
			if (this.server)
				this.server.emit('getObject', oid);
			return null;
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

		// The server-side version has methods `on`, `off`, `emit`
		// that we do not have here.
	})
;

log.spyMethods(ObjectSharer);

module.exports = ObjectSharer;
