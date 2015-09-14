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
		
		// Make the objects of a class be the slaves of the distributed class.
		//	`spec` is a literal object specifying what to share and how:
		// 	{
		// 		fields: <flist>		// fields to share
		// 		notify: <mlist>		// methods whose call is notified to the server.
		// 		remote: <mlist>		// methods to call remotely. The call returns a promise for the return value
		// 		methods: <mlist>	// methods that can be called remotely by the server
		// 	}
		// <flist> is a list of fields and can be of the form:
		// 		'own' - the classes own fields
		//		'all' - the classes fields, including those of its superclasses
		//		['f1', 'f2', ...] - a list of field names
		//		'f1 f2 ...' - another way to specify a list of field names
		//		if the first field in the above lists is 'own-' or 'all-',
		//			the following fields are excluded from the list of own/all fields
		// <mlist> is a list of methods, of the same form as the list of fields
		// all fields are optional
		slave: function(cls, spec) {

			// Record the description of the class.
			var fields = spec.fields && cls.listFields(spec.fields);
			var methods = spec.methods && cls.listMethods(spec.methods);
			var notify = spec.notify && cls.listMethods(spec.notify);
			var remote = spec.remote && cls.listMethods(spec.remote);
			if (notify)
				for (i = 0; i < notify.length; i++) {
					this.wrapNotify(cls, notify[i]);
				}
			if (remote)
				for (i = 0; i < remote.length; i++) {
					this.wrapRemoteCall(cls, remote[i]);
				}

			this.sharedClasses[cls.className()] = {
				cls: cls,
				fields: fields || [],
				methods: methods || [],
			};
			return this;
		},

		// Helper method to wrap a method with a function that sends the call to the server.
		wrapNotify: function(cls, method, how) {
			var sharer = this;

			cls.wrap(method, function() {
				var args = [].slice.apply(arguments);
				sharer.remoteCall(this, method, args);

				// Call local body (most often, it's empty)
				return this._inner.apply(this, arguments);
			});			
		},

		// Same as above, but returns a promise that gets resolved when the result is received.
		wrapRemoteCall: function(cls, method, how) {
			var sharer = this;

			cls.wrap(method, function() {
				var args = [].slice.apply(arguments);
				// Call local body (most often, it's empty)
				this._inner.apply(this, arguments);

				// Here we ignore the return value from the local call
				// and we return the promise for the value of the RPC
				return sharer.remoteCallWithResult(this, method, args);
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
			if (promise.resolve)
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
