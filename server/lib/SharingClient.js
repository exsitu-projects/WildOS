// SharingClient - Sharing objects with a websocket client 
//
// Manages a connection with a client sharing objects with us.
//
// A `SharingClient` holds a set of `ObjectSharer`s describing which objects to share.
//

// Shared modules
var log = require('Log').logger('SharingClient');

// Internal modules
var SocketIOClient = require('./SocketIOClient');

// The `SharingClient` class.
var SharingClient = SocketIOClient.subclass().name('SharingClient')
	.fields({
		sharers: [],	// array of objects {sharer: sharerobject, listeners: array of listeners}
		objects: null,	// if not null, only those objects should send notifications
	})
	.constructor(function(socket) {
		log.newObject(this);
		this._super(socket);

		var self = this;	// needed for the closure

		// Event handler when the client is calling an object method.
		// If the message contains a resultId, we send the result back to the caller.
		this.on('callMethod', function(data) {
			log.eventEnter(self, 'callMethod', data.oid+'.'+data.method, '(', data.args, ');');
			// Forward the call to the sharers until one of them handles it.
			for (var i = 0; i < self.sharers.length; i++) {
				var sharer = self.sharers[i].sharer;

				var result = sharer.callMethod(data.oid, data.method, data.args);
				if (result !== false) {
					if (data.returnId) {
						// we need to return the result
						result.id = data.returnId;
						log.event(self, 'callMethod', 'sending result id', data.returnId, 'value', result);
						self.socket.emit('callResult', sharer.encode(result));
					}
					log.event(self, 'callMethod', 'found');
					break;
				}
			}
			log.eventExit(self, 'callMethod');
		});

		// Event handler when the client is requesting an object
		this.on('getObject', function(oid) {
			log.event(self, 'getObject', oid);
			// Forward the call to the sharers until one of them handles it.
			for (var i = 0; i < self.sharers.length; i++) {
				var sharer = self.sharers[i].sharer;
				var obj = sharer.getObject(oid);
				if (obj) {
					sharer.notifyNew(obj);
					log.event(self, 'getObject', 'found');
					break;
				}
			}
			log.event(self, 'getObject');
		});
	})
	.methods({
		// Callback when the client has disconnected
		disconnected: function() {
			log.method(this, 'disconnected');
			this.removeAllSharers();
		},

		// Add a sharer to the set of sharers managed by this client.
		addSharer: function(sharer) {
			// *** In the client-side version, we check the list of sharerInfo to see if we already have it.
			// *** Why not do it here?
			
			// Local function to return the function to use as listener for object changes:
			// The returned function forwards the message to the client.
			var self = this;
			var sendToClient = function(msg) {
				// The `'dieObject'` requires special handling (see below).
				if (msg == 'dieObject') {
					return function(data) {
						if (self.objects) {
							var i = self.objects.indexOf(data);
							//if (i < 0)
							//	return;	
							// if we emit a dieObject message, we're going to be in trouble because it will trigger the listener for each sharer, 
							// but it will remove the object from the table the first time and therefore the subsequent sharers won't be notified
							// so we emit anyway, and the client will realize it does not have the object
							if (i >= 0)
								self.objects.splice(i, 1);
						}
						log.method(self, 'sendToClient', msg, data);
						if (self.socket)
							self.socket.emit(msg, data);
					};
				}

				// General case: forward the message to the client if this is an object we are managing.
				return function(data) {
					if (self.objects && self.objects.indexOf(data.oid) < 0)
						return;
					log.method(self, 'sendToClient', msg, data);
					if (self.socket)
						self.socket.emit(msg, data);
				};
			};

			// Setup listeners on the sharer to notify client of object changes.
			var listeners = [];
			var msgs = ['newObject', 'dieObject', 'setField', 'callMethod', 'callNotify'];
			for (var i = 0; i < msgs.length; i++) {
				var msg = msgs[i];
				var listener = sendToClient(msg);
				// Keep track of the listeners so we can remove them.
				listeners.push({msg: msg, listener: listener});
				sharer.on(msg, listener);
			}
			// Remember the listeners set for this sharer.
			this.sharers.push({sharer: sharer, listeners: listeners});

			// Send existing objects to the client.
			if (this.socket)
				if (this.objects) {
					// Only send these objects.
					for (var j = 0; j < this.objects.length; j++) {
						var oid = this.objects[j];
						var obj = sharer.getObject(oid);
						if (obj) {
							log.method(this, 'addSharer', '- sending', oid);
							this.socket.emit('newObject', sharer.encodeNew(obj));
						}
					}
				} else {
					// Send all objects in the sharer.
					sharer.allObjects('encode', function(o) {
						log.method(self, 'addSharer', '- sending', o.oid);
						self.socket.emit('newObject', o);
					});
				}

			return this;
		},

		// Remove all the listeners in `sharerInfo`.
		removeListeners: function(sharerInfo) {
			for (var i = 0; i < sharerInfo.listeners.length; i++) {
				var listener = sharerInfo.listeners[i];
				sharerInfo.sharer.off(listener.msg, listener.listener);
			}
			return this;
		},

		// Remove all the listeners for a sharer, and then remove the sharer from our list.
		removeSharer: function(sharer) {
			for (var i = 0; i < this.sharers.length; i++) {
				var sharerInfo = this.sharers[i];
				if (sharerInfo.sharer == sharer) {
					this.removeListeners(sharerInfo);
					this.sharers.splice(i, 1);
				}
			}
		},

		// Remove all sharers from our list and all the listeners we set up for them.
		removeAllSharers: function() {
			for (var i = 0; i < this.sharers.length; i++)
				this.removeListeners(this.sharers[i]);
			this.sharers = [];
			return this;
		},

		// Manage the list of objects we are syncing.
		// Note that when `this.objects` is `null`, we sync all objects,
		// and when it is an empty array, we sync none.
		addObject: function(sharer, obj) {
			if (!obj.oid)
				return this;

			if (!this.objects)
				this.objects = [obj.oid];
			else 
				this.objects.push(obj.oid);
			//for (var i = 0; i < this.sharers.length; i++)
			//	this.sharers[i].emit('newObject', obj);
			if (this.socket)
				this.socket.emit('newObject', sharer.encodeNew(obj));
			return this;
		},
		removeObject: function(obj) {
			if (!obj.oid)
				return this;

			var i = this.objects.indexOf(obj.oid);
			if (i >= 0) {
				this.objects.splice(i, 1);
				if (this.socket && obj.oid)
					this.socket.emit('dieObject', obj.oid);		
			}
			return this;
		},
		removeAllObjects: function() {
			if (!this.objects)
				return;
			for (var i = 0; i < this.objects.length; i++) {
				var obj = this.objects[i];
				if (this.socket && obj.oid)
					this.socket.emit('dieObject', obj.oid);		
			}
			this.objects = null;
			return this;
		},
		resetObjects: function() {
			this.removeAllObjects();
			this.objects = [];	// different from null: null = all objects, [] = none
			return this;
		},
	})
;

log.spyMethods(SharingClient);

module.exports = SharingClient;
