// SharingServer - Sharing objects with a websocket client 
//
// Manages a connection with a server sharing objects with us.
//
// A `SharingServer` holds a set of `ObjectSharer`s describing which objects to share.
// This class corresponds to the `SharingClient` class in the server.
//

// Shared modules
var log = require('Log').logger('SharingServer');

// Internal modules
var SocketIOServer = require('./SocketIOServer');

// By default we connect to the server that ran us.
// In the node environment, we assume an SSH connection and get the address from there,
// otherwise we use localhost.
// In the browser environment, a null hostname will connect to the same server.
//
function getServer() {
	var serverHost = null;
	// process.title is set to 'browser' by browserify, to 'node' by node and node-webkit
	if (process.title != 'browser') {
		var ssh_client = process.env.SSH_CLIENT;

		if (ssh_client)
			serverHost = ssh_client.split(' ')[0];
		if (! serverHost)
			serverHost = '127.0.0.1';
	}
	return serverHost;
}

// The `SharingServer` class.
var SharingServer = SocketIOServer.subclass().name('SharingServer')
	.classFields({
		host: getServer(),
		port: 8080,
	})
	.fields({
		sharers: [],		// list of ObjectSharer objects attached to this server
	})
	.constructor(function(hostname, port, namespace) {
		this._super(hostname || SharingServer.host, port || SharingServer.port, namespace);
	})
	.methods({
		// This is called when the server creates the socket.
		created: function() {
			var self = this;

			this.on('newObject', function (object) {
				log.eventEnter(self, 'newObject', object);
				self.sharers.some(function(sharer) {
					if (sharer.makeObject(object)) {
						log.event(self, 'newObject', 'found sharer');
						return true;
					}
					return false;
				});
				log.eventExit(self, 'newObject');
			});

			this.on('dieObject', function (oid) {
				log.eventEnter(self, 'dieObject', oid);
				self.sharers.some(function(sharer) {
					if (sharer.killObject(oid)) {
						log.event(self, 'dieObject', 'object killed');
						return true;
					}
					return false;
				});
				log.eventExit(self, 'dieObject');
			});

			this.on('setField', function (set) {
/**/			log.eventEnter(self, 'setField', set.oid+'.'+set.field+' = ',set.value);
				self.sharers.some(function(sharer) {
					if (sharer.setField(set.oid, set.field, set.value)) {
/**/						log.event(self, 'setField', 'found');
						return true;
					}
					return false;
				});
/**/			log.eventExit(self, 'setField');
			});

			this.on('callMethod', function (call) {
				log.event(self, 'callMethod', call.oid+'.'+call.method+'(',call.args,')');
				self.sharers.some(function(sharer) {
					if (sharer.callMethod(call.oid, call.method, call.args)) {
						log.event(self, 'callMethod', 'found');
						return true;
					}
					return false;
				});
				log.eventExit(self, 'callMethod');
			});

			this.on('callNotify', function (call) {
				log.eventEnter(self, 'callNotify', call.when+' '+call.oid+'.'+call.method+'(',call.args,')');
				self.sharers.some(function(sharer) {
					if (sharer.callNotify(call.oid, call.method, call.when, call.args)) {
						log.event(self, 'callNotify', 'found');
						return true;
					}
					return false;
				});
				log.eventExit(self, 'callNotify');
			});
		},

		// Add a sharer to the set of sharers managed by this client.
		addSharer: function(sharer) {
			log.method(this, 'addSharer', sharer.sharedClasses);
			if (this.sharers.indexOf(sharer) < 0) {
				this.sharers.push(sharer);
				sharer.server = this;
			}
			return this;
		},

		// Remove all the listeners for a sharer, and then remove the sharer from our list.
		// *** It is not clear why this function is a bit different on the server-side.
		removeSharer: function(sharer) {
			var i = this.sharers.indexOf(sharer);
			if (i >= 0) {
				this.sharers.splice(i, 1);
				sharer.server = null;
			}
			return this;
		},

		// Remove all sharers from our list and all the listeners we set up for them.
		// *** It is not clear why this function is a bit different on the server-side.
		removeAllSharers: function() {
			this.sharers.forEach(function(sharer) { sharer.server = null; });
			this.sharers = null;
		},
	})
;

log.spyMethods(SharingServer);

module.exports = SharingServer;
