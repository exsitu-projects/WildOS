// ObjectSharer - Shares the objects of a set of classes.
//
// This is the main building block of the distributed object support.
// It modifies classes to be able to create their objects, change their
// properties and call their methods through events received from a server.
// `SharingServer` implements the server itself.
//

// Shared modules
var ObjectStore = require('ObjectStore');
var log = require('Log').logger('ObjectSharer');

// The client-side `ObjectSharer` class.
var ObjectSharer = ObjectStore.subclass().name('ObjectSharer')
	.classFields({
		pendingId: 0,		// Counter to generate continuation ids		
	})
	.fields({
		server: null,		// Where to send / listen to events
		pendingResults: {},	// Continuations for remote function calls awaiting their response
	})
	.constructor(function() {
		this.recordNew = false;	// don't record objects that don't have on oid.
		this._super();
	})
	.methods({
		// --- Slave ---
		// Make the objects of a class be the slaves of a distributed class.
		//	- `fields` is a list of field names that are shared, or `'all'` for all fields, or `'own'` for own fields
		//	- `methods` is a list of methods that are called remotely, or `'all'` for all methods, or `'own'` for own methods
		//	  If it is a list, each method name can be suffixed by ':sync'. In this case the method call returns a promise 
		//	  that is resolved when the result is received.
		//	- `how`, if specified, can be 'sync', in which case it applies to all methods specified by `method`
		slave: function(cls, fields, methods, how) {

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
					var method = methods[i].split(':');
					this.wrapRemoteCall(cls, method[0], method[1] || how);
				}

			this.sharedClasses[cls.className()] = {
				cls: cls,
				fields: fields || [],
				methods: methods || [],
			};
			return this;
		},

		// Helper method to wrap a method with a function that sends the call to the server.
		// If `how` is 'sync', return a promise that gets resolved when the result is received.
		wrapRemoteCall: function(cls, method, how) {
			var sharer = this;

			if (how === 'sync')
				cls.wrap(method, function() {
					var args = [].slice.apply(arguments);
					// Call local body (most often, it's empty)
					this._inner.apply(this, arguments);

					// Here we ignore the return value from the local call
					// and we return the promise for the value of the RPC
					return sharer.remoteCallWithResult(this, method, args);
				});
			else
				cls.wrap(method, function() {
					var args = [].slice.apply(arguments);
					sharer.remoteCall(this, method, args);

					// Call local body (most often, it's empty)
					return this._inner.apply(this, arguments);
				});
			
		},

		// --- Send messages to server ---

		// Issue a method call to an object.
		remoteCall: function(obj, method, args) {
			log.method(this, 'remoteCall', obj.oid+'.'+method, '(',this.encode(args),')');
			if (! this.server || ! obj.oid)
				return;

			var message = {
				oid: obj.oid,
				method: method,
				args: this.encode(args),
			};

			this.server.emit('callMethod', message);
		},

		// Issue a method call to an object and expect a result.
		// Return a promise to be resolved when the result is received.
		remoteCallWithResult: function(obj, method, args) {
			log.method(this, 'remoteCallWithResult', obj.oid+'.'+method, '(',this.encode(args),')');
			if (! this.server)
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
			this.server.emit('callMethod', message);

			// Store the promise, which will be resolved by callResult below
			var promise = this.pendingResults[id] = {};
			return new Promise(function(resolve, reject) {
				promise.resolve = resolve;
				promise.reject = reject;
			});
		},

		// Process a result sent by the server
		callResult: function(id, result) {
			var promise = this.pendingResults[id];
			if (! promise)
				return false;
			promise.resolve(result);
			delete this.pendingResults[id];
			return true;
		},

		// Request an object from the server.
		// *** THIS CANNOT WORK because the list of sharers is in the SharingServer!!!
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

	})
;

log.spyMethods(ObjectSharer);

module.exports = ObjectSharer;
