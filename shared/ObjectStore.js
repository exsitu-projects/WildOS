// ObjectStore - Manages a store of objects and remote access to it.
//
// An object store manages a set of objects identified by a unique oid (object identifier).
// It can create, set field values and call methods of the stored objects through their oid.
// It is used typically to manage remote access to the objects from a client.
//
// The fields and methods that are accessible in this way are specified in the `sharedClasses`
// object, indexed by class name. Each entry in this object should have these properties:
// - `cls`: the Classy object representing the object class;
// - `methods`: an array listing the names of the accessible methods;
// - `fields`: an array listing the names of the accessible fields.
//
// Note that the `fields` array is also used to determine which state is communicated
// to the client when encoding the object.
//

// Shared modules
var OO = require('./OO');
var log = require('./Log').logger('ObjectStore');

// The `PendingObject` class.
// Objects that are referenced but not in the object store.
// Clients can attach listeners to them to be notified when they are resolved.
var PendingObject = OO.newClass().name('PendingObject')
	.fields({
		isPendingObject: true,
		oid: null,
		listeners: [],
	})
	.constructor(function(oid) {
		log.enter(this, 'create', oid);
		this.oid = oid;
		log.exit(this, 'create');
	})
	.methods({
		onResolved: function(f) {
			this.listeners.push(f);
		},

		offResolved: function(f) {
			var idx = this.listeners.indexOf(f);
			if (idx >= 0)
				this.listeners.splice(idx, 1);
		},

		resolved: function(obj) {
			log.enter(this, 'resolved', this.oid, obj);
			this.listeners.forEach(function(listener) {
				listener(obj);
			});
			this.listeners = [];
			log.exit(this, 'resolved');
		}
	})
;
log.spyMethods(PendingObject);

// The `ObjectStore` class.
var ObjectStore = OO.newClass().name('ObjectStore')
	.classFields({
		nextId: 1,
	})
	.fields({
		objects: {},		// Set of objects being stored.
		pending: {},		// Set of objects referenced but not in the store.
		sharedClasses: {},	// The set of classes whose objects are in the store.
		recordNew: false,	// Whether objects without an oid should be recorded or not.
	})
	.constructor(function() {
		// Assign a unique name to the object (assuming class names are unique).
		this._name = this.className()+'_'+(ObjectStore.nextId++);

		log.newObject(this);
	})
	.methods({
		// Give a name to the object to facilitate debugging.
		name: function(name) {
			this._name = name;	// `_name` property is also used by logging
			return this;
		},

		// --- Manage the object store ---

		// Add an object to the object store and return its oid.
		// If the object does not have an oid, it is assigned one if `recordNew` is true,
		// otherwise a warning is issued.
		// The oid is used to communicate object identites with clients.
		recordObject: function(obj) {
			if (! obj.oid) {
				if (this.recordNew) {
					obj.oid = obj._name || (obj.className()+'_'+(ObjectStore.nextId++));
				} else {
					log.warn.method(this, 'recordObject', '- missing oid');
					return null;
				}
			}
			log.method(this, 'recordObject', obj.oid, 'store', this._name);
			this.objects[obj.oid] = obj;

			// If the object was pending, call the listeners if any, 
			// and remove it from the pending list
			if (this.pending[obj.oid]) {
				this.pending[obj.oid].resolved(obj);
				delete this.pending[obj.oid];
			}

			return obj.oid;
		},

		// Remove an object from the object store.
		removeObject: function(obj) {
			var oid = obj.oid;
			log.method(this, 'removeObject', oid, 'store', this._name);
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
			var res;
			if (value instanceof Array) {
				res = [];
				for (var i = 0; i < value.length; i++)
					res.push(this.encode(value[i]));
				return res;
			}

			// Other object: recurse over its properties.
			res = {};
			for (var field in value)
				res[field] = this.encode(value[field]);
			return res;
		},

		// Encode an object so it can be sent to a client.
		// This is typically used when sending a new object to a client.
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

		// Decode values received from a client into actual values.
		decode: function(value) {
			var res = null;

			// Simple value: as is.
			if (!value || typeof(value) != 'object')
				return value;

			// An object with an `oid` property: one of our objects.
//			if (value.oid && this.objects[value.oid])
//				return this.objects[value.oid];
			if (value.oid) {
				res = this.objects[value.oid];
				// Record pending objects
				if (! res) {
					res = this.pending[value.oid];
					if (! res)
						res = this.pending[value.oid] = PendingObject.create(value.oid);
				}
				return res;
			}

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

		// --- Local execution ---
		// These are typically triggered when receiving events.

		// Create an object.
		makeObject: function(obj) {
			if (! obj.oid)
				return null;

			// Look up object
			var object = this.objects[obj.oid];
			var field;
			
			if (object) {
				// Object already exists.
				log.method(this, 'makeObject', '- returned existing object ', object);

				// Decode received state
				for (field in obj)
					obj[field] = this.decode(obj[field]);

				// Update object with received state
				object.set(obj);
				return this.objects[obj.oid];
			}

			// Object was not found: try to create it.

			// Parse object id to extract class name
			var match = obj.oid.match(/^(.*)_[0-9]+$/);
			if (match && match[1]) {
				var clinfo = this.sharedClasses[match[1]];

				// If we find the class, find or create the object.
				if (clinfo) {
					// Decode object fields
					for (field in obj)
						obj[field] = this.decode(obj[field]);

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
		// *** Object should probably be notified
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
		// Return a result object if the object was found and the method was called, false otherwise.
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
			// Return an object to distinguish from returning 'false' above.
			return {
				result: m.apply(obj, this.decode(args)),
			};
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
	})
;

log.spyMethods(ObjectStore);

module.exports = ObjectStore;
