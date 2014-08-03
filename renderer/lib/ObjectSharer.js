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
	.fields({
		server: null,		// Where to send / listen to events
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

		// --- Send messages to server ---

		// Issue a method call to an object.
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
