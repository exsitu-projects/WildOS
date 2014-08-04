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

		// Helper method to wrap a method with a function that sends the call to the server.
		// If the last argument is a function, it is a callback to be called with the result when it is received.
		wrapRemoteCall: function(cls, method /*, arguments [, cb] */) {
			var sharer = this;

			cls.wrap(method, function() {
				var args = [].slice.apply(arguments);
				var cb = args[args.length-1];
				if (typeof cb == 'function') {
					args.splice(-1, 1);	// remove last argument
					sharer.remoteCall(this, method, args, cb);
				} else
					sharer.remoteCall(this, method, args);

				// Call local body (most often, it's empty)
				return this._inner.apply(this, arguments);
			});
		},

		// --- Send messages to server ---

		// Issue a method call to an object.
		// If `cb` is a function, it is called when the result is received.
		remoteCall: function(obj, method, args, cb) {
			log.method(this, 'remoteCall', obj.oid+'.'+method, '(',this.encode(args),')');
			if (! this.server || ! obj.oid)
				return;

			var message = {
				oid: obj.oid,
				method: method,
				args: this.encode(args),
			};
			if (cb && typeof cb == 'function') {
				// Store the promise, which will be resolved by callResult below
				var id = message.returnId = method + ObjectSharer.pendingId++;
				this.pendingResults[id] = {
					object: obj,
					cb: cb,
				};
			}
			this.server.emit('callMethod', message);
		},

		// Process a result sent by the server
		callResult: function(id, result) {
			var promise = this.pendingResults[id];
			if (! promise)
				return false;
			promise.cb.call(promise.obj, result);
			delete this.pendingResults[id];
			return true;
		},

		// Request an object from the server.
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
