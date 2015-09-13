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
	.classFields({
		pendingId: 0,		// Counter to generate continuation ids		
	})
	.fields({
		events: null,		// Where to send / listen to events
		pendingResults: {},	// Continuations for remote function calls awaiting their response
	})
	.constructor(function(eventEmitter) {
		// Create an event source if we're not given one.
		this.events = eventEmitter || new events.EventEmitter();
		this.observers = new Map();	// store observer for field values
		this.recordNew = true;		// add oid when recording objects that don't have one.
		this._super();
	})
	.methods({
		// --- Master ---

		// helper functions to observe the values of object fields
		observe: function(obj, field) {
			var sharer = this;
			function observer(changes) {
//				log.message('object field observer', obj.oid, field, changes[0].object);
				if (changes)
					sharer.notifySet(obj, field, changes[0].object);
			}

			var value = obj[field];
			if (value && typeof value === 'object') {
				Object.observe(value, observer);
				if (this.observers.get(value))
					log.warn.method(this, 'observe', obj.oid+'.'+field, 'already observed');
				this.observers.set(value, observer);
			}
		},
		unobserve: function(obj, field) {
			var value = obj[field];
			if (value && typeof value === 'object') {
				var observer = this.observers.get(value);
				if (observer) {
					Object.unobserve(value, observer);
					this.observers.delete(value);
				} else
					log.warn.method(this, 'unobserve', obj.oid+'.'+field, 'no observer');
			}
		},

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
		//	- `remoteMethods` is an array of method names that are called remotely and return a result.
		//		Each method can be suffixed by `':all'` or `':any'` to specify if the call should return
		//		when one result is received, or all of them. Default is any, unless `how` is specified
		//	- `how` can be `'all'` or `'any'` and specifies the default return mode for remote methods
		master: function(cls, fields, methods, notifyMethods/*opt*/, when/*opt*/, remoteMethods/*opt*/, how /*opt*/) {
			log.method(this, 'master', cls.className(), fields, methods);
			var sharer = this;
			var i;

			// The mixin adds a constructor to record the object and notify its creation,
			// and a `die` method to remove the object from the sharer.
			cls.mixin({
				constructor: function() {
					log.method(this, 'MIXIN CONSTRUCTOR');
					this.oid = sharer.recordObject(this);
					if (this.oid) {
						// observe object and array fields
						var shared = sharer.sharedClasses[cls.className()];
						if (shared.objectFields)
							for (var i = 0; i < shared.objectFields.length; i++)
								sharer.observe(this, shared.objectFields[i]);
						
					}

					log.method(this, 'OID=', this.oid);
					sharer.notifyNew(this);
				},
				methods: {
					die: function() {
						var oid = sharer.removeObject(this);
						if (oid) {
							// remove object and array fields observers
							var shared = sharer.sharedClasses[cls.className()];
							if (shared.objectFields)
								for (var i = 0; i < shared.objectFields.length; i++)
									sharer.unobserve(this, shared.objectFields[i]);

							sharer.notifyDie(oid);
						}
					}
				},
			});

			// Wrap the object fields to notify when they change value.
			//`fields` can be:
			//	`'all'` wraps all the fields (of the object's class _and_ its ancestors),
			// 	`'own'` wraps only the fields defined in its class.
			// 	An array of names of fields
			//	A literal objects with the following fields:
			//		`fields` (required): `'own'` or `'all'` or a list of field names
			//		`objects` (optional): list of field names 
			//		`arrays` (optional): list of field names
			// *** Maybe we should have a value `'mixin'` to include mixin fields?
			var objectFields = null;
			var arrayFields = null;

			if (fields && fields.fields) {
				// assume literal object format
				objectFields = fields.objects;
				arrayFields = fields.arrays;
				fields = fields.fields;
			}

			if (fields == 'all')
				fields = cls.listFields();
			else if (fields == 'own')
				fields = cls.listOwnFields();
			
			log.method(this, 'master', 
				'fields:', fields, 'objects:', objectFields, 'arrays:', arrayFields);
			var j;
			if (objectFields)
				for (i = 0; i < objectFields.length; i++) {
					this.wrapObjectFieldNotify(cls, objectFields[i]);
				}
			if (arrayFields)
				for (i = 0; i < arrayFields.length; i++) {
					this.wrapArrayFieldNotify(cls, arrayFields[i]);
				}
			if (fields)
				for (i = 0; i < fields.length; i++) {
					var field = fields[i];
					if (objectFields && objectFields.indexOf(field) >= 0)
						continue;
					if (arrayFields && arrayFields.indexOf(field) >= 0)
						continue;
					this.wrapFieldNotify(cls, fields[i]);
				}

			// Listen to method calls to execute them locally
			// `'all'` and `'own'` are as above, otherwise a list of methods
			// *** Maybe we should have a value `'mixin'` to include mixin methods?
			if (methods == 'all')
				methods = cls.listMethods();
			else if (methods == 'own')
				methods = cls.listOwnMethods();
			this.events.on('callMethod', function(data) {
				return sharer.callMethod(data.oid, data.method, data.args);
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

			// Wrap remote methods to notify when they are called
			// `'all'` and `'own'` are as above, otherwise a list of methods
			// *** Maybe we should have a value `'mixin'` to include mixin methods?
			if (remoteMethods === 'all')
				remoteMethods = cls.listMethods();
			else if (remoteMethods === 'own')
				remoteMethods = cls.listOwnMethods();
			if (remoteMethods)
				for (i = 0; i < remoteMethods.length; i++) {
					var method = remoteMethods[i].split(':');	// parse 'foo:any'
					this.wrapRemoteCall(cls, method[0], method[1] || how);
				}

			// Store info about the class being shared.
			// *** Note that this assumes that the class name is unique 
			// (at least within the classes shared by this sharer). 
			// This is already necessary for the `oid`s to work.
			this.sharedClasses[cls.className()] = {
				cls: cls,
				fields: fields || [],
				objectFields: objectFields,
				arrayFields: arrayFields,
				methods: methods || [],
				notifyMethods: notifyMethods || [],
				remoteMethods: remoteMethods || [],
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

		// Same as above for a field that holds a literal object value.
		wrapObjectFieldNotify: function(cls, field) {
			var sharer = this;

			cls.wrapField(field, null, function(value) {
				var oval = this[field];
				sharer.unobserve(this, field);
				var ret = this._set(value);
				sharer.observe(this, field);
				sharer.notifySet(this, field, value);
				return ret;
			});
		},

		// Same as above for a field that holds an array.
		// *** TODO ***
		wrapArrayFieldNotify: function(cls, field) {
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

		// Helper method to wrap a method with a remote call
		// `how` specifies how the call returns: on the first result ('any')
		// or once all results are received ('all'). In that case, an array of results is returned.
		wrapRemoteCall: function(cls, method, how) {
			if (!how)
				how = 'any';

			var sharer = this;
			cls.wrap(method, function() {
				var args = [].slice.apply(arguments);
				// Call local body (most often, it's empty)
				this._inner.apply(this, arguments);

				// Return the promise for the result
				return sharer.remoteCallWithResult(this, method, args, how);
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
		remoteCallWithResult: function(obj, method, args, how) {
			log.method(this, 'remoteCallWithResult', obj.oid+'.'+method, '(',this.encode(args),')');
			if (! this.events)
				return Promise.reject('missing server');
			if (! obj.oid)
				return Promise.reject('missing object id');

			var id = method + ObjectSharer.pendingId++;
			var message = {
				oid: obj.oid,
				method: method,
				args: this.encode(args),
				returnId: id,
			};
			this.events.emit('callMethod', message);

			// Store the promise, which will be resolved by callResult below
			// ***TODO*** we should also set a timeout, especially if 'how' is 'all'
			// ***TODO*** Can be dramatically simplified if we expect one response!
			// 			  pendingResults only needs a boolean by id, can callResult is much simpler.
			log.method(this, 'remoteCallWithResult', 'returning promise');
			this.pendingResults[id] = {
				pendingResponses: 1, // ***FIXME*** assumes one answer, making 'all' vs. 'any' pointless
				how: how,
				results: [],
			};
			var self = this;
			return new Promise(function(resolve, reject) {
				var promise = self.pendingResults[id];
				promise.resolve = resolve;
				promise.reject = reject;
			});
		},

		// Process a result received by the server
		// `response` is an object with the request id and an optional result.
		// if the result is missing, the callee could not resolve the call
		// or the call returned undefined to signal that it should be ignored
		callResult: function(response) {
			var id = response.id;
			var promise = this.pendingResults[id];
			if (! promise) {
				log.method(this, 'callResult', 'no pending promise with id', id);
				return false;
			}

			--promise.pendingResponses;
			log.method(this, 'callResult', promise.how, '('+promise.pendingResponses+' pending)', ' response =',this.encode(response));

			switch(promise.how) {
				case 'any':
					if (response.hasOwnProperty('result')) {
						log.method(this, 'callResult', 'fulfilled "any"');
						promise.resolve(response.result);
						promise.how = 'done';						
					}
					break;
				case 'all':
					if (response.hasOwnProperty('result'))
						promise.results.push(response.result);
					if (promise.pendingResponses === 0) {
						log.method(this, 'callResult', 'fulfilled "all"');
						promise.resolve(promise.results);
						promise.how = 'done';
					}
					break;
				case 'done':
					break;
			}

			if (promise.pendingResponses === 0) {
				log.method(this, 'callResult', 'reject', promise.how);
				// reject the promise if `mode` was 'any' and we got no answer
				// ***TODO*** the promise should also be rejected with the timeout fires
				if (promise.how !== 'done')
					promise.reject('no result');
				delete this.pendingResults[id];
			}

			return true;
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
