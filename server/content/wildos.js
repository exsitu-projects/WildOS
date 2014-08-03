require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"kYRwZz":[function(require,module,exports){
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

},{"Log":"DSCIv8","OO":"PEL2Mo"}],"./ObjectSharer":[function(require,module,exports){
module.exports=require('kYRwZz');
},{}],"A6o4Gx":[function(require,module,exports){
(function (process){
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

}).call(this,require("/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"))
},{"./SocketIOServer":"ie5dLj","/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":14,"Log":"DSCIv8"}],"./SharingServer":[function(require,module,exports){
module.exports=require('A6o4Gx');
},{}],"ie5dLj":[function(require,module,exports){
// SocketIOServer
//
// Represents a connection to a server using socket.io

// Node modules
var io = require('socket.io-client');

// Shared modules
var OO = require('OO');
var log = require('Log').logger('SocketIOServer');

// The `SocketIOServer` class.
var SocketIOServer = OO.newClass().name('SocketIOServer')
	.fields({
		hostname: null,		// Defaults to localhost
		port: 80,			// Defaults to Web server port
		path: '',			// Defaults to global namespace
		retry: true,		// Whether to retry on error
		retryDelay: 5000,	// Retry delay
	})
	.constructor(function(hostname, port, path) {
		this.socket = null;

		this.hostname = hostname;
		if (port)
			this.port = port;
		if (path && ! path.match(/^\//))
			path = '/'+path;
		this.path = path || '';

		if (this.hostname)
			this.url = this.hostname+':'+this.port+this.path;
		else
			this.url = this.path || null;
		
		this.connectionUp = false;	// Whether the connection is actually live
		this.retryPending = false;	// As it says...
		log.newObject(this);
	})
	.methods({
		// Connect to server.
		connect: function() {
			// We can manage only one connection per object.
			if (this.socket) {
				log.message(this, 'connect', '- socket already exists');
				return this;
			}

			// Open the socket.
			// This will in general return a non-null value, but we won't know
			// until a `connect` event that the connection went through.
			this.socket = io.connect(this.url, {
				'force new connection': true,	// critical to retry on initial connect
				'reconnect': true,
				'reconnection delay': 5000,
				'reconnection limit': 5000,		// to avoid exponential backoff
				'max reconnection attempts': 1000,
			});

			if (! this.socket) {
				log.warn.message(this, 'connect', ' - could not get socket');
				return this;
			}

			// Set the listeners to manage the connection.
			// We can do this even though we don't know yet that the connection is up.
			this.setListeners();
			// Let subclasses extend without having to redefine `connect`.
			this.created();
			log.message(this, 'connect');

			return this;
		},

		// Internal methods to set the listeners that manage the connection.
		// Note that `this.connectionUp` 
		setListeners: function() {
			var self = this;

			// connection management //
			this.on('connect', function() {
				log.eventEnter(self, 'connect', self.url);

				self.connectionUp = true;
				self.connected();

				log.eventExit(self, 'connect');
			});

			// We don't use reconnect, except for logging
			this.on('reconnect', function() {
				log.event(self, 'reconnect', self.url);
				// connect is also called, so this is not useful
			});

			// When a disconnect is notified while the socket exists,
			// automatic reconnection will take place.
			this.on('disconnect', function (reason) {
				log.eventEnter(self, 'disconnect', self.url, '- reason:', reason);
				self.connectionUp = false;
				self.disconnected();
				// socket.io's auto-reconnect will kick in
				log.eventExit(self, 'disconnect');
			});

			// Not sure this one works
			this.on('connect_failed', function (reason) {
				log.warn.event(self, 'connect_failed', self.url, '- reason:', reason);
			});

			// When an error occurs, the connection could not established
			// when the socket was first created. 
			// In this case, we need to try to reconnect ourselves, 
			// i.e. socket.io's automatic reconnect does not kick in
			this.on('error', function (reason) {
				log.warn.eventEnter(self, 'error', self.url, '- reason:', reason);
				// this only occurs on first connection attempt
				if (self.retry) {
					self.socket = null;
					self.tryReconnect();
				}
				log.warn.eventExit(self, 'error');
			});

		},
		
		// Called when the socket is created.
		created: function(socket) {
			// empty - subclasses can redefine
			// Typically they set up their event handlers here
		},

		// Called when the connection is established.
		connected: function(socket) {
			// empty - subclasses can redefine
		},

		// Called when the connection is lost.
		// The transport layer will try reconnecting (unless `retry` is false).
		disconnected: function(socket) {
			// empty - subclasses can redefine
		},

		// Shut down the connection.
		disconnect: function() {
			if (this.socket) {
				log.method(this, 'disconnect');
				this.socket.removeAllListeners();
				this.socket.disconnect();
				this.socket = null;
			} else
				log.method(this, 'disconnect', ' - not connected');
		},

		// Internal method to reconnect. This is only used when
		tryReconnect: function() {
			if (this.retryPending || this.connectionUp) {
				log.method(this, 'tryReconnect', '- unnecessary',
					'(pending=', retryPending, ' - connectionUp=', this.connectionUp);
				return;
			}

			log.method(this, 'tryReconnect', '- will try in', this.retryDelay/1000, 'seconds');

			var self = this;
			this.retryPending = true;
			setTimeout(function(){
				self.retryPending = false;
				if (! this.connectionUp) {
					log.method(self, 'tryReconnect', '- retrying');
					self.connect();
				} else
					log.method(self, 'tryReconnect', '- already connected');
			}, this.retryDelay);
		},

		// --- Manage events ---
		// This gives a similar API as node's event emitters.

		// Internal method to log events.
		logEvent: function(type, msg) {
			if (this.socket)
				log.method(this, type, msg, '- has', this.socket.listeners(msg).length, 'listeners');
			else
				log.method(this, type, msg, '- no socket');
		},

		// Set a listener.
		on: function(msg,listener) {
			this.logEvent('on', msg);
			if (this.socket)
				this.socket.on(msg, listener);
		},

		// Set a listener to be called only once.
		once: function(msg, listener) {
			this.logEvent('once', msg);
			if (this.socket)
				this.socket.once(msg, listener);
		},

		// Remove a listener.
		// If `listener` is `null`, remove all listeners for `msg`.
		// If `msg` is also `null`, remove all listeners.
		off: function(msg, listener) {
			this.logEvent('off', msg);
			if (this.socket)
				if (listener)
					this.socket.removeListener(msg, listener);
				else
					this.socket.removeAllListeners(msg);
		},

		// Emit an event.
		emit: function(msg, data) {
			this.logEvent('emit', msg);
			if (this.socket)
				this.socket.emit(msg, data);
		},
	});

log.spyMethodsExcept(SocketIOServer, ['logEvent']);

module.exports = SocketIOServer;

},{"Log":"DSCIv8","OO":"PEL2Mo","socket.io-client":"UPfOTt"}],"./SocketIOServer":[function(require,module,exports){
module.exports=require('ie5dLj');
},{}],"Log":[function(require,module,exports){
module.exports=require('DSCIv8');
},{}],"DSCIv8":[function(require,module,exports){
(function (process,global){
// Log - logger
//
// Facilitate logging OO classes.
// This is used most often as follows:
//		var log = require('Log').shared();
//		log.message(...);
//
// Each `Log` object has three properties, `warn`, `error` and `fatal`, which
// lets use the same methods to issue warnings, errors and fatal errors:
//		log.warn.message('I told you');
//		log.error.message('You are having a bad day');
//		log.fatal.message('You cannot do that!');
//
// NOTE: newObject adds a property _name to the object if not already there, 
// and a property _nextId to the object's class (to assign unique names).
//
//	*** TODO: filtering options (class name, object name, method name, severity)
//	*** should be managed with white/black lists + UI to change it dynamically
//  *** Better formatting of errors in HTML

// node modules
var util = require('util');

// local module
var OO = require('./OO');

// Global logging functions.

// Calls global.log if defined (typically to log to an HTML window),
// otherwise to the console.
function log(status /*, varargs*/) {
	// process.title is set to 'browser' by browserify, to 'node' by node and node-webkit
	if (process.title != 'browser' && global.log)
		global.log.apply(this, arguments);
	else {
		var args = Array.prototype.slice.call(arguments, 1);
		if (status.indent === 0 && status.level == 'Info')
			console.log.apply(console, args);
		else {
			var blank = '                                                                                ';
			var indent = blank.substring(0, status.indent*Log.indentSize);
			if (status.level != 'Info')
				indent += status.level;
			console.log.apply(console, [indent].concat(args));
		}
	}
}

// Calls global.logIndent if defined.
// Useful for example to create nested boxes in the output.
function logIndent(indentLevel) {
	if (process.title != 'browser' && global.logIndent)
		global.logIndent(indentLevel);
}

// The `Log` class.
var Log = OO.newClass().name('Log')
	.classFields({
		indentSize: 2,		// size of indentation
		indent: 0,			// indentation level
		stack: [],			// indent call stack, to check proper balancing
		sharedLogger: null,	// the logger returned by `Log.shared()`
		display: 'show',	// global logging style
		domains: {}			// for each domain, whether it is logged or not and which entries are logged or not
/*
		domains: {
			"MyClass": {
				display: 'open',
				style: {
					color: 'blue',
				},
				entries: {
					_object: '',
					_message: '',
					create: '',
					m1: 'closed',
					m2: 'skip',
					m3: {
						display: 'open',
						style: { color: 'red' }
					}
				}
			MyOtherClass: "open", "show", "closed", "hide", hidden", "skip",
		}
*/
	})
	.classMethods({
		// Load domain description
		loadConfig: function(file) {
			try {
				var config = require(file);
				if (config.display)
					this.display = config.display;
				if (config.domains)
					this.domains = config.domains;
			} catch(e) {
				console.log('domains file', file, 'not found');
			}
		},

		// Utility function to extract the elements from array `a` from index `from` (0 by default).
		// Useful to manipulate the `arguments` pseudo-array.
		slice: function(a, from) {
			if (! from)
				from = 0;
			return Array.prototype.slice.call(a, from);
		},

		// A shared logger, created lazily.
		shared: function() {
			if (! this.sharedLogger) {
				if (this.display == 'skip')
					this.sharedLogger = NoLog.create();
				else
					this.sharedLogger = Log.create();
			}
			return this.sharedLogger;
		},

		// A logger for a given domain.
		// The configuration for the domains is specified by loading a file (see `loadDomain`).
		logger: function(domainName) {
			var domain = Log.domains[domainName];
			if (! domain)
				domain = Log.display;	// Global default

			if (typeof domain == "string")
				// turn shortcut (e.g., myDomain: "closed") into proper config object
				domain = {
					display: domain,
				};
			
			if (domain.display == "skip" && !domain.entries)
				return NoLog.create();	// No logging at all (more efficient)

			if (!domain.entries)
				domain.entries = {};

			return Log.create(domainName, domain);
		},
	})
	.fields({
		level: 'Info',			// severity level (see `Warning` and `Error` below).
		inspectOptions: null,	// options to pass to util.inspect.
		domainName: null,		// name of domain for this logger.
		display: 'show',		// how to display this logger's output.
		entries: {}				// override display type for individual entries
	})
	.constructor(function(domainName, domain) {
		this.domainName = domainName || 'global';
		this.display = Log.display;
		if (domain) {
			this.display = domain.display;
			this.entries = domain.entries;
		}

		// `currentDisplay` is used to avoid extra argument to `log`. (Dirty hack...)
		this.currentDisplay = this.display;

		// Create the three loggers to issue warnings, errors and fatal errors.
		this.warn = Warning.create();
		this.error = ErrorLog.create();
		this.fatal = Fatal.create();
	})
	.methods({
		// Return a name for the object.
		objName: function(obj) {
			if (!obj)
				return 'null';
			return obj._name || obj.className();
		},

		// General logging function, not meant to be used directly.
		// Calls the global logging function.
		log: function() {
			// Turn the arguments into a real array.
			var args = Log.slice(arguments);

			// Flatten the last argument in the list if it's an array.
			// This is because `log` will be called most of the time
			// with the array of arguments of the original call as last argument.
			var lastArg = args[args.length-1];
			if (util.isArray(lastArg))
				args = args.slice(0, -1).concat(lastArg);

			log.apply(this, [{
				level: this.level,
				indent: Log.indent,
				display: this.currentDisplay,
				domain: this.domainName,
			}].concat(args));

			if (this.level == 'Fatal')
				process.exit(1);
		},

		logIndent: function(indentLevel) {
			logIndent(indentLevel);
		},

		// Return true if an entry should not be logged
		displayEntry: function(e) {
			var display = this.display;
			var entry = this.entries[e];
			if (entry)
				display = entry;

			this.currentDisplay = display;
			return (display !== 'skip');
		},

		// Log a message when entering/exiting method `m` of object `obj`.
		// Additional arguments are logged too.
		// Make sure to balance calls. If `exit` is called with `obj` and `m`
		// they will be checked against the corresponding call to `enter`.
		enter: function(obj, m) {
			if (! this.displayEntry(m))
				return;
			this.logIndent(Log.indent+1);
			this.log('>', this.objName(obj)+'::'+m, Log.slice(arguments, 2));
			Log.stack.push({object: obj, method: m});
			Log.indent++;
		},
		exit: function(obj, m) {
			if (! this.displayEntry(m))
				return;
			Log.indent--;
			if (Log.stack.length === 0) {
				this.log('Log::exit - empty stack');
				Log.indent = 0;
			} else {
				var top = Log.stack.pop();
				if (! obj) obj = top.object;
				if (! m) obj = top.method;
				if (top.object != obj)
					this.log('Log::exit - mismatched object');
				if (top.method != m)
					this.log('Log::exit - mismatched method');
			}
			this.log('<', this.objName(obj)+'::'+m, Log.slice(arguments, 2));
			this.logIndent(Log.indent);
		},

		// Log a message with arbitrary arguments.
		message: function() {
			if (! this.displayEntry('_message'))
				return;
			this.log(Log.slice(arguments));
		},

		// Log a message when creating `obj`. May add a property `_name` to it to identify it in future calls.
		// Additional arguments are logged too.
		newObject: function(obj) {
			if (! this.displayEntry('create'))
				return;
			if (! obj._name) {
				var cls = obj.classs();
				if (! cls._nextId) cls._nextId = 0;
				obj._name = obj.className()+'_'+cls._nextId++;
			}
			this.log('new', this.objName(obj), Log.slice(arguments, 1));
		},

		// Log a message when inside method `m` of object `obj`.
		// Additional arguments are logged too.
		method: function(obj, m) {
			if (! this.displayEntry(m))
				return;
			this.log(this.objName(obj)+'::'+m, Log.slice(arguments, 2));
		},

		// Log a message when handling event `e` received by object `obj`.
		// Additional arguments are logged too.
		// Beware that `this` does not work as expected inside a listener.
		// Declare `var self=this;` first and use `self` in the listener.
		event: function(obj, e) {
			if (! this.displayEntry(e))
				return;
			this.log(this.objName(obj), 'event', e, Log.slice(arguments, 2));
		},

		eventEnter: function(obj, e) {
			if (! this.displayEntry(e))
				return;
			this.logIndent(Log.indent+1);
			this.log('>', this.objName(obj), 'event', e, Log.slice(arguments, 2));
			Log.stack.push({object: obj, event: e});
			Log.indent++;
		},

		eventExit: function(obj, e) {
			if (! this.displayEntry(e))
				return;
			Log.indent--;
			if (Log.stack.length === 0) {
				this.log('Log::exit - empty stack');
				Log.indent = 0;
			} else {
				var top = Log.stack.pop();
				if (! obj) obj = top.object;
				if (! e) obj = top.event;
				if (top.object != obj)
					this.log('Log::exit - mismatched object');
				if (top.event != e)
					this.log('Log::exit - mismatched event');
			}
			this.log('<', this.objName(obj), 'event', e, Log.slice(arguments, 2));
			this.logIndent(Log.indent);
		},

		// Dump `obj` to level `depth` (the default is that of `util.inspect`).
		object: function(obj, depth) {
			if (! this.displayEntry('_object'))
				return;
			var opts = null;
			if (depth) opts = { depth: depth };
			this.log('object', this.objName(obj), util.inspect(obj, opts));
		},

		// Wraps the own methods of `cls` to log enter/exit
		spyMethods: function(cls, include, exclude) {
			var self = this;
			cls.listOwnMethods().forEach(function(name) {
				if (include && include.indexOf(name) < 0)
					return;
				if (exclude && exclude.indexOf(name) >= 0)
					return;
				if (! self.displayEntry(name))
					return;
				cls.wrap(name, function() {
					self.enter(this, /* cls.className()+'::'+ */ name, arguments);
					var res = this._inner.apply(this, arguments);	
					self.exit(this, /* cls.className()+'::'+ */ name);
					return res;
				});
			});
		},

		spyMethodsExcept: function(cls, exclude) {
			this.spyMethods(cls, null, exclude);
		},
		spySomeMethods: function(cls, include) {
			this.spyMethods(cls, include, null);
		},
	})
	;

// The `NoLog` class, used when logging is disabled.
var NoLog = Log.subclass().name('NoLog')
	.methods({
		enter: function(obj, m) {},
		exit: function(obj, m) {},
		message: function() {},
		newObject: function(obj) {},
		method: function(obj, m) {},
		event: function(obj, e) {},
		eventEnter: function(obj, e) {},
		eventExit: function(obj, e) {},
		object: function(obj, depth) {},
		spyMethods: function(cls, include, exclude) {},
		spyMethodsExcept: function(cls, exclude) {},
		spySomeMethods: function(cls, include) {},
	})
	;

// The `Warning` class is a logger that prefixes all messages by `Warning`.
var Warning = Log.subclass().name('Warning')
	.constructor(function() {
		this.level = 'Warning';
		this.display = 'show';
		this.entries = {};
	});

// The `ErrorLog` class is a logger that prefixes all messages by `Error`.
var ErrorLog = Log.subclass().name('Error')
	.constructor(function() {
		this.level = 'Error';
		this.display = 'show';
		this.entries = {};
	});

// The `Fatal` class is a logger that prefixes all messages by `Fatal` and then exits.
var Fatal = Log.subclass().name('Error')
	.constructor(function() {
		this.level = 'Fatal';
		this.display = 'show';
		this.entries = {};
	});

module.exports = Log;

}).call(this,require("/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./OO":"PEL2Mo","/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":14,"util":16}],"OO":[function(require,module,exports){
module.exports=require('PEL2Mo');
},{}],"PEL2Mo":[function(require,module,exports){
/*
	Classy, (yet another) object-oriented framework for Javascript.
	(c) 2011, Michel Beaudouin-Lafon, mbl@lri.fr
	
	A taste of how it's used:
	
	// define a Shape class with two properties (x and y), a default constructor and some methods
	var Shape = Classy.newClass();
	Shape.fields({x: 0, y: 0});
	Shape.constructor(function(x, y) {
		this.x = x; this.y = y;
	});
	Shape.methods({
		moveby: function (dx, dy) { this.x += dx; this.y += dy; },
		moveto: function (x, y) { this.x = x; this.y = y; },
	});
	
	// create a shape, call a method and print its properties
	var s = Shape.create(5, 5);
	s.moveby(10, 15);
	print(s.x,',',s.y);
	
	// create a Circle subclass, with a new field, two constructors and some methods.
	// note that we can use a chain of calls instead of a sequence as above.
	var Circle = Shape.subclass()
		.fields({radius: 1})			// this could also be written .field('radius', 1)
		.constructor(function (x, y, r) {
			this._super(x, y);	// call to super, i.e. the Shape constructor
			this.radius = r;
		})
		.constructor('withradius', function(r) {	// this is a named constructor
			this.radius = r;	// no need to call super, x and y will be inited to 0
		})
		.methods({
			area: function() { return this.radius * this.radius * 3.14; },
			// as with constructors, we can call this._super(...) in a method
		});
	
	// create a circle with the named constructor and play with it
	var c = Circle.withradius(12).moveby(10, 15);
	print (c.area());
	
// [begin activefield]
	// add an active field for the diameter
	// this uses the Javascript syntax for getter/setter for properties
	Circle.fields({
		get diameter() {return this.radius * 2},
		set diameter(val) {this.radius = val / 2},
	});
	var c2 = Circle.create();
	c2.diameter = 20;
	print (c2.radius);	// 10
// [end activefield]

// [begin mixin]	
	// create a wrapper to trace a method call
	function traceWrapper() {
		log('calling ')
		return this._inner();	// calls the wrapped method
	}
	// add the wrapper to a couple methods
	Shape.wrap('moveby', traceWrapper);
	Circle.wrap('area', traceWrapper);
	c.area();
	// remove the wrapper
	Circle.unwrap('area', traceWrapper);
	
	// define a mixin for redisplaying a shape when it is changed
	function redisplayWrapper() {
		this._inner.apply(this, arguments);		// call original function with same arguments
		this.redisplay();						// call the mixin method
	}
	
	var displayMixin = {
		constructor: function() { this.redisplay(); },	// constructor called for each new object
		fields: {},										// additional fields (none here)
		methods: {										// additional methods
			redisplay: function() { ... redisplay shape ...}
		},
		wrappers: { 									// wrappers for existing methods
			moveto: redisplayWrapper, 
			moveby: redisplayWrapper
		}
	};
	// add the mixin to a class
	Shape.mixin(displayMixin);
	var c = Circle.create();
	c.moveby(10, 12); // calls redisplay
// [end mixin]

// [begin wrapfield]
	// wrap the radius field so that the circle gets redisplayed when assigning its radius
	Shape.wrapFields({
		set radius(r) { this._set(r); this.redisplay(); }	// this._set() and this._get(val) invoke the original setter/getter
	});
	// note: this can also be specified in a mixin in the 'fieldWrappers' property
// [end wrapfield]

	What's different about Classy compared to other frameworks:
	
	- Classes are objects, _not_ constructors in the Javascript sense.
	  This means that we can't use "new MyClass(...)" to create an object.
	  Instead, a class is instantiated using "MyClass.create(...)".
	  While the syntax is a matter of taste, this means that we have a real metaclass (the class's prototype)
	  and that we can easily add fields, methods, constructors and subclasses to the class using
	  method chaining: Classy.newClass().fields(...).constructors(...).methods(...);
	  These can be called in any order, as many times as you want.
	  Note however that if you add fields after having created objects, the existing objects
	  will not get these fields.
	
	- Object properties ('fields') can be automatically initialized with their default values
	  in every new object. Default values can be defined by a function, which will be called 
	  when initialising the object.
// [begin activefield]
	  Fields can be defined as "active" by specifying a getter and/or setter function.
	  This supports dynamically computed fields, or fields with side effects.
// [end activefield]
	  Declaring fields makes constructors easier to write, sometimes even unecessary.
	  Note that the default constructor (create) can take a literal object with property values
	  that are copied to the object. These properties are copied as is (no special treatment
	  of properties whose value is a function or which have setters and/or getters)
	
	- You are not stuck with a single constructor and complex parsing of its arguments
	  when you want different possible sets of parameters for your constructor.
	  Not only can you overload the default constructor (create) with your own,
	  you can also create other constructors with different names, each with their own parameters.
	  Because of the call to _super (see below), constructor chaining is much more convenient as well.
	
	- Constructors and methods can call-to-super, i.e. call the constructor or method that they
	  are overriding in a base class.
	  Call-to-super is simple: just use 'this._super(...)' in a constructor or method.
	  In my opinion, this is cleaner that, e.g., prototype.js use of $super or David Flanagan's
	  use of arguments.callee in his DefineClass method from his book.
	
// [begin mixin]	
	- Wrappers and mixins allow to modify a class. This goes beyond redefining or adding methods.
	  A wrapper redefines a method in a class in such a way that the original method can be called
	  using 'this._inner(...)'. This is similar to a call to super but within a class.
	  Wrappers can be stacked (a wrapper can be added to a method that already has a wrapper)
	  and removed dynamically.
	  A mixin is similar to a class that is 'merged' into an existing class: it can define fields
	  to be added to (future) objects of the class, new methods and wrappers, and a default constructor.
	  (One current limitation is that changes to a mixin after it is added to a class do not affect the class.)
	  Mixins provide some of the effects of multiple inheritance without many of the drawbacks.
	  Note that fields added by a mixin override fields with the same name in the orignal class, if they exist.
	  This can be useful, for example to change the default value, but it can also be dangerous 
	  if the collision was unexpected.
// [end mixin]
	
// [begin wrapfield]
	- A field of an existing object or class can be wrapped with a getter and/or setter.
	  This makes it possible to add side effects to every access (get or set) to a field.
	  Such field wrappers can be defined as part of a mixin, using the fieldWrappers property.
	  Like method wrappers, field wrappers do not apply to objects that already exist before 
	  the wrapper is defined.
	  Also, a given field can be wrapped only once per class or per mixin, but if several mixins
	  wrap the same field, the wrappers will be nested.
	- Wrappers can also be added on a per-object basis, with the methods wrapField, wrapFields, 
	  unwrapField and unwrapFields, defined for every object.
	- Note that o.unwrapField(s) is the only way to remove field wrappers from an existing object.
	  If a mixin is removed that has wrapped fields, existing objects are unaffected.
// [end wrapfield]

	I am not claiming this is a better framework than what's already out there.
	It's just different, with a different set of tradeoffs. And it was a good exercise
	for playing (and sometimes fighting with) Javascript's object model!
	
	Comments and suggestions welcome !
 */

//Classy = (function() {
(function(exports){

var Metaclass;

/*
 *	The constructor function for new objects.
 *	An object remembers its class and is inited first with its class (and the class's superclass) fields,
 *	then with the optional 'init' parameter, which is expected to be a literal object.
 */
function object(myClass, init) {
	this.__class = myClass;
	myClass.__init(this);

	// if there is a parameter, it is expected to be a list of field/values
	if (init)
		copyFields(init, this);
}

/*
 *	Create and return a copy of a value.
 *	Literal values are returned as is.
 *	Objects are recursively copied _except_ if they are:
 *		- a Classy object or class
 *		- an immutable object, recognized because it has a property '__immutable' that evaluates to true
 *	The deep copy takes proper care of shared objects and cycles.
 *	objectmap is an optional mapping of objects to their copies
 */
function copyValue(obj, /*opt*/ objectmap) {
	// simple case: objects that are simple values or objects that are immutable
    if (obj === null || typeof(obj) != 'object' || obj.__class || obj.__metaclass || obj.__immutable)
        return obj;
	
	// initialize the object map if undefined
	if (objectmap) {
		// lookup the object in the map and return the recorded copy if any
		var i = objectmap.objects.indexOf(obj);
		if (i >= 0)
			return objectmap.copies[i];
	}
	
    var newobj = new obj.constructor();	// this assumes the constructor does not need parameters
	if (objectmap) {
		// remember object mapping for cycles and shared subobjects
		objectmap.objects.push(obj);
		objectmap.copies.push(newobj);
	}
	
	// recursive copy
    for (var key in obj)
       newobj[key] = copyValue(obj[key], objectmap);
	return newobj;
}

/*
 *	copy a list of (non-active) fields into an object
 */
function copyFields(fields, obj) {
	var objectmap = { objects: [], copies: []};
	for (var f in fields) {
		var value = fields[f];
		if (typeof(value) == "function")
			obj[f] = value.apply(obj);	// dynamic value: call the function
		else
			obj[f] = copyValue(value, objectmap);	// smart copy of the value
	}
}

// [begin activefield]
/*
 *	If field is an active field of obj (i.e., field has a getter and/or setter),
 *	copy that field to target and return true, otherwise do nothing and return false.
 */
function copyActiveField(obj, field, target) {
	var d = Object.getOwnPropertyDescriptor(obj, field);
	if (d.get || d.set)
		Object.defineProperty(target, field, d);
	return (d.get || d.set);
	/*
	if (getter)
		target.__defineGetter__(field, getter);
	if (setter)
		target.__defineSetter__(field, setter);
	return (getter || setter);
*/
}

/*
 *	copy a list of active fields into an object
 */
function copyActiveFields(fields, obj) {
	for (var f in fields)
		copyActiveField(fields, f, obj);
}
// [end activefield]


/*
 *	Implement call to super in constructors.
 *	'constructorWithSuper' wraps the constructor 'fun' in a function that defines
 *	this._super(), as well as calling the mixins' constructors, if any.
 */

function noSuper() {}

function constructorWithSuper(myClass, name, fun) {
	var superclass = myClass.__superclass;
	
	// if there is no call to super, simply call the constructor function and the mixins' constructors
	if (fun.toString().search(/\W_super\W/m) < 0)
// [begin mixin]
		return function() {
			fun.apply(this, arguments);
			for (var m = 0; m < myClass.__mixins.length; m++)
				myClass.__mixins[m].constructor.apply(this);
			return this;
		};
// [end]
/* [begin !mixin]
		return fun;
   [end mixin] */


	// general case
	return function() {
		// create the _super function and store it in this._super.
		// save any previous value so we can restore it at the end
		var savedsuper = this._super;
		this._super = (superclass == Object) ? noSuper : (superclass.__constructors[name] || noSuper);
		try {
			var res = fun.apply(this, arguments);
// [begin mixin]
			for (var m = 0; m < myClass.__mixins.length; m++)
				myClass.__mixins[m].constructor.apply(this);
// [end mixin]
		} finally {
			if (savedsuper) this._super = savedsuper; else delete this._super;
		}
		return this;
	};
}

/*
 *	Implement call to super in a method.
 *	'methodWithSuper' wraps the method 'fun' in a function that defines this._super().
 */
function methodWithSuper(fun, name, superclass) {
	// optimization: no need to wrap if fun does not contain _super
	if (fun.toString().search(/\W_super\W/m) < 0)
		return fun;
	
	return function() {
		// create the _super function and store it in this._super.
		// save any previous value so we can restore it at the end
		var savedsuper = this._super;
		this._super = (superclass == Object) ? noSuper : (superclass.__methods[name] || noSuper);
		try {
			// call the original method
		 	return fun.apply(this, arguments);
		} finally {
			// restore state
			if (savedsuper) this._super = savedsuper; else delete this._super;
		}
	};
}

// [begin mixin]
/*
 *	This is similar to the above but for wrappers, which must also take care of _inner
 *	in a similar way as _super.	
 */
function wrapMixinMethod(fun, name, superclass) {
	// optimization: no need to wrap if fun does not contain _super or _inner
	if (fun.toString().search(/\W_super\W/m) < 0)
		if (fun.toString().search(/\W_inner\W/m) < 0 )
			// simple case where there is no _inner or _super: return the function itself
			return fun;
		else
			// we just need to support _inner
			return function() {
				var savedinner = this._inner;
				this._inner = arguments.callee.__inner;
				try {
					return fun.apply(this, arguments);
				} finally {
					// restore state
					if (savedinner) this._inner = savedinner; else delete this._inner;
				}
			};
	
	// this is the general case where we support both _inner and _super
	return function() {
		// save _super and _inner and set them to the proper values
		var savedsuper = this._super;
		this._super = (superclass == Object) ? noSuper : (superclass.__methods[name] || noSuper);
		var savedinner = this._inner;
		this._inner = arguments.callee.__inner;
		// call the original method
		try {
			return fun.apply(this, arguments);
		} finally {
			// restore _super and _inner
			if (savedsuper) this._super = savedsuper; else delete this._super;
			if (savedinner) this._inner = savedinner; else delete this._inner;
		}
	};
}

/*
 *	Add / remove mixin methods.
 *	Mixins are only allowed to define methods that are not already defined in the class.
 *	(Methods that are already defined are silently skipped).
 */
function defineMixinMethods(myClass, mixin) {
	// do not override methods (use wrappers for that)
	for (var m in mixin.methods)
		if (! myClass.ownMethod(m)) {
			var method = mixin.methods[m];
			myClass.method(m, method);
			// we need to mark that this method was added by the mixin so we can remove it later
			// 'method' either stores the method itself or the method wrapped for super
			// in the first case, we will be able to recognize the function later,
			// in the latter we need to decorate it.
			// note that if we decorated it in both cases, we would have the problem of decorating 
			// a mixin method that is used in several classes.
			var storedMethod = myClass.ownMethod(m);
			if (storedMethod != method)
				storedMethod.__owner = mixin;
		}
}

function undefineMixinMethods(myClass, mixin) {
	for (var m in mixin.methods) {
		var method = mixin.methods[m];
		var storedMethod = myClass.ownMethod(m);
		if (storedMethod && (storedMethod === method || storedMethod.__owner === mixin))
			delete myClass.__methods[m];	// *** note that if the method had wrappers, they are destroyed too
	}
}

/*
 *	Functions used to redefine a method that has wrappers:
 *	'unwrapWrappers' removes wrappers and returns them in an array
 *	if upto is undefined, all wrappers are removed and returned
 *	if upto is defined, all wrappers up to it are removed and all of them but 'upto' itself are returned
 *	'wrapWrapper' adds a list of wrappers returned by 'unwrapWrappers'	
 */
function unwrapWrappers(myClass, name, upto) {
	var fun = myClass.ownMethod(name);
	var wrappers = [];
	while (fun && fun.__inner) {
		var wrapper = myClass.__popWrapper(name);
		// stop if it's the one we're looking for, store it for later rewrapping otherwise
		if (upto && wrapper === upto)
			break;
		wrappers.push(wrapper);
		// walk down the stack of wrappers
		fun = fun.__inner;
	}
	return wrappers;
}

function wrapWrappers(theClass, name, wrappers) {
	for (var i = wrappers.length-1; i >= 0; i--)
		theClass.wrap (name, wrappers[i]);
}
// [end mixin]

// [begin wrapfield]
/*
 *	Wrap an existing field with getter and setter functions.
 *	The 'getter' and 'setter' functions can access the original field with this._get() and this._set(val).
 *	(Note that referring to the original field, say f, as this.f will cause an infinite recursion.)
 *	Multiple wrappers can be nested.
 *	'owner' is an arbitrary value that identifies the wrapper so it can be removed with unwrapField.
 */

function makeGetterSetter(obj, field, getter, setter, owner) {
	// the functions that implement _get and _set for use in the setter and getter
	var getWrapped = function() { return obj[field]; };
	var setWrapped = function(val) { obj[field] = val; };
	
	// the function that wraps the getter so that this._get() is defined
	var realGetter = getter;
	if (getter) {
		realGetter = function() {
			var savedGet = this._get; this._get = getWrapped;
			var savedSet = this._set; this._set = setWrapped;
			try {
				return getter.call(this);
			} finally {
				if (savedGet) this._get = savedGet; else delete this._get;
				if (savedSet) this._set = savedSet; else delete this._set;			
			}
		};
		realGetter.__orig = getter;
		if (owner) realGetter.__owner = owner;
	} else // *** this is to have a default getter in case none is defined. I thought we could do away with this
		realGetter = function() { return obj[field]; }
	
	// the function that wraps the setter so that this._set() is defined
	var realSetter = setter;
	if (setter) {
		realSetter = function(val) {
			var savedGet = this._get; this._get = getWrapped;
			var savedSet = this._set; this._set = setWrapped;
			try {
				setter.call(this, val);
			} finally {
				if (savedGet) this._get = savedGet; else delete this._get;
				if (savedSet) this._set = savedSet; else delete this._set;
			}
		};
		realSetter.__orig = setter;
		if (owner) realSetter.__owner = owner;
	} else // *** this is to have a default setter in case none is defined. I thought we could do away with this
		realSetter = function(val) { obj[field] = val; }
	
	return {
		getter: realGetter,
		setter: realSetter
	};
}

function wrapField(obj, field, getter, setter, owner) {
	// the wrapped field will be renamed $<field>
	var wrappedField = '$'+field;
	var d = Object.getOwnPropertyDescriptor(obj, field);
	var oldGetter = d ? d.get : undefined; //obj.__lookupGetter__(field);
	var oldSetter = d ? d.set : undefined; //obj.__lookupSetter__(field);
	
	// rename the wrapped field into $<field>
	if (obj.hasOwnProperty(wrappedField)) {
		// the field was already wrapped as $<field>, so wrap the original field (which becomes $$<field>, etc.) 
		var origGetter = oldGetter ? oldGetter.__orig : undefined;
		var origSetter = oldSetter ? oldSetter.__orig : undefined;
		var origOwner = oldGetter ? oldGetter.__owner : oldSetter.__owner;
		wrapField(obj, wrappedField, origGetter, origSetter, origOwner);
	} else if (oldGetter || oldSetter) {
		// the field was active: copy the getter and setter
		d = { enumerable: true, configurable: true };
		if (oldGetter)
			d.get = oldGetter;
		if (oldSetter)
			d.set = oldSetter;
		Object.defineProperty(obj, wrappedField, d);
		/*
		if (oldGetter)
			obj.__defineGetter__(wrappedField, oldGetter);
		if (oldSetter)
			obj.__defineSetter__(wrappedField, oldSetter);
		*/
	} else {
		// normal case: copy value
		obj[wrappedField] = obj[field];
	}
	
	// define the getter and setter for the wrapped field
	var wrapped = makeGetterSetter(obj, wrappedField, getter, setter, owner);
	
	// *** it seems that if we define one, we need to define both. I thought we could do away with this
	d = { enumerable: true, configurable: true };
	//if (getter)
		d.get = wrapped.getter;
	//if (setter)
		d.set = wrapped.setter;
	if (getter || setter)
		Object.defineProperty(obj, field, d);
	/*
	if (getter)
		obj.__defineGetter__(field, wrapped.getter);
//	else if (oldGetter)
//		obj.__defineGetter__(field, oldGetter);
	
	if (setter)
		obj.__defineSetter__(field, wrapped.setter);
//	else if (oldSetter)
//		obj.__defineSetter__(field, oldSetter);
	*/
}

function wrapFields(fields, obj, owner) {
	var d;
	for (var field in fields) {
		d = Object.getOwnPropertyDescriptor(fields, field);
		wrapField(obj, field, d.get, d.set/*fields.__lookupGetter__(field), fields.__lookupSetter__(field)*/, owner);
	}
}

/*
 *	unwrap a field
 *	'owner' specifies which wrapper to remove.
 */
function unwrapField(obj, field, owner) {
	var wrappedField = '$' + field;
	var found = !owner;
	
	var d = Object.getOwnPropertyDescriptor(obj, field);
	var getter = d ? d.get : undefined; //obj.__lookupGetter__(field);
	var setter = d ? d.set : undefined; //obj.__lookupSetter__(field);
	
	while (obj.hasOwnProperty(wrappedField)) {
		// retrieve getter and setter from wrapped field
		
		if (! found) {
			if (getter && getter.__owner === owner)
				found = true;
			else if (setter && setter.__owner === owner)
				found = true;
		}
		
		d = Object.getOwnPropertyDescriptor(obj, wrappedField);
		getter = d.get; //obj.__lookupGetter__(wrappedField);
		setter = d.set; //obj.__lookupSetter__(wrappedField);
				
		if (found) {
			delete obj[field];
			// copy wrapped field into current field
			if (getter || setter) {
				var origGetter = getter ? getter.__orig : undefined;
				var origSetter = setter ? setter.__orig : undefined;
				var origOwner = getter ? getter.__owner : (setter ? setter.__owner : undefined);

				var wrapped = makeGetterSetter(obj, wrappedField, origGetter, origSetter, origOwner);
				
				d = { enumerable: true, configurable: true };
				if (getter)
					d.get = wrapped.getter || getter;
				if (setter)
					d.set = wrapped.setter || setter
				Object.defineProperty(obj, field, d);
				/*
				if (getter)
					obj.__defineGetter__(field, wrapped.getter || getter);
				if (setter)
					obj.__defineSetter__(field, wrapped.setter || setter);
				*/
			} else
				obj[field] = obj[wrappedField];
			
			// remove the wrapped field since it is now copied into the current field
			delete obj[wrappedField];
		}
		
		// continue down the chain of wrapped fields
		field = wrappedField;
		wrappedField = '$' + field;
	}
}

/*
 *	unwrap all fields of the object that are wrapped by a given owner.
 */
function unwrapFields(obj, owner) {
	for (var field in obj)
		unwrapField(obj, field, owner);
}

// [end wrapfield]

/**/
		// each base class has a few object methods (in addition to those in Object, of course)
		// set can be used to set multiple field values at once
		// get can be used to get multiple field values at once
		// wrapField can be used to immediately wrap a field of this object
		// unwrapField can be used to remove it. Use a class as 'owner' to remove a field wrapped by a class,
		// and a mixin to remove a field wrapped by the mixin.

var objectMethods = {
			toString: function() { return this.__class ? 'instance of ' + this.__class : '[unknown Classy Object]';},
			className: function() { return this.__class.__name; },
			// classs (with 3ss because 'class' is reserved)
			classs: function() { return this.__class; },
			// Set one or more fields at once. 3 possible syntax:
			//	obj.set('field1', value1, 'field2', value2, ...)
			//	obj.set(['field1', 'field2', ...], [value1, value2, ...])
			//	obj.set({ field1: value, fields2: value2, ...})  - works also with one of our objects (use it's declared fields)
			// Fields that are not defined as such are ignored
			// set always returns the this object
			set: function(field, value /*varargs*/) {
				switch(arguments.length) {
					case 0:
						return this;

					case 1:
						// obj.set({f1: v1, f2: v2, ...})  - sets multiple values
						var obj = field;
						if (obj.__class) {	// this is one of our objects - use its fields
							var fields = obj.__class.listFields();
							for (var i = 0; i < fields.length; i++) {
								var name = fields[i];
								if (this.__class.hasField(name))
									this[name] = obj[name];
							}
						} else {
							for (var name in obj)
								if (this.__class.hasField(name))
									this[name] = obj[name];
						}
						return this;

					case 2:
						// obj.set(["f1", "f2", "f3"], [v1, v2,v3])  - sets multiple values
						if (field instanceof Array && value instanceof Array) {
							for (var i = 0; i < field.length; i++) {
								var name = field[i];
								if (this.__class.hasField(name))
									this[name] = value[i];
							}
							return this;
						}
						// fallthrough to catch the case obj.set('field', value)
					default:
						// obj.set("field", value, ...)
						for (var i = 0; i < arguments.length; i+= 2) {
							var name = arguments[i], value = arguments[i+1];
							if (this.__class.hasField(field))
								this[name] = value;
						}
						return this;
				}
			},
			// get the value of one or more fields. 5 possible syntax:
			//	obj.get()  - returns all the fields and their values in a literal object
			//	obj.get('field')  - returns value
			//	obj.get('field1', 'field2', ...)  - returns a flat field, value, ... list
			//	obj.get(['field1', 'field2', ...])  - returns an array of values
			//	obj.get({ field: v1, field2: v2, ...})  - values of existing fields are ignored, returns an object (works with one of our objects too)
			get: function(field /*varargs*/) {
				switch (arguments.length) {
					case 0:
						//	obj.get()  - returns all the fields
						var fields = this.__class.listFields();
						var obj = {};
						for (var i = 0; i < fields.length; i++) {
							var name = fields[i];
							obj[name] = this[name];
						}
						return obj;

					case 1:
						// obj.get(["f1", "f2", "f3"])  - returns array of values
						if (field instanceof Array) {
							var values = [];
							for (var i = 0; i < field.length; i++) {
								var name = field[i];
								if (this.__class.hasField(name))
									values.push(this[name]);
								else
									values.push(undefined);
							}
							return values;
						}

						// obj.get("field")  - returns single value
						if (typeof field == 'string' || field instanceof String) {
							if (this.__class.hasField(field))
								return this[field];
							return undefined;
						}

						// obj.get({f1: v1, f2: v2, ...})  - values are ignored
						if (typeof field == 'object') {
							var obj = {};
							if (obj.__class) {	// this is one of our objects
								var fields = obj.__class.listFields();
								for (var i = 0; i < fields.length; i++) {
									var name = fields[i];
									if (this.__class.hasField(name))
										obj[name] = this[name];
								}
							} else {
								for (name in field)
									if (this.__class.hasField(name))
										obj[name] = this[name];
							}
							return obj;					
						}
						return null;

					default:
						//	obj.get('field1', 'field2', ...)  - returns a flat field, value list
						var result = [];
						for (var i = 0; i < arguments.length; i++) {
							var name = arguments[i];
							if (this.__class.hasField(name))
								result.push(name, this[name]);
						}
						return result;
				}
			},
// [begin wrapfield]
			wrapField: function(field, getter, setter, /*opt*/ owner) { wrapField(this, field, getter, setter, owner || this); return this; },
			wrapFields: function(fields, /*opt*/ owner) { wrapFields(fields, this, owner || this); },
			unwrapField: function(field, /*opt*/ owner) { unwrapField(this, field, owner || this); return this; },
			unwrapFields: function(/*opt*/ owner) { unwrapFields(this, owner || this); return this; },
// [end wrapfield]
		};

/**/

/*
 *	Create a new class
 */
function newClass(superclass) {
	if (! superclass) 
		superclass = Object;
	
	// the future prototypes in the delegation chains for class methods (including constructors),
	// constructors (in fact, initializers), and methods
	var metaclass, constructors, methods;
	
	// the constructor for the metaclass object
	function classProto() {}
	
	if (superclass === Object) { // it's a new base class
		// the tail of the metaclass delegation chain is the Metaclass object itself.
		classProto.prototype = Metaclass;
		
		// the tail of the constructors delegation chain.
		constructors = {};
		
		/**/
		// the methods defined in every class
		function methodTable() {}
	    methodTable.prototype = objectMethods; 
	    methods = new methodTable(); 
	    /**/
	} else { // it's a new subclass
		// chain the metaclass to the superclass's metaclass
		classProto.prototype = superclass.__metaclass;
		
		// create a constructor table that is chained to the superclass's constructor table
		function ctorTable() {}
		ctorTable.prototype = superclass.__constructors;
		constructors = new ctorTable();
		
		// similarly, create a method table thast is chained to the superclass's method table
		function methodTable() {}
	    methodTable.prototype = superclass.__methods; 
	    methods = new methodTable(); 
	}
	
	// create the metaclass object. It's superclass is the metaclass of the superclass (!)
	metaclass = new classProto();
//	metaclass.superclass = classProto.prototype;
	
	// constructor for the class object itself
	// its prototype is the new metaclass
	// *** we could get rid of the '__' prefix now that all external methods are in other objects (metaclass, constructors, methods) ***
	var cls = function() {
		this.__metaclass = metaclass;
		this.__superclass = superclass;
		this.__constructors = constructors;
		this.__methods = methods;
		this.__fields = {};
		this.__activeFields = {};		// [activefield]
		this.__mixins = [];				// [mixin]
		this.__wrappedFields = {};		// [wrappedfield]
	};
	cls.prototype = metaclass;
	
	// finally, create and return the class itself
	return new cls();
}

/*
 *	Metaclass is the prototype for class objects.
 *	It contains the methods that can be called on a class:
 *		- name and toString, to give the class a name and print a simple text description ("class X")
 *		- __init and __alloc, for object creation, which are private (hence the __ prefix)
 *		- create, the default constructor for objects of this class
 *		- field, activField and fields, to declare fields
 *		- hasField, hasOwnField to test existence of a declared field (active or not)
 *		- constructor and constructors, to declare constructors
 *		- method and methods, to declare methods
 *		- subclass, to create a new subclass
 *		- superclass, to return the superclass
 *		- hasOwnMethod, hasOwnConstructor to test the existence of a method or constructor in that specific class
 *		- hasMethod, hasConstructor to test the existence of a method or constructor along the inheritance chain
 *		- classMethod, classMethods, classField, classFields to add class methods and fields	[metaclass]
 *		- wrap, unwrap, unwrapAll, wrappers, wrapped to manage method wrappers		[mixin]
 *		- wrapField, wrapFields to wrap fields with getter/setter	[wrapfield]
 *		- mixin, unmix, hasMixin to manage mixins									[mixin]
 *
 *	A few points worth noting:
 *		- default values: when creating a new object, the fields described in its class (and its superclasses)
 *		  are copied before the constructor itself is called.
 *		  If a default value is:
 *				- a scalar, a Classy object or class, its value is simply assigned to the object property
 *				- a litteral object or array, a (deep) copy is made and assigned to the object property
 *				- a function, the result of calling the function is assigned to the object property
 *				- an active field, i.e. a field with a getter and/or setter, the getter and/or setter are copied as is
 *		  In case you want a literal object to not be cloned but instead shared by the various instances,
 *		  you can do one of two things:
 *				- mark it as immutable by setting its __immutable property to true
 *				- define the following function:
 *					function shared(obj) { return function() {return obj; }};
 *				  and use it for the default value:
 *					field('color', shared({r: 0, g: 1, b:0.5}));
 *		
 */
Metaclass = {
	// convenience functions to give/get the class a name - helpful when debugging
	name: function(name) {
		this.__name = name;
		return this;
	},
	className: function() {
		return this.__name;
	},

	// short text description: 'class X' if it has a name, 'class #nn' otherwise
	toString: function() {
		return 'class '+ (this.__name || '');
	},

	// same for util.inspect
	inspect: function() {
		return this.toString();
	},
	
	// return the superclass
	superclass: function() {
		return this.__superclass;
	},

	// intialize the properties of a new object from the default values of the field
	__init: function(obj) {
		// walk up the inheritance chain to start at the top
		if (this.__superclass !== Object)
			this.__superclass.__init(obj);
		
		// 'intelligently' copy the default values:
		copyFields(this.__fields, obj);
		copyActiveFields(this.__activeFields, obj);			// [activefield]
		wrapFields(this.__wrappedFields, obj, this);		// [wrapfield];
// [begin mixin]
		for (var m = 0; m < this.__mixins.length; m++) {
			var mixin = this.__mixins[m]; 
			copyFields(mixin.fields, obj);
			wrapFields(mixin.fieldWrappers, obj, mixin);	// [wrapfield];
		}
// [end mixin]
	},
	
	// allocate a new object and initialize its properties
	__alloc: function(init) {
		// set the proper prototype before calling the object constructor
		object.prototype = this.__methods;
		return new object(this, init);
	},
	
	create: function(init) {
		var newobj = this.__alloc(init);
// [begin mixin]
		for (var m = 0; m < this.__mixins.length; m++)
			this.__mixins[m].constructor.apply(newobj);
// [end mixin]
		return newobj;
	},
	
	// define a field with its default value
	field: function(name, value) {
		this.__fields[name] = value;
		return this;
	},
	
	// define an active field with its getter and setter
	activeField: function(name, getter, setter) {
		var d = { enumerable: true, configurable: true };
		if (getter)
			d.get = getter;
		if (setter)
			d.set = setter;
		Object.defineProperty(this.__activeFields, name, d);
		return this;
	},
	
	// define multiple fields at once, using a literal object of the form {x: 0, y: 0}
	// this form also supports active fields, i.e. fields with getter and/or setter, e.g. {get x() {...}, set x(val) {...}, ...}
	fields: function(list) {
		for (var item in list)
			if (! copyActiveField(list, item, this.__activeFields))	// [activefield]
				this.field(item, list[item]);
		return this;
	},
	
	// return true if field defined in this class
	hasOwnField: function(name) {
		return this.__fields.hasOwnProperty(name) || this.__activeFields.hasOwnProperty(name);
	},

	// return true if field defined in this class or a superclass
	hasField: function(name) {
		var cl = this;
		do {
			if (cl.hasOwnField(name))
				return true;
			cl = cl.__superclass;
		} while (cl != Object);
		return false;
	},

	// return array with names of local fields
	listOwnFields: function() {
		var result = [];
		for (var field in this.__fields)
			result.push(field);
		for (field in this.__activeFields)
			result.push(field);
		return result;
	},

	// return array with names of fields in this class and any superclass
	listFields: function() {
		var cl = this;
		var result = [];
		var field;
		do {
			for (field in cl.__fields)
				if (result.indexOf(field) < 0)
					result.push(field);
			for (field in cl.__activeFields)
				if (result.indexOf(field) < 0)
					result.push(field);
			cl = cl.__superclass;
		} while (cl != Object);
		return result;
	},

	// define one constructor. Omit the name or use 'create' for the default constructor
	constructor: function(name, fun) {
		// define the default 'create' constructor if name is omitted
		if (! fun && typeof(name) == 'function') {
			fun = name;
			name = 'create';
		}
		
		// create the initialization function and store it in __constructors
		fun = constructorWithSuper(this, name, fun);		
		this.__constructors[name] = fun;
		
		// create the actual constructor function, which creates the object with __alloc and then calls the initializer
		// note that by storing this constructor in the metaclass, it is visible to this class and all its subclasses
		// through the delegation link established in newClass
		this.__metaclass[name] = function() {
			var obj = this.__alloc();
			fun.apply(obj, arguments);
			return obj;
		};
		return this;
	},
	
	// define multiple constructors at once, using a literal object
	constructors: function(list) {
		for (var item in list)
			this.constructor(item, list[item]);
		return this;
	},
	
	// define (or redefine) one method - *** note that if the method exists and has wrappers, they are all removed
	method: function(name, fun) {
		if (! fun) {	// undefine the method (and all its wrappers)
			delete this.__methods[name];
			return this;
		}
		var wrappers = unwrapWrappers(this, name);	// [mixin]
		fun = methodWithSuper(fun, name, this.__superclass);
		this.__methods[name] = fun;
		wrapWrappers(this, name, wrappers);			// [mixin]
		return this;
	},

	// define multiple methods at once, using a literal object
	methods: function(list) {
		for (var item in list)
			this.method(item, list[item]);
		return this;
	},
	
	// create a subclass of this class
	subclass: function() {
		return newClass(this);
	},
	
	// return the superclass of this class
	superclass: function() {
		return this.__superclass;
	},
	
	// test existence of method and constructor in this class
	hasOwnConstructor: function(name) {
		return name == 'create' || this.__constructors.hasOwnProperty(name);
	},
	hasOwnMethod: function(name) {
		return this.__methods.hasOwnProperty(name);
	},
	
	// get constructor and method bodies
	ownConstructor: function(name) {
		return this.__constructors.hasOwnProperty(name || 'create');
	},
	ownMethod: function(name) {
		return this.__methods.hasOwnProperty(name) ? this.__methods[name] : undefined;
	},
	
	// return array with names of local fields
	listOwnMethods: function() {
/*		var result = [];
		for (var method in this.__methods)
			result.push(method);
		return result;
*/
/**/
		return Object.keys(this.__methods);
/**/
	},

	// return array with names of fields in this class and any superclass
	listMethods: function() {
		var cl = this;
		var result = [];
		var method;
		do {
			for (method in cl.__methods)
				if (result.indexOf(method) < 0)
					result.push(method);
			cl = cl.__superclass;
		} while (cl != Object);
		return result;
	},

	// test existence of method and constructor in this class or one of its superclasses
	hasConstructor: function(name) {
		return name == 'create' || (this.__constructors[name] !== undefined);
	},
	hasMethod: function(name) {
		return this.__methods[name] !== undefined;
	},

	getMethod: function(name) {
		return this.__methods[name];
	},

// [begin metaclass]
	classMethod: function(name, fun) {
		if (! fun) {	// undefine the class method
			delete this.__metaclass[name];
			return this;
		}
		this.__metaclass[name] = fun;
		return this;
	},
	
	classMethods: function(list) {
		for (var item in list)
			this.classMethod(item, list[item]);
		return this;
	},
	
	classField: function(name, value) {
		this.__metaclass[name] = value;
		return this;
	},
	
	classFields: function(list) {
		for (var item in list)
			if (! copyActiveField(list, item, this.__metaclass))	// [activefield]
				this.classField(item, list[item]);
		return this;
	},
// [end metaclass]

// [begin mixin]
	// add a wrapper to method 'name'
	wrap: function(name, fun) {
		// the method being wrapped
		var forig = this.ownMethod(name);
		// define the wrapping method in such a way that this._inner calls the method being wrapped
		var fnew = wrapMixinMethod(fun, name, this.__superclass);
		// store the original method in fnew.__inner so it can be accessed when it is called
		// optimization: this is not necessary when the wrapper does not call _super nor _inner
		// if there was no method being wrapped, create a dummy one that just calls _super and mark it as such
		if (fnew !== fun)
			fnew.__inner = forig || methodWithSuper(function() { this._super.apply(this, arguments); }, name, this.__superclass);
		if (! forig)
			fnew.__wasempty = true;
		fnew.__wrapper = fun; // remember the original wrapper so we can unwrap it
		this.__methods[name] = fnew;

		return this;
	},
	
	// define multiple wrappers at once, using a literal object
	wrappers: function(list) {
		for (var item in list)
			this.wrap(item, list[item]);
		return this;
	},
	
	// test if the method is wrapped by wrapper (if wrapper is not specified, test if method is wrapped)
	wrapped: function(name, wrapper) {
		var fun = this.ownMethod(name);
		if (! wrapper)
			return fun && fun.__inner;
		while (fun && fun.__inner) {
			if (fun.__wrapper === wrapper)
				return true;
			fun = fun.__inner;
		}
		return false;
	},
	
	// internal method to remove the top wrapper
	__popWrapper: function(name) {
		var fun = this.ownMethod(name);
		if (fun.__wasempty)	// this is when we wrap a non-existing method
			delete this.__methods[name];
		else
			this.__methods[name] = fun.__inner;
		return fun.__wrapper;
	},
	
	// remove a wrapper (or the top one if it is not specified)
	unwrap: function(name, wrapper) {
		var fun = this.ownMethod(name);
		if (! wrapper && fun)
			wrapper = fun.__wrapper;
		var rewrap = unwrapWrappers(this, name, wrapper);
		wrapWrappers(this, name, rewrap);
		
		return this;
	},
	
	// unwrap all wrappers from method name
	unwrapAll: function(name) {
		unwrapWrappers(this, name);
		
		return this;
	},
	
// [begin wrapfield]
	// wrap one field
	wrapField: function(field, getter, setter) {
		var d = { enumerable: true, configurable: true };
		if (getter)
			d.get = getter;
		if (setter)
			d.set = setter;
		if (getter || setter)
			Object.defineProperty(this.__wrappedFields, field, d);
		/*
		if (getter)
			this.__wrappedFields.__defineGetter__(field, getter);
		if (setter)
			this.__wrappedFields.__defineSetter__(field, setter);
		*/
		return this;
	},
	
	// wrap one or more fields defined in a property list with "set f() / get f(val)" syntax
	wrapFields: function(list) {
		for (var item in list)
			copyActiveField(list, item, this.__wrappedFields);
		// note: non active fields are ignored silently
		return this;
	},
	
	// test if a field is being wrapped
	wrappedField: function(field) {
		return this.__wrappedFields.hasOwnProperty(field);
	},
	
	// stop wrapping a field (note: this does _not_ remove it from existing objects)
	unwrapField: function(field) {
		delete this.__wrappedFields[field];
		return this;
	},
	
// [end wrapfield]

	// add a mixin
	mixin: function(mixin) {
		this.__mixins.push(mixin);
		defineMixinMethods(this, mixin);
		this.wrappers(mixin.wrappers);
		
		return this;
	},
	
	// remove a mixin - *** wrapped fields are not unwrapped ***
	unmix: function(mixin) {
		var i = this.__mixins.indexOf(mixin);
		if (i < 0)
			return this;
		// remove mixin from array
		this.__mixins.splice(i, 1);	
		// remove wrappers
		for (var m in mixin.wrappers)
			this.unwrap(m, mixin.wrappers[m]);
		// remove methods (only those that were actually added)
		undefineMixinMethods(this, mixin);
		return this;
	},
	
	// test if a mixin is applied to the class
	hasMixin: function(mixin) {
		return this.__mixins.indexOf(mixin) >= 0;
	},
// [end mixin]

};

// end of CLassy definition: return the exported objects
//	return {
/***
exports = module.exports = {
		newClass: newClass,		// this is all we need to use Classy
		metaclass: Metaclass,	// this is for those who want to fiddle with the metaclass, e.g. to add new methods
								// For any Classy class, "A instanceof Classy.metaclass" returns true
		object: object,			// this is the constructor of Classy objects, i.e. "o instanceof Classy.object" returns true
	};
***/
//})();

exports.newClass = newClass;	// this is all we need to use Classy
exports.metaclass = Metaclass;	// this is for those who want to fiddle with the metaclass, e.g. to add new methods
								// For any Classy class, "A instanceof Classy.metaclass" returns true
exports.object = object;		// this is the constructor of Classy objects, i.e. "o instanceof Classy.object" returns true

// hack from http://caolanmcmahon.com/posts/writing_for_node_and_the_browser/
// to have code that works both in server and client (alternative is require.js, but it is a lot more heavy)
})(typeof exports === 'undefined' ? this['OO'] = {} : exports);

},{}],"socket.io-client":[function(require,module,exports){
module.exports=require('UPfOTt');
},{}],"UPfOTt":[function(require,module,exports){
/*! Socket.IO.js build:0.9.16, development. Copyright(c) 2011 LearnBoost <dev@learnboost.com> MIT Licensed */

var io = ('undefined' === typeof module ? {} : module.exports);
(function() {

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, global) {

  /**
   * IO namespace.
   *
   * @namespace
   */

  var io = exports;

  /**
   * Socket.IO version
   *
   * @api public
   */

  io.version = '0.9.16';

  /**
   * Protocol implemented.
   *
   * @api public
   */

  io.protocol = 1;

  /**
   * Available transports, these will be populated with the available transports
   *
   * @api public
   */

  io.transports = [];

  /**
   * Keep track of jsonp callbacks.
   *
   * @api private
   */

  io.j = [];

  /**
   * Keep track of our io.Sockets
   *
   * @api private
   */
  io.sockets = {};


  /**
   * Manages connections to hosts.
   *
   * @param {String} uri
   * @Param {Boolean} force creation of new socket (defaults to false)
   * @api public
   */

  io.connect = function (host, details) {
    var uri = io.util.parseUri(host)
      , uuri
      , socket;

    if (global && global.location) {
      uri.protocol = uri.protocol || global.location.protocol.slice(0, -1);
      uri.host = uri.host || (global.document
        ? global.document.domain : global.location.hostname);
      uri.port = uri.port || global.location.port;
    }

    uuri = io.util.uniqueUri(uri);

    var options = {
        host: uri.host
      , secure: 'https' == uri.protocol
      , port: uri.port || ('https' == uri.protocol ? 443 : 80)
      , query: uri.query || ''
    };

    io.util.merge(options, details);

    if (options['force new connection'] || !io.sockets[uuri]) {
      socket = new io.Socket(options);
    }

    if (!options['force new connection'] && socket) {
      io.sockets[uuri] = socket;
    }

    socket = socket || io.sockets[uuri];

    // if path is different from '' or /
    return socket.of(uri.path.length > 1 ? uri.path : '');
  };

})('object' === typeof module ? module.exports : (this.io = {}), this);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, global) {

  /**
   * Utilities namespace.
   *
   * @namespace
   */

  var util = exports.util = {};

  /**
   * Parses an URI
   *
   * @author Steven Levithan <stevenlevithan.com> (MIT license)
   * @api public
   */

  var re = /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

  var parts = ['source', 'protocol', 'authority', 'userInfo', 'user', 'password',
               'host', 'port', 'relative', 'path', 'directory', 'file', 'query',
               'anchor'];

  util.parseUri = function (str) {
    var m = re.exec(str || '')
      , uri = {}
      , i = 14;

    while (i--) {
      uri[parts[i]] = m[i] || '';
    }

    return uri;
  };

  /**
   * Produces a unique url that identifies a Socket.IO connection.
   *
   * @param {Object} uri
   * @api public
   */

  util.uniqueUri = function (uri) {
    var protocol = uri.protocol
      , host = uri.host
      , port = uri.port;

    if ('document' in global) {
      host = host || document.domain;
      port = port || (protocol == 'https'
        && document.location.protocol !== 'https:' ? 443 : document.location.port);
    } else {
      host = host || 'localhost';

      if (!port && protocol == 'https') {
        port = 443;
      }
    }

    return (protocol || 'http') + '://' + host + ':' + (port || 80);
  };

  /**
   * Mergest 2 query strings in to once unique query string
   *
   * @param {String} base
   * @param {String} addition
   * @api public
   */

  util.query = function (base, addition) {
    var query = util.chunkQuery(base || '')
      , components = [];

    util.merge(query, util.chunkQuery(addition || ''));
    for (var part in query) {
      if (query.hasOwnProperty(part)) {
        components.push(part + '=' + query[part]);
      }
    }

    return components.length ? '?' + components.join('&') : '';
  };

  /**
   * Transforms a querystring in to an object
   *
   * @param {String} qs
   * @api public
   */

  util.chunkQuery = function (qs) {
    var query = {}
      , params = qs.split('&')
      , i = 0
      , l = params.length
      , kv;

    for (; i < l; ++i) {
      kv = params[i].split('=');
      if (kv[0]) {
        query[kv[0]] = kv[1];
      }
    }

    return query;
  };

  /**
   * Executes the given function when the page is loaded.
   *
   *     io.util.load(function () { console.log('page loaded'); });
   *
   * @param {Function} fn
   * @api public
   */

  var pageLoaded = false;

  util.load = function (fn) {
    if ('document' in global && document.readyState === 'complete' || pageLoaded) {
      return fn();
    }

    util.on(global, 'load', fn, false);
  };

  /**
   * Adds an event.
   *
   * @api private
   */

  util.on = function (element, event, fn, capture) {
    if (element.attachEvent) {
      element.attachEvent('on' + event, fn);
    } else if (element.addEventListener) {
      element.addEventListener(event, fn, capture);
    }
  };

  /**
   * Generates the correct `XMLHttpRequest` for regular and cross domain requests.
   *
   * @param {Boolean} [xdomain] Create a request that can be used cross domain.
   * @returns {XMLHttpRequest|false} If we can create a XMLHttpRequest.
   * @api private
   */

  util.request = function (xdomain) {

    if (xdomain && 'undefined' != typeof XDomainRequest && !util.ua.hasCORS) {
      return new XDomainRequest();
    }

    if ('undefined' != typeof XMLHttpRequest && (!xdomain || util.ua.hasCORS)) {
      return new XMLHttpRequest();
    }

    if (!xdomain) {
      try {
        return new window[(['Active'].concat('Object').join('X'))]('Microsoft.XMLHTTP');
      } catch(e) { }
    }

    return null;
  };

  /**
   * XHR based transport constructor.
   *
   * @constructor
   * @api public
   */

  /**
   * Change the internal pageLoaded value.
   */

  if ('undefined' != typeof window) {
    util.load(function () {
      pageLoaded = true;
    });
  }

  /**
   * Defers a function to ensure a spinner is not displayed by the browser
   *
   * @param {Function} fn
   * @api public
   */

  util.defer = function (fn) {
    if (!util.ua.webkit || 'undefined' != typeof importScripts) {
      return fn();
    }

    util.load(function () {
      setTimeout(fn, 100);
    });
  };

  /**
   * Merges two objects.
   *
   * @api public
   */

  util.merge = function merge (target, additional, deep, lastseen) {
    var seen = lastseen || []
      , depth = typeof deep == 'undefined' ? 2 : deep
      , prop;

    for (prop in additional) {
      if (additional.hasOwnProperty(prop) && util.indexOf(seen, prop) < 0) {
        if (typeof target[prop] !== 'object' || !depth) {
          target[prop] = additional[prop];
          seen.push(additional[prop]);
        } else {
          util.merge(target[prop], additional[prop], depth - 1, seen);
        }
      }
    }

    return target;
  };

  /**
   * Merges prototypes from objects
   *
   * @api public
   */

  util.mixin = function (ctor, ctor2) {
    util.merge(ctor.prototype, ctor2.prototype);
  };

  /**
   * Shortcut for prototypical and static inheritance.
   *
   * @api private
   */

  util.inherit = function (ctor, ctor2) {
    function f() {};
    f.prototype = ctor2.prototype;
    ctor.prototype = new f;
  };

  /**
   * Checks if the given object is an Array.
   *
   *     io.util.isArray([]); // true
   *     io.util.isArray({}); // false
   *
   * @param Object obj
   * @api public
   */

  util.isArray = Array.isArray || function (obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  };

  /**
   * Intersects values of two arrays into a third
   *
   * @api public
   */

  util.intersect = function (arr, arr2) {
    var ret = []
      , longest = arr.length > arr2.length ? arr : arr2
      , shortest = arr.length > arr2.length ? arr2 : arr;

    for (var i = 0, l = shortest.length; i < l; i++) {
      if (~util.indexOf(longest, shortest[i]))
        ret.push(shortest[i]);
    }

    return ret;
  };

  /**
   * Array indexOf compatibility.
   *
   * @see bit.ly/a5Dxa2
   * @api public
   */

  util.indexOf = function (arr, o, i) {

    for (var j = arr.length, i = i < 0 ? i + j < 0 ? 0 : i + j : i || 0;
         i < j && arr[i] !== o; i++) {}

    return j <= i ? -1 : i;
  };

  /**
   * Converts enumerables to array.
   *
   * @api public
   */

  util.toArray = function (enu) {
    var arr = [];

    for (var i = 0, l = enu.length; i < l; i++)
      arr.push(enu[i]);

    return arr;
  };

  /**
   * UA / engines detection namespace.
   *
   * @namespace
   */

  util.ua = {};

  /**
   * Whether the UA supports CORS for XHR.
   *
   * @api public
   */

  util.ua.hasCORS = 'undefined' != typeof XMLHttpRequest && (function () {
    try {
      var a = new XMLHttpRequest();
    } catch (e) {
      return false;
    }

    return a.withCredentials != undefined;
  })();

  /**
   * Detect webkit.
   *
   * @api public
   */

  util.ua.webkit = 'undefined' != typeof navigator
    && /webkit/i.test(navigator.userAgent);

   /**
   * Detect iPad/iPhone/iPod.
   *
   * @api public
   */

  util.ua.iDevice = 'undefined' != typeof navigator
      && /iPad|iPhone|iPod/i.test(navigator.userAgent);

})('undefined' != typeof io ? io : module.exports, this);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.EventEmitter = EventEmitter;

  /**
   * Event emitter constructor.
   *
   * @api public.
   */

  function EventEmitter () {};

  /**
   * Adds a listener
   *
   * @api public
   */

  EventEmitter.prototype.on = function (name, fn) {
    if (!this.$events) {
      this.$events = {};
    }

    if (!this.$events[name]) {
      this.$events[name] = fn;
    } else if (io.util.isArray(this.$events[name])) {
      this.$events[name].push(fn);
    } else {
      this.$events[name] = [this.$events[name], fn];
    }

    return this;
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  /**
   * Adds a volatile listener.
   *
   * @api public
   */

  EventEmitter.prototype.once = function (name, fn) {
    var self = this;

    function on () {
      self.removeListener(name, on);
      fn.apply(this, arguments);
    };

    on.listener = fn;
    this.on(name, on);

    return this;
  };

  /**
   * Removes a listener.
   *
   * @api public
   */

  EventEmitter.prototype.removeListener = function (name, fn) {
    if (this.$events && this.$events[name]) {
      var list = this.$events[name];

      if (io.util.isArray(list)) {
        var pos = -1;

        for (var i = 0, l = list.length; i < l; i++) {
          if (list[i] === fn || (list[i].listener && list[i].listener === fn)) {
            pos = i;
            break;
          }
        }

        if (pos < 0) {
          return this;
        }

        list.splice(pos, 1);

        if (!list.length) {
          delete this.$events[name];
        }
      } else if (list === fn || (list.listener && list.listener === fn)) {
        delete this.$events[name];
      }
    }

    return this;
  };

  /**
   * Removes all listeners for an event.
   *
   * @api public
   */

  EventEmitter.prototype.removeAllListeners = function (name) {
    if (name === undefined) {
      this.$events = {};
      return this;
    }

    if (this.$events && this.$events[name]) {
      this.$events[name] = null;
    }

    return this;
  };

  /**
   * Gets all listeners for a certain event.
   *
   * @api publci
   */

  EventEmitter.prototype.listeners = function (name) {
    if (!this.$events) {
      this.$events = {};
    }

    if (!this.$events[name]) {
      this.$events[name] = [];
    }

    if (!io.util.isArray(this.$events[name])) {
      this.$events[name] = [this.$events[name]];
    }

    return this.$events[name];
  };

  /**
   * Emits an event.
   *
   * @api public
   */

  EventEmitter.prototype.emit = function (name) {
    if (!this.$events) {
      return false;
    }

    var handler = this.$events[name];

    if (!handler) {
      return false;
    }

    var args = Array.prototype.slice.call(arguments, 1);

    if ('function' == typeof handler) {
      handler.apply(this, args);
    } else if (io.util.isArray(handler)) {
      var listeners = handler.slice();

      for (var i = 0, l = listeners.length; i < l; i++) {
        listeners[i].apply(this, args);
      }
    } else {
      return false;
    }

    return true;
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Based on JSON2 (http://www.JSON.org/js.html).
 */

(function (exports, nativeJSON) {
  "use strict";

  // use native JSON if it's available
  if (nativeJSON && nativeJSON.parse){
    return exports.JSON = {
      parse: nativeJSON.parse
    , stringify: nativeJSON.stringify
    };
  }

  var JSON = exports.JSON = {};

  function f(n) {
      // Format integers to have at least two digits.
      return n < 10 ? '0' + n : n;
  }

  function date(d, key) {
    return isFinite(d.valueOf()) ?
        d.getUTCFullYear()     + '-' +
        f(d.getUTCMonth() + 1) + '-' +
        f(d.getUTCDate())      + 'T' +
        f(d.getUTCHours())     + ':' +
        f(d.getUTCMinutes())   + ':' +
        f(d.getUTCSeconds())   + 'Z' : null;
  };

  var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
      escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
      gap,
      indent,
      meta = {    // table of character substitutions
          '\b': '\\b',
          '\t': '\\t',
          '\n': '\\n',
          '\f': '\\f',
          '\r': '\\r',
          '"' : '\\"',
          '\\': '\\\\'
      },
      rep;


  function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

      escapable.lastIndex = 0;
      return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
          var c = meta[a];
          return typeof c === 'string' ? c :
              '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
      }) + '"' : '"' + string + '"';
  }


  function str(key, holder) {

// Produce a string from holder[key].

      var i,          // The loop counter.
          k,          // The member key.
          v,          // The member value.
          length,
          mind = gap,
          partial,
          value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

      if (value instanceof Date) {
          value = date(key);
      }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

      if (typeof rep === 'function') {
          value = rep.call(holder, key, value);
      }

// What happens next depends on the value's type.

      switch (typeof value) {
      case 'string':
          return quote(value);

      case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

          return isFinite(value) ? String(value) : 'null';

      case 'boolean':
      case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

          return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

      case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

          if (!value) {
              return 'null';
          }

// Make an array to hold the partial results of stringifying this object value.

          gap += indent;
          partial = [];

// Is the value an array?

          if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

              length = value.length;
              for (i = 0; i < length; i += 1) {
                  partial[i] = str(i, value) || 'null';
              }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

              v = partial.length === 0 ? '[]' : gap ?
                  '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']' :
                  '[' + partial.join(',') + ']';
              gap = mind;
              return v;
          }

// If the replacer is an array, use it to select the members to be stringified.

          if (rep && typeof rep === 'object') {
              length = rep.length;
              for (i = 0; i < length; i += 1) {
                  if (typeof rep[i] === 'string') {
                      k = rep[i];
                      v = str(k, value);
                      if (v) {
                          partial.push(quote(k) + (gap ? ': ' : ':') + v);
                      }
                  }
              }
          } else {

// Otherwise, iterate through all of the keys in the object.

              for (k in value) {
                  if (Object.prototype.hasOwnProperty.call(value, k)) {
                      v = str(k, value);
                      if (v) {
                          partial.push(quote(k) + (gap ? ': ' : ':') + v);
                      }
                  }
              }
          }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

          v = partial.length === 0 ? '{}' : gap ?
              '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}' :
              '{' + partial.join(',') + '}';
          gap = mind;
          return v;
      }
  }

// If the JSON object does not yet have a stringify method, give it one.

  JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

      var i;
      gap = '';
      indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

      if (typeof space === 'number') {
          for (i = 0; i < space; i += 1) {
              indent += ' ';
          }

// If the space parameter is a string, it will be used as the indent string.

      } else if (typeof space === 'string') {
          indent = space;
      }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

      rep = replacer;
      if (replacer && typeof replacer !== 'function' &&
              (typeof replacer !== 'object' ||
              typeof replacer.length !== 'number')) {
          throw new Error('JSON.stringify');
      }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

      return str('', {'': value});
  };

// If the JSON object does not yet have a parse method, give it one.

  JSON.parse = function (text, reviver) {
  // The parse method takes a text and an optional reviver function, and returns
  // a JavaScript value if the text is a valid JSON text.

      var j;

      function walk(holder, key) {

  // The walk method is used to recursively walk the resulting structure so
  // that modifications can be made.

          var k, v, value = holder[key];
          if (value && typeof value === 'object') {
              for (k in value) {
                  if (Object.prototype.hasOwnProperty.call(value, k)) {
                      v = walk(value, k);
                      if (v !== undefined) {
                          value[k] = v;
                      } else {
                          delete value[k];
                      }
                  }
              }
          }
          return reviver.call(holder, key, value);
      }


  // Parsing happens in four stages. In the first stage, we replace certain
  // Unicode characters with escape sequences. JavaScript handles many characters
  // incorrectly, either silently deleting them, or treating them as line endings.

      text = String(text);
      cx.lastIndex = 0;
      if (cx.test(text)) {
          text = text.replace(cx, function (a) {
              return '\\u' +
                  ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
          });
      }

  // In the second stage, we run the text against regular expressions that look
  // for non-JSON patterns. We are especially concerned with '()' and 'new'
  // because they can cause invocation, and '=' because it can cause mutation.
  // But just to be safe, we want to reject all unexpected forms.

  // We split the second stage into 4 regexp operations in order to work around
  // crippling inefficiencies in IE's and Safari's regexp engines. First we
  // replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
  // replace all simple value tokens with ']' characters. Third, we delete all
  // open brackets that follow a colon or comma or that begin the text. Finally,
  // we look to see that the remaining characters are only whitespace or ']' or
  // ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

      if (/^[\],:{}\s]*$/
              .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                  .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                  .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

  // In the third stage we use the eval function to compile the text into a
  // JavaScript structure. The '{' operator is subject to a syntactic ambiguity
  // in JavaScript: it can begin a block or an object literal. We wrap the text
  // in parens to eliminate the ambiguity.

          j = eval('(' + text + ')');

  // In the optional fourth stage, we recursively walk the new structure, passing
  // each name/value pair to a reviver function for possible transformation.

          return typeof reviver === 'function' ?
              walk({'': j}, '') : j;
      }

  // If the text is not JSON parseable, then a SyntaxError is thrown.

      throw new SyntaxError('JSON.parse');
  };

})(
    'undefined' != typeof io ? io : module.exports
  , typeof JSON !== 'undefined' ? JSON : undefined
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Parser namespace.
   *
   * @namespace
   */

  var parser = exports.parser = {};

  /**
   * Packet types.
   */

  var packets = parser.packets = [
      'disconnect'
    , 'connect'
    , 'heartbeat'
    , 'message'
    , 'json'
    , 'event'
    , 'ack'
    , 'error'
    , 'noop'
  ];

  /**
   * Errors reasons.
   */

  var reasons = parser.reasons = [
      'transport not supported'
    , 'client not handshaken'
    , 'unauthorized'
  ];

  /**
   * Errors advice.
   */

  var advice = parser.advice = [
      'reconnect'
  ];

  /**
   * Shortcuts.
   */

  var JSON = io.JSON
    , indexOf = io.util.indexOf;

  /**
   * Encodes a packet.
   *
   * @api private
   */

  parser.encodePacket = function (packet) {
    var type = indexOf(packets, packet.type)
      , id = packet.id || ''
      , endpoint = packet.endpoint || ''
      , ack = packet.ack
      , data = null;

    switch (packet.type) {
      case 'error':
        var reason = packet.reason ? indexOf(reasons, packet.reason) : ''
          , adv = packet.advice ? indexOf(advice, packet.advice) : '';

        if (reason !== '' || adv !== '')
          data = reason + (adv !== '' ? ('+' + adv) : '');

        break;

      case 'message':
        if (packet.data !== '')
          data = packet.data;
        break;

      case 'event':
        var ev = { name: packet.name };

        if (packet.args && packet.args.length) {
          ev.args = packet.args;
        }

        data = JSON.stringify(ev);
        break;

      case 'json':
        data = JSON.stringify(packet.data);
        break;

      case 'connect':
        if (packet.qs)
          data = packet.qs;
        break;

      case 'ack':
        data = packet.ackId
          + (packet.args && packet.args.length
              ? '+' + JSON.stringify(packet.args) : '');
        break;
    }

    // construct packet with required fragments
    var encoded = [
        type
      , id + (ack == 'data' ? '+' : '')
      , endpoint
    ];

    // data fragment is optional
    if (data !== null && data !== undefined)
      encoded.push(data);

    return encoded.join(':');
  };

  /**
   * Encodes multiple messages (payload).
   *
   * @param {Array} messages
   * @api private
   */

  parser.encodePayload = function (packets) {
    var decoded = '';

    if (packets.length == 1)
      return packets[0];

    for (var i = 0, l = packets.length; i < l; i++) {
      var packet = packets[i];
      decoded += '\ufffd' + packet.length + '\ufffd' + packets[i];
    }

    return decoded;
  };

  /**
   * Decodes a packet
   *
   * @api private
   */

  var regexp = /([^:]+):([0-9]+)?(\+)?:([^:]+)?:?([\s\S]*)?/;

  parser.decodePacket = function (data) {
    var pieces = data.match(regexp);

    if (!pieces) return {};

    var id = pieces[2] || ''
      , data = pieces[5] || ''
      , packet = {
            type: packets[pieces[1]]
          , endpoint: pieces[4] || ''
        };

    // whether we need to acknowledge the packet
    if (id) {
      packet.id = id;
      if (pieces[3])
        packet.ack = 'data';
      else
        packet.ack = true;
    }

    // handle different packet types
    switch (packet.type) {
      case 'error':
        var pieces = data.split('+');
        packet.reason = reasons[pieces[0]] || '';
        packet.advice = advice[pieces[1]] || '';
        break;

      case 'message':
        packet.data = data || '';
        break;

      case 'event':
        try {
          var opts = JSON.parse(data);
          packet.name = opts.name;
          packet.args = opts.args;
        } catch (e) { }

        packet.args = packet.args || [];
        break;

      case 'json':
        try {
          packet.data = JSON.parse(data);
        } catch (e) { }
        break;

      case 'connect':
        packet.qs = data || '';
        break;

      case 'ack':
        var pieces = data.match(/^([0-9]+)(\+)?(.*)/);
        if (pieces) {
          packet.ackId = pieces[1];
          packet.args = [];

          if (pieces[3]) {
            try {
              packet.args = pieces[3] ? JSON.parse(pieces[3]) : [];
            } catch (e) { }
          }
        }
        break;

      case 'disconnect':
      case 'heartbeat':
        break;
    };

    return packet;
  };

  /**
   * Decodes data payload. Detects multiple messages
   *
   * @return {Array} messages
   * @api public
   */

  parser.decodePayload = function (data) {
    // IE doesn't like data[i] for unicode chars, charAt works fine
    if (data.charAt(0) == '\ufffd') {
      var ret = [];

      for (var i = 1, length = ''; i < data.length; i++) {
        if (data.charAt(i) == '\ufffd') {
          ret.push(parser.decodePacket(data.substr(i + 1).substr(0, length)));
          i += Number(length) + 1;
          length = '';
        } else {
          length += data.charAt(i);
        }
      }

      return ret;
    } else {
      return [parser.decodePacket(data)];
    }
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.Transport = Transport;

  /**
   * This is the transport template for all supported transport methods.
   *
   * @constructor
   * @api public
   */

  function Transport (socket, sessid) {
    this.socket = socket;
    this.sessid = sessid;
  };

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(Transport, io.EventEmitter);


  /**
   * Indicates whether heartbeats is enabled for this transport
   *
   * @api private
   */

  Transport.prototype.heartbeats = function () {
    return true;
  };

  /**
   * Handles the response from the server. When a new response is received
   * it will automatically update the timeout, decode the message and
   * forwards the response to the onMessage function for further processing.
   *
   * @param {String} data Response from the server.
   * @api private
   */

  Transport.prototype.onData = function (data) {
    this.clearCloseTimeout();

    // If the connection in currently open (or in a reopening state) reset the close
    // timeout since we have just received data. This check is necessary so
    // that we don't reset the timeout on an explicitly disconnected connection.
    if (this.socket.connected || this.socket.connecting || this.socket.reconnecting) {
      this.setCloseTimeout();
    }

    if (data !== '') {
      // todo: we should only do decodePayload for xhr transports
      var msgs = io.parser.decodePayload(data);

      if (msgs && msgs.length) {
        for (var i = 0, l = msgs.length; i < l; i++) {
          this.onPacket(msgs[i]);
        }
      }
    }

    return this;
  };

  /**
   * Handles packets.
   *
   * @api private
   */

  Transport.prototype.onPacket = function (packet) {
    this.socket.setHeartbeatTimeout();

    if (packet.type == 'heartbeat') {
      return this.onHeartbeat();
    }

    if (packet.type == 'connect' && packet.endpoint == '') {
      this.onConnect();
    }

    if (packet.type == 'error' && packet.advice == 'reconnect') {
      this.isOpen = false;
    }

    this.socket.onPacket(packet);

    return this;
  };

  /**
   * Sets close timeout
   *
   * @api private
   */

  Transport.prototype.setCloseTimeout = function () {
    if (!this.closeTimeout) {
      var self = this;

      this.closeTimeout = setTimeout(function () {
        self.onDisconnect();
      }, this.socket.closeTimeout);
    }
  };

  /**
   * Called when transport disconnects.
   *
   * @api private
   */

  Transport.prototype.onDisconnect = function () {
    if (this.isOpen) this.close();
    this.clearTimeouts();
    this.socket.onDisconnect();
    return this;
  };

  /**
   * Called when transport connects
   *
   * @api private
   */

  Transport.prototype.onConnect = function () {
    this.socket.onConnect();
    return this;
  };

  /**
   * Clears close timeout
   *
   * @api private
   */

  Transport.prototype.clearCloseTimeout = function () {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
  };

  /**
   * Clear timeouts
   *
   * @api private
   */

  Transport.prototype.clearTimeouts = function () {
    this.clearCloseTimeout();

    if (this.reopenTimeout) {
      clearTimeout(this.reopenTimeout);
    }
  };

  /**
   * Sends a packet
   *
   * @param {Object} packet object.
   * @api private
   */

  Transport.prototype.packet = function (packet) {
    this.send(io.parser.encodePacket(packet));
  };

  /**
   * Send the received heartbeat message back to server. So the server
   * knows we are still connected.
   *
   * @param {String} heartbeat Heartbeat response from the server.
   * @api private
   */

  Transport.prototype.onHeartbeat = function (heartbeat) {
    this.packet({ type: 'heartbeat' });
  };

  /**
   * Called when the transport opens.
   *
   * @api private
   */

  Transport.prototype.onOpen = function () {
    this.isOpen = true;
    this.clearCloseTimeout();
    this.socket.onOpen();
  };

  /**
   * Notifies the base when the connection with the Socket.IO server
   * has been disconnected.
   *
   * @api private
   */

  Transport.prototype.onClose = function () {
    var self = this;

    /* FIXME: reopen delay causing a infinit loop
    this.reopenTimeout = setTimeout(function () {
      self.open();
    }, this.socket.options['reopen delay']);*/

    this.isOpen = false;
    this.socket.onClose();
    this.onDisconnect();
  };

  /**
   * Generates a connection url based on the Socket.IO URL Protocol.
   * See <https://github.com/learnboost/socket.io-node/> for more details.
   *
   * @returns {String} Connection url
   * @api private
   */

  Transport.prototype.prepareUrl = function () {
    var options = this.socket.options;

    return this.scheme() + '://'
      + options.host + ':' + options.port + '/'
      + options.resource + '/' + io.protocol
      + '/' + this.name + '/' + this.sessid;
  };

  /**
   * Checks if the transport is ready to start a connection.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  Transport.prototype.ready = function (socket, fn) {
    fn.call(this);
  };
})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports.Socket = Socket;

  /**
   * Create a new `Socket.IO client` which can establish a persistent
   * connection with a Socket.IO enabled server.
   *
   * @api public
   */

  function Socket (options) {
    this.options = {
        port: 80
      , secure: false
      , document: 'document' in global ? document : false
      , resource: 'socket.io'
      , transports: io.transports
      , 'connect timeout': 10000
      , 'try multiple transports': true
      , 'reconnect': true
      , 'reconnection delay': 500
      , 'reconnection limit': Infinity
      , 'reopen delay': 3000
      , 'max reconnection attempts': 10
      , 'sync disconnect on unload': false
      , 'auto connect': true
      , 'flash policy port': 10843
      , 'manualFlush': false
    };

    io.util.merge(this.options, options);

    this.connected = false;
    this.open = false;
    this.connecting = false;
    this.reconnecting = false;
    this.namespaces = {};
    this.buffer = [];
    this.doBuffer = false;

    if (this.options['sync disconnect on unload'] &&
        (!this.isXDomain() || io.util.ua.hasCORS)) {
      var self = this;
      io.util.on(global, 'beforeunload', function () {
        self.disconnectSync();
      }, false);
    }

    if (this.options['auto connect']) {
      this.connect();
    }
};

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(Socket, io.EventEmitter);

  /**
   * Returns a namespace listener/emitter for this socket
   *
   * @api public
   */

  Socket.prototype.of = function (name) {
    if (!this.namespaces[name]) {
      this.namespaces[name] = new io.SocketNamespace(this, name);

      if (name !== '') {
        this.namespaces[name].packet({ type: 'connect' });
      }
    }

    return this.namespaces[name];
  };

  /**
   * Emits the given event to the Socket and all namespaces
   *
   * @api private
   */

  Socket.prototype.publish = function () {
    this.emit.apply(this, arguments);

    var nsp;

    for (var i in this.namespaces) {
      if (this.namespaces.hasOwnProperty(i)) {
        nsp = this.of(i);
        nsp.$emit.apply(nsp, arguments);
      }
    }
  };

  /**
   * Performs the handshake
   *
   * @api private
   */

  function empty () { };

  Socket.prototype.handshake = function (fn) {
    var self = this
      , options = this.options;

    function complete (data) {
      if (data instanceof Error) {
        self.connecting = false;
        self.onError(data.message);
      } else {
        fn.apply(null, data.split(':'));
      }
    };

    var url = [
          'http' + (options.secure ? 's' : '') + ':/'
        , options.host + ':' + options.port
        , options.resource
        , io.protocol
        , io.util.query(this.options.query, 't=' + +new Date)
      ].join('/');

    if (this.isXDomain() && !io.util.ua.hasCORS) {
      var insertAt = document.getElementsByTagName('script')[0]
        , script = document.createElement('script');

      script.src = url + '&jsonp=' + io.j.length;
      insertAt.parentNode.insertBefore(script, insertAt);

      io.j.push(function (data) {
        complete(data);
        script.parentNode.removeChild(script);
      });
    } else {
      var xhr = io.util.request();

      xhr.open('GET', url, true);
      if (this.isXDomain()) {
        xhr.withCredentials = true;
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
          xhr.onreadystatechange = empty;

          if (xhr.status == 200) {
            complete(xhr.responseText);
          } else if (xhr.status == 403) {
            self.onError(xhr.responseText);
          } else {
            self.connecting = false;            
            !self.reconnecting && self.onError(xhr.responseText);
          }
        }
      };
      xhr.send(null);
    }
  };

  /**
   * Find an available transport based on the options supplied in the constructor.
   *
   * @api private
   */

  Socket.prototype.getTransport = function (override) {
    var transports = override || this.transports, match;

    for (var i = 0, transport; transport = transports[i]; i++) {
      if (io.Transport[transport]
        && io.Transport[transport].check(this)
        && (!this.isXDomain() || io.Transport[transport].xdomainCheck(this))) {
        return new io.Transport[transport](this, this.sessionid);
      }
    }

    return null;
  };

  /**
   * Connects to the server.
   *
   * @param {Function} [fn] Callback.
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.connect = function (fn) {
    if (this.connecting) {
      return this;
    }

    var self = this;
    self.connecting = true;
    
    this.handshake(function (sid, heartbeat, close, transports) {
      self.sessionid = sid;
      self.closeTimeout = close * 1000;
      self.heartbeatTimeout = heartbeat * 1000;
      if(!self.transports)
          self.transports = self.origTransports = (transports ? io.util.intersect(
              transports.split(',')
            , self.options.transports
          ) : self.options.transports);

      self.setHeartbeatTimeout();

      function connect (transports){
        if (self.transport) self.transport.clearTimeouts();

        self.transport = self.getTransport(transports);
        if (!self.transport) return self.publish('connect_failed');

        // once the transport is ready
        self.transport.ready(self, function () {
          self.connecting = true;
          self.publish('connecting', self.transport.name);
          self.transport.open();

          if (self.options['connect timeout']) {
            self.connectTimeoutTimer = setTimeout(function () {
              if (!self.connected) {
                self.connecting = false;

                if (self.options['try multiple transports']) {
                  var remaining = self.transports;

                  while (remaining.length > 0 && remaining.splice(0,1)[0] !=
                         self.transport.name) {}

                    if (remaining.length){
                      connect(remaining);
                    } else {
                      self.publish('connect_failed');
                    }
                }
              }
            }, self.options['connect timeout']);
          }
        });
      }

      connect(self.transports);

      self.once('connect', function (){
        clearTimeout(self.connectTimeoutTimer);

        fn && typeof fn == 'function' && fn();
      });
    });

    return this;
  };

  /**
   * Clears and sets a new heartbeat timeout using the value given by the
   * server during the handshake.
   *
   * @api private
   */

  Socket.prototype.setHeartbeatTimeout = function () {
    clearTimeout(this.heartbeatTimeoutTimer);
    if(this.transport && !this.transport.heartbeats()) return;

    var self = this;
    this.heartbeatTimeoutTimer = setTimeout(function () {
      self.transport.onClose();
    }, this.heartbeatTimeout);
  };

  /**
   * Sends a message.
   *
   * @param {Object} data packet.
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.packet = function (data) {
    if (this.connected && !this.doBuffer) {
      this.transport.packet(data);
    } else {
      this.buffer.push(data);
    }

    return this;
  };

  /**
   * Sets buffer state
   *
   * @api private
   */

  Socket.prototype.setBuffer = function (v) {
    this.doBuffer = v;

    if (!v && this.connected && this.buffer.length) {
      if (!this.options['manualFlush']) {
        this.flushBuffer();
      }
    }
  };

  /**
   * Flushes the buffer data over the wire.
   * To be invoked manually when 'manualFlush' is set to true.
   *
   * @api public
   */

  Socket.prototype.flushBuffer = function() {
    this.transport.payload(this.buffer);
    this.buffer = [];
  };
  

  /**
   * Disconnect the established connect.
   *
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.disconnect = function () {
    if (this.connected || this.connecting) {
      if (this.open) {
        this.of('').packet({ type: 'disconnect' });
      }

      // handle disconnection immediately
      this.onDisconnect('booted');
    }

    return this;
  };

  /**
   * Disconnects the socket with a sync XHR.
   *
   * @api private
   */

  Socket.prototype.disconnectSync = function () {
    // ensure disconnection
    var xhr = io.util.request();
    var uri = [
        'http' + (this.options.secure ? 's' : '') + ':/'
      , this.options.host + ':' + this.options.port
      , this.options.resource
      , io.protocol
      , ''
      , this.sessionid
    ].join('/') + '/?disconnect=1';

    xhr.open('GET', uri, false);
    xhr.send(null);

    // handle disconnection immediately
    this.onDisconnect('booted');
  };

  /**
   * Check if we need to use cross domain enabled transports. Cross domain would
   * be a different port or different domain name.
   *
   * @returns {Boolean}
   * @api private
   */

  Socket.prototype.isXDomain = function () {

    var port = global.location.port ||
      ('https:' == global.location.protocol ? 443 : 80);

    return this.options.host !== global.location.hostname 
      || this.options.port != port;
  };

  /**
   * Called upon handshake.
   *
   * @api private
   */

  Socket.prototype.onConnect = function () {
    if (!this.connected) {
      this.connected = true;
      this.connecting = false;
      if (!this.doBuffer) {
        // make sure to flush the buffer
        this.setBuffer(false);
      }
      this.emit('connect');
    }
  };

  /**
   * Called when the transport opens
   *
   * @api private
   */

  Socket.prototype.onOpen = function () {
    this.open = true;
  };

  /**
   * Called when the transport closes.
   *
   * @api private
   */

  Socket.prototype.onClose = function () {
    this.open = false;
    clearTimeout(this.heartbeatTimeoutTimer);
  };

  /**
   * Called when the transport first opens a connection
   *
   * @param text
   */

  Socket.prototype.onPacket = function (packet) {
    this.of(packet.endpoint).onPacket(packet);
  };

  /**
   * Handles an error.
   *
   * @api private
   */

  Socket.prototype.onError = function (err) {
    if (err && err.advice) {
      if (err.advice === 'reconnect' && (this.connected || this.connecting)) {
        this.disconnect();
        if (this.options.reconnect) {
          this.reconnect();
        }
      }
    }

    this.publish('error', err && err.reason ? err.reason : err);
  };

  /**
   * Called when the transport disconnects.
   *
   * @api private
   */

  Socket.prototype.onDisconnect = function (reason) {
    var wasConnected = this.connected
      , wasConnecting = this.connecting;

    this.connected = false;
    this.connecting = false;
    this.open = false;

    if (wasConnected || wasConnecting) {
      this.transport.close();
      this.transport.clearTimeouts();
      if (wasConnected) {
        this.publish('disconnect', reason);

        if ('booted' != reason && this.options.reconnect && !this.reconnecting) {
          this.reconnect();
        }
      }
    }
  };

  /**
   * Called upon reconnection.
   *
   * @api private
   */

  Socket.prototype.reconnect = function () {
    this.reconnecting = true;
    this.reconnectionAttempts = 0;
    this.reconnectionDelay = this.options['reconnection delay'];

    var self = this
      , maxAttempts = this.options['max reconnection attempts']
      , tryMultiple = this.options['try multiple transports']
      , limit = this.options['reconnection limit'];

    function reset () {
      if (self.connected) {
        for (var i in self.namespaces) {
          if (self.namespaces.hasOwnProperty(i) && '' !== i) {
              self.namespaces[i].packet({ type: 'connect' });
          }
        }
        self.publish('reconnect', self.transport.name, self.reconnectionAttempts);
      }

      clearTimeout(self.reconnectionTimer);

      self.removeListener('connect_failed', maybeReconnect);
      self.removeListener('connect', maybeReconnect);

      self.reconnecting = false;

      delete self.reconnectionAttempts;
      delete self.reconnectionDelay;
      delete self.reconnectionTimer;
      delete self.redoTransports;

      self.options['try multiple transports'] = tryMultiple;
    };

    function maybeReconnect () {
      if (!self.reconnecting) {
        return;
      }

      if (self.connected) {
        return reset();
      };

      if (self.connecting && self.reconnecting) {
        return self.reconnectionTimer = setTimeout(maybeReconnect, 1000);
      }

      if (self.reconnectionAttempts++ >= maxAttempts) {
        if (!self.redoTransports) {
          self.on('connect_failed', maybeReconnect);
          self.options['try multiple transports'] = true;
          self.transports = self.origTransports;
          self.transport = self.getTransport();
          self.redoTransports = true;
          self.connect();
        } else {
          self.publish('reconnect_failed');
          reset();
        }
      } else {
        if (self.reconnectionDelay < limit) {
          self.reconnectionDelay *= 2; // exponential back off
        }

        self.connect();
        self.publish('reconnecting', self.reconnectionDelay, self.reconnectionAttempts);
        self.reconnectionTimer = setTimeout(maybeReconnect, self.reconnectionDelay);
      }
    };

    this.options['try multiple transports'] = false;
    this.reconnectionTimer = setTimeout(maybeReconnect, this.reconnectionDelay);

    this.on('connect', maybeReconnect);
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.SocketNamespace = SocketNamespace;

  /**
   * Socket namespace constructor.
   *
   * @constructor
   * @api public
   */

  function SocketNamespace (socket, name) {
    this.socket = socket;
    this.name = name || '';
    this.flags = {};
    this.json = new Flag(this, 'json');
    this.ackPackets = 0;
    this.acks = {};
  };

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(SocketNamespace, io.EventEmitter);

  /**
   * Copies emit since we override it
   *
   * @api private
   */

  SocketNamespace.prototype.$emit = io.EventEmitter.prototype.emit;

  /**
   * Creates a new namespace, by proxying the request to the socket. This
   * allows us to use the synax as we do on the server.
   *
   * @api public
   */

  SocketNamespace.prototype.of = function () {
    return this.socket.of.apply(this.socket, arguments);
  };

  /**
   * Sends a packet.
   *
   * @api private
   */

  SocketNamespace.prototype.packet = function (packet) {
    packet.endpoint = this.name;
    this.socket.packet(packet);
    this.flags = {};
    return this;
  };

  /**
   * Sends a message
   *
   * @api public
   */

  SocketNamespace.prototype.send = function (data, fn) {
    var packet = {
        type: this.flags.json ? 'json' : 'message'
      , data: data
    };

    if ('function' == typeof fn) {
      packet.id = ++this.ackPackets;
      packet.ack = true;
      this.acks[packet.id] = fn;
    }

    return this.packet(packet);
  };

  /**
   * Emits an event
   *
   * @api public
   */
  
  SocketNamespace.prototype.emit = function (name) {
    var args = Array.prototype.slice.call(arguments, 1)
      , lastArg = args[args.length - 1]
      , packet = {
            type: 'event'
          , name: name
        };

    if ('function' == typeof lastArg) {
      packet.id = ++this.ackPackets;
      packet.ack = 'data';
      this.acks[packet.id] = lastArg;
      args = args.slice(0, args.length - 1);
    }

    packet.args = args;

    return this.packet(packet);
  };

  /**
   * Disconnects the namespace
   *
   * @api private
   */

  SocketNamespace.prototype.disconnect = function () {
    if (this.name === '') {
      this.socket.disconnect();
    } else {
      this.packet({ type: 'disconnect' });
      this.$emit('disconnect');
    }

    return this;
  };

  /**
   * Handles a packet
   *
   * @api private
   */

  SocketNamespace.prototype.onPacket = function (packet) {
    var self = this;

    function ack () {
      self.packet({
          type: 'ack'
        , args: io.util.toArray(arguments)
        , ackId: packet.id
      });
    };

    switch (packet.type) {
      case 'connect':
        this.$emit('connect');
        break;

      case 'disconnect':
        if (this.name === '') {
          this.socket.onDisconnect(packet.reason || 'booted');
        } else {
          this.$emit('disconnect', packet.reason);
        }
        break;

      case 'message':
      case 'json':
        var params = ['message', packet.data];

        if (packet.ack == 'data') {
          params.push(ack);
        } else if (packet.ack) {
          this.packet({ type: 'ack', ackId: packet.id });
        }

        this.$emit.apply(this, params);
        break;

      case 'event':
        var params = [packet.name].concat(packet.args);

        if (packet.ack == 'data')
          params.push(ack);

        this.$emit.apply(this, params);
        break;

      case 'ack':
        if (this.acks[packet.ackId]) {
          this.acks[packet.ackId].apply(this, packet.args);
          delete this.acks[packet.ackId];
        }
        break;

      case 'error':
        if (packet.advice){
          this.socket.onError(packet);
        } else {
          if (packet.reason == 'unauthorized') {
            this.$emit('connect_failed', packet.reason);
          } else {
            this.$emit('error', packet.reason);
          }
        }
        break;
    }
  };

  /**
   * Flag interface.
   *
   * @api private
   */

  function Flag (nsp, name) {
    this.namespace = nsp;
    this.name = name;
  };

  /**
   * Send a message
   *
   * @api public
   */

  Flag.prototype.send = function () {
    this.namespace.flags[this.name] = true;
    this.namespace.send.apply(this.namespace, arguments);
  };

  /**
   * Emit an event
   *
   * @api public
   */

  Flag.prototype.emit = function () {
    this.namespace.flags[this.name] = true;
    this.namespace.emit.apply(this.namespace, arguments);
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports.websocket = WS;

  /**
   * The WebSocket transport uses the HTML5 WebSocket API to establish an
   * persistent connection with the Socket.IO server. This transport will also
   * be inherited by the FlashSocket fallback as it provides a API compatible
   * polyfill for the WebSockets.
   *
   * @constructor
   * @extends {io.Transport}
   * @api public
   */

  function WS (socket) {
    io.Transport.apply(this, arguments);
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(WS, io.Transport);

  /**
   * Transport name
   *
   * @api public
   */

  WS.prototype.name = 'websocket';

  /**
   * Initializes a new `WebSocket` connection with the Socket.IO server. We attach
   * all the appropriate listeners to handle the responses from the server.
   *
   * @returns {Transport}
   * @api public
   */

  WS.prototype.open = function () {
    var query = io.util.query(this.socket.options.query)
      , self = this
      , Socket


    if (!Socket) {
      Socket = global.MozWebSocket || global.WebSocket;
    }

    this.websocket = new Socket(this.prepareUrl() + query);

    this.websocket.onopen = function () {
      self.onOpen();
      self.socket.setBuffer(false);
    };
    this.websocket.onmessage = function (ev) {
      self.onData(ev.data);
    };
    this.websocket.onclose = function () {
      self.onClose();
      self.socket.setBuffer(true);
    };
    this.websocket.onerror = function (e) {
      self.onError(e);
    };

    return this;
  };

  /**
   * Send a message to the Socket.IO server. The message will automatically be
   * encoded in the correct message format.
   *
   * @returns {Transport}
   * @api public
   */

  // Do to a bug in the current IDevices browser, we need to wrap the send in a 
  // setTimeout, when they resume from sleeping the browser will crash if 
  // we don't allow the browser time to detect the socket has been closed
  if (io.util.ua.iDevice) {
    WS.prototype.send = function (data) {
      var self = this;
      setTimeout(function() {
         self.websocket.send(data);
      },0);
      return this;
    };
  } else {
    WS.prototype.send = function (data) {
      this.websocket.send(data);
      return this;
    };
  }

  /**
   * Payload
   *
   * @api private
   */

  WS.prototype.payload = function (arr) {
    for (var i = 0, l = arr.length; i < l; i++) {
      this.packet(arr[i]);
    }
    return this;
  };

  /**
   * Disconnect the established `WebSocket` connection.
   *
   * @returns {Transport}
   * @api public
   */

  WS.prototype.close = function () {
    this.websocket.close();
    return this;
  };

  /**
   * Handle the errors that `WebSocket` might be giving when we
   * are attempting to connect or send messages.
   *
   * @param {Error} e The error.
   * @api private
   */

  WS.prototype.onError = function (e) {
    this.socket.onError(e);
  };

  /**
   * Returns the appropriate scheme for the URI generation.
   *
   * @api private
   */
  WS.prototype.scheme = function () {
    return this.socket.options.secure ? 'wss' : 'ws';
  };

  /**
   * Checks if the browser has support for native `WebSockets` and that
   * it's not the polyfill created for the FlashSocket transport.
   *
   * @return {Boolean}
   * @api public
   */

  WS.check = function () {
    return ('WebSocket' in global && !('__addTask' in WebSocket))
          || 'MozWebSocket' in global;
  };

  /**
   * Check if the `WebSocket` transport support cross domain communications.
   *
   * @returns {Boolean}
   * @api public
   */

  WS.xdomainCheck = function () {
    return true;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('websocket');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.flashsocket = Flashsocket;

  /**
   * The FlashSocket transport. This is a API wrapper for the HTML5 WebSocket
   * specification. It uses a .swf file to communicate with the server. If you want
   * to serve the .swf file from a other server than where the Socket.IO script is
   * coming from you need to use the insecure version of the .swf. More information
   * about this can be found on the github page.
   *
   * @constructor
   * @extends {io.Transport.websocket}
   * @api public
   */

  function Flashsocket () {
    io.Transport.websocket.apply(this, arguments);
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(Flashsocket, io.Transport.websocket);

  /**
   * Transport name
   *
   * @api public
   */

  Flashsocket.prototype.name = 'flashsocket';

  /**
   * Disconnect the established `FlashSocket` connection. This is done by adding a 
   * new task to the FlashSocket. The rest will be handled off by the `WebSocket` 
   * transport.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.open = function () {
    var self = this
      , args = arguments;

    WebSocket.__addTask(function () {
      io.Transport.websocket.prototype.open.apply(self, args);
    });
    return this;
  };
  
  /**
   * Sends a message to the Socket.IO server. This is done by adding a new
   * task to the FlashSocket. The rest will be handled off by the `WebSocket` 
   * transport.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.send = function () {
    var self = this, args = arguments;
    WebSocket.__addTask(function () {
      io.Transport.websocket.prototype.send.apply(self, args);
    });
    return this;
  };

  /**
   * Disconnects the established `FlashSocket` connection.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.close = function () {
    WebSocket.__tasks.length = 0;
    io.Transport.websocket.prototype.close.call(this);
    return this;
  };

  /**
   * The WebSocket fall back needs to append the flash container to the body
   * element, so we need to make sure we have access to it. Or defer the call
   * until we are sure there is a body element.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  Flashsocket.prototype.ready = function (socket, fn) {
    function init () {
      var options = socket.options
        , port = options['flash policy port']
        , path = [
              'http' + (options.secure ? 's' : '') + ':/'
            , options.host + ':' + options.port
            , options.resource
            , 'static/flashsocket'
            , 'WebSocketMain' + (socket.isXDomain() ? 'Insecure' : '') + '.swf'
          ];

      // Only start downloading the swf file when the checked that this browser
      // actually supports it
      if (!Flashsocket.loaded) {
        if (typeof WEB_SOCKET_SWF_LOCATION === 'undefined') {
          // Set the correct file based on the XDomain settings
          WEB_SOCKET_SWF_LOCATION = path.join('/');
        }

        if (port !== 843) {
          WebSocket.loadFlashPolicyFile('xmlsocket://' + options.host + ':' + port);
        }

        WebSocket.__initialize();
        Flashsocket.loaded = true;
      }

      fn.call(self);
    }

    var self = this;
    if (document.body) return init();

    io.util.load(init);
  };

  /**
   * Check if the FlashSocket transport is supported as it requires that the Adobe
   * Flash Player plug-in version `10.0.0` or greater is installed. And also check if
   * the polyfill is correctly loaded.
   *
   * @returns {Boolean}
   * @api public
   */

  Flashsocket.check = function () {
    if (
        typeof WebSocket == 'undefined'
      || !('__initialize' in WebSocket) || !swfobject
    ) return false;

    return swfobject.getFlashPlayerVersion().major >= 10;
  };

  /**
   * Check if the FlashSocket transport can be used as cross domain / cross origin 
   * transport. Because we can't see which type (secure or insecure) of .swf is used
   * we will just return true.
   *
   * @returns {Boolean}
   * @api public
   */

  Flashsocket.xdomainCheck = function () {
    return true;
  };

  /**
   * Disable AUTO_INITIALIZATION
   */

  if (typeof window != 'undefined') {
    WEB_SOCKET_DISABLE_AUTO_INITIALIZATION = true;
  }

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('flashsocket');
})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/*	SWFObject v2.2 <http://code.google.com/p/swfobject/> 
	is released under the MIT License <http://www.opensource.org/licenses/mit-license.php> 
*/
if ('undefined' != typeof window) {
var swfobject=function(){var D="undefined",r="object",S="Shockwave Flash",W="ShockwaveFlash.ShockwaveFlash",q="application/x-shockwave-flash",R="SWFObjectExprInst",x="onreadystatechange",O=window,j=document,t=navigator,T=false,U=[h],o=[],N=[],I=[],l,Q,E,B,J=false,a=false,n,G,m=true,M=function(){var aa=typeof j.getElementById!=D&&typeof j.getElementsByTagName!=D&&typeof j.createElement!=D,ah=t.userAgent.toLowerCase(),Y=t.platform.toLowerCase(),ae=Y?/win/.test(Y):/win/.test(ah),ac=Y?/mac/.test(Y):/mac/.test(ah),af=/webkit/.test(ah)?parseFloat(ah.replace(/^.*webkit\/(\d+(\.\d+)?).*$/,"$1")):false,X=!+"\v1",ag=[0,0,0],ab=null;if(typeof t.plugins!=D&&typeof t.plugins[S]==r){ab=t.plugins[S].description;if(ab&&!(typeof t.mimeTypes!=D&&t.mimeTypes[q]&&!t.mimeTypes[q].enabledPlugin)){T=true;X=false;ab=ab.replace(/^.*\s+(\S+\s+\S+$)/,"$1");ag[0]=parseInt(ab.replace(/^(.*)\..*$/,"$1"),10);ag[1]=parseInt(ab.replace(/^.*\.(.*)\s.*$/,"$1"),10);ag[2]=/[a-zA-Z]/.test(ab)?parseInt(ab.replace(/^.*[a-zA-Z]+(.*)$/,"$1"),10):0}}else{if(typeof O[(['Active'].concat('Object').join('X'))]!=D){try{var ad=new window[(['Active'].concat('Object').join('X'))](W);if(ad){ab=ad.GetVariable("$version");if(ab){X=true;ab=ab.split(" ")[1].split(",");ag=[parseInt(ab[0],10),parseInt(ab[1],10),parseInt(ab[2],10)]}}}catch(Z){}}}return{w3:aa,pv:ag,wk:af,ie:X,win:ae,mac:ac}}(),k=function(){if(!M.w3){return}if((typeof j.readyState!=D&&j.readyState=="complete")||(typeof j.readyState==D&&(j.getElementsByTagName("body")[0]||j.body))){f()}if(!J){if(typeof j.addEventListener!=D){j.addEventListener("DOMContentLoaded",f,false)}if(M.ie&&M.win){j.attachEvent(x,function(){if(j.readyState=="complete"){j.detachEvent(x,arguments.callee);f()}});if(O==top){(function(){if(J){return}try{j.documentElement.doScroll("left")}catch(X){setTimeout(arguments.callee,0);return}f()})()}}if(M.wk){(function(){if(J){return}if(!/loaded|complete/.test(j.readyState)){setTimeout(arguments.callee,0);return}f()})()}s(f)}}();function f(){if(J){return}try{var Z=j.getElementsByTagName("body")[0].appendChild(C("span"));Z.parentNode.removeChild(Z)}catch(aa){return}J=true;var X=U.length;for(var Y=0;Y<X;Y++){U[Y]()}}function K(X){if(J){X()}else{U[U.length]=X}}function s(Y){if(typeof O.addEventListener!=D){O.addEventListener("load",Y,false)}else{if(typeof j.addEventListener!=D){j.addEventListener("load",Y,false)}else{if(typeof O.attachEvent!=D){i(O,"onload",Y)}else{if(typeof O.onload=="function"){var X=O.onload;O.onload=function(){X();Y()}}else{O.onload=Y}}}}}function h(){if(T){V()}else{H()}}function V(){var X=j.getElementsByTagName("body")[0];var aa=C(r);aa.setAttribute("type",q);var Z=X.appendChild(aa);if(Z){var Y=0;(function(){if(typeof Z.GetVariable!=D){var ab=Z.GetVariable("$version");if(ab){ab=ab.split(" ")[1].split(",");M.pv=[parseInt(ab[0],10),parseInt(ab[1],10),parseInt(ab[2],10)]}}else{if(Y<10){Y++;setTimeout(arguments.callee,10);return}}X.removeChild(aa);Z=null;H()})()}else{H()}}function H(){var ag=o.length;if(ag>0){for(var af=0;af<ag;af++){var Y=o[af].id;var ab=o[af].callbackFn;var aa={success:false,id:Y};if(M.pv[0]>0){var ae=c(Y);if(ae){if(F(o[af].swfVersion)&&!(M.wk&&M.wk<312)){w(Y,true);if(ab){aa.success=true;aa.ref=z(Y);ab(aa)}}else{if(o[af].expressInstall&&A()){var ai={};ai.data=o[af].expressInstall;ai.width=ae.getAttribute("width")||"0";ai.height=ae.getAttribute("height")||"0";if(ae.getAttribute("class")){ai.styleclass=ae.getAttribute("class")}if(ae.getAttribute("align")){ai.align=ae.getAttribute("align")}var ah={};var X=ae.getElementsByTagName("param");var ac=X.length;for(var ad=0;ad<ac;ad++){if(X[ad].getAttribute("name").toLowerCase()!="movie"){ah[X[ad].getAttribute("name")]=X[ad].getAttribute("value")}}P(ai,ah,Y,ab)}else{p(ae);if(ab){ab(aa)}}}}}else{w(Y,true);if(ab){var Z=z(Y);if(Z&&typeof Z.SetVariable!=D){aa.success=true;aa.ref=Z}ab(aa)}}}}}function z(aa){var X=null;var Y=c(aa);if(Y&&Y.nodeName=="OBJECT"){if(typeof Y.SetVariable!=D){X=Y}else{var Z=Y.getElementsByTagName(r)[0];if(Z){X=Z}}}return X}function A(){return !a&&F("6.0.65")&&(M.win||M.mac)&&!(M.wk&&M.wk<312)}function P(aa,ab,X,Z){a=true;E=Z||null;B={success:false,id:X};var ae=c(X);if(ae){if(ae.nodeName=="OBJECT"){l=g(ae);Q=null}else{l=ae;Q=X}aa.id=R;if(typeof aa.width==D||(!/%$/.test(aa.width)&&parseInt(aa.width,10)<310)){aa.width="310"}if(typeof aa.height==D||(!/%$/.test(aa.height)&&parseInt(aa.height,10)<137)){aa.height="137"}j.title=j.title.slice(0,47)+" - Flash Player Installation";var ad=M.ie&&M.win?(['Active'].concat('').join('X')):"PlugIn",ac="MMredirectURL="+O.location.toString().replace(/&/g,"%26")+"&MMplayerType="+ad+"&MMdoctitle="+j.title;if(typeof ab.flashvars!=D){ab.flashvars+="&"+ac}else{ab.flashvars=ac}if(M.ie&&M.win&&ae.readyState!=4){var Y=C("div");X+="SWFObjectNew";Y.setAttribute("id",X);ae.parentNode.insertBefore(Y,ae);ae.style.display="none";(function(){if(ae.readyState==4){ae.parentNode.removeChild(ae)}else{setTimeout(arguments.callee,10)}})()}u(aa,ab,X)}}function p(Y){if(M.ie&&M.win&&Y.readyState!=4){var X=C("div");Y.parentNode.insertBefore(X,Y);X.parentNode.replaceChild(g(Y),X);Y.style.display="none";(function(){if(Y.readyState==4){Y.parentNode.removeChild(Y)}else{setTimeout(arguments.callee,10)}})()}else{Y.parentNode.replaceChild(g(Y),Y)}}function g(ab){var aa=C("div");if(M.win&&M.ie){aa.innerHTML=ab.innerHTML}else{var Y=ab.getElementsByTagName(r)[0];if(Y){var ad=Y.childNodes;if(ad){var X=ad.length;for(var Z=0;Z<X;Z++){if(!(ad[Z].nodeType==1&&ad[Z].nodeName=="PARAM")&&!(ad[Z].nodeType==8)){aa.appendChild(ad[Z].cloneNode(true))}}}}}return aa}function u(ai,ag,Y){var X,aa=c(Y);if(M.wk&&M.wk<312){return X}if(aa){if(typeof ai.id==D){ai.id=Y}if(M.ie&&M.win){var ah="";for(var ae in ai){if(ai[ae]!=Object.prototype[ae]){if(ae.toLowerCase()=="data"){ag.movie=ai[ae]}else{if(ae.toLowerCase()=="styleclass"){ah+=' class="'+ai[ae]+'"'}else{if(ae.toLowerCase()!="classid"){ah+=" "+ae+'="'+ai[ae]+'"'}}}}}var af="";for(var ad in ag){if(ag[ad]!=Object.prototype[ad]){af+='<param name="'+ad+'" value="'+ag[ad]+'" />'}}aa.outerHTML='<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"'+ah+">"+af+"</object>";N[N.length]=ai.id;X=c(ai.id)}else{var Z=C(r);Z.setAttribute("type",q);for(var ac in ai){if(ai[ac]!=Object.prototype[ac]){if(ac.toLowerCase()=="styleclass"){Z.setAttribute("class",ai[ac])}else{if(ac.toLowerCase()!="classid"){Z.setAttribute(ac,ai[ac])}}}}for(var ab in ag){if(ag[ab]!=Object.prototype[ab]&&ab.toLowerCase()!="movie"){e(Z,ab,ag[ab])}}aa.parentNode.replaceChild(Z,aa);X=Z}}return X}function e(Z,X,Y){var aa=C("param");aa.setAttribute("name",X);aa.setAttribute("value",Y);Z.appendChild(aa)}function y(Y){var X=c(Y);if(X&&X.nodeName=="OBJECT"){if(M.ie&&M.win){X.style.display="none";(function(){if(X.readyState==4){b(Y)}else{setTimeout(arguments.callee,10)}})()}else{X.parentNode.removeChild(X)}}}function b(Z){var Y=c(Z);if(Y){for(var X in Y){if(typeof Y[X]=="function"){Y[X]=null}}Y.parentNode.removeChild(Y)}}function c(Z){var X=null;try{X=j.getElementById(Z)}catch(Y){}return X}function C(X){return j.createElement(X)}function i(Z,X,Y){Z.attachEvent(X,Y);I[I.length]=[Z,X,Y]}function F(Z){var Y=M.pv,X=Z.split(".");X[0]=parseInt(X[0],10);X[1]=parseInt(X[1],10)||0;X[2]=parseInt(X[2],10)||0;return(Y[0]>X[0]||(Y[0]==X[0]&&Y[1]>X[1])||(Y[0]==X[0]&&Y[1]==X[1]&&Y[2]>=X[2]))?true:false}function v(ac,Y,ad,ab){if(M.ie&&M.mac){return}var aa=j.getElementsByTagName("head")[0];if(!aa){return}var X=(ad&&typeof ad=="string")?ad:"screen";if(ab){n=null;G=null}if(!n||G!=X){var Z=C("style");Z.setAttribute("type","text/css");Z.setAttribute("media",X);n=aa.appendChild(Z);if(M.ie&&M.win&&typeof j.styleSheets!=D&&j.styleSheets.length>0){n=j.styleSheets[j.styleSheets.length-1]}G=X}if(M.ie&&M.win){if(n&&typeof n.addRule==r){n.addRule(ac,Y)}}else{if(n&&typeof j.createTextNode!=D){n.appendChild(j.createTextNode(ac+" {"+Y+"}"))}}}function w(Z,X){if(!m){return}var Y=X?"visible":"hidden";if(J&&c(Z)){c(Z).style.visibility=Y}else{v("#"+Z,"visibility:"+Y)}}function L(Y){var Z=/[\\\"<>\.;]/;var X=Z.exec(Y)!=null;return X&&typeof encodeURIComponent!=D?encodeURIComponent(Y):Y}var d=function(){if(M.ie&&M.win){window.attachEvent("onunload",function(){var ac=I.length;for(var ab=0;ab<ac;ab++){I[ab][0].detachEvent(I[ab][1],I[ab][2])}var Z=N.length;for(var aa=0;aa<Z;aa++){y(N[aa])}for(var Y in M){M[Y]=null}M=null;for(var X in swfobject){swfobject[X]=null}swfobject=null})}}();return{registerObject:function(ab,X,aa,Z){if(M.w3&&ab&&X){var Y={};Y.id=ab;Y.swfVersion=X;Y.expressInstall=aa;Y.callbackFn=Z;o[o.length]=Y;w(ab,false)}else{if(Z){Z({success:false,id:ab})}}},getObjectById:function(X){if(M.w3){return z(X)}},embedSWF:function(ab,ah,ae,ag,Y,aa,Z,ad,af,ac){var X={success:false,id:ah};if(M.w3&&!(M.wk&&M.wk<312)&&ab&&ah&&ae&&ag&&Y){w(ah,false);K(function(){ae+="";ag+="";var aj={};if(af&&typeof af===r){for(var al in af){aj[al]=af[al]}}aj.data=ab;aj.width=ae;aj.height=ag;var am={};if(ad&&typeof ad===r){for(var ak in ad){am[ak]=ad[ak]}}if(Z&&typeof Z===r){for(var ai in Z){if(typeof am.flashvars!=D){am.flashvars+="&"+ai+"="+Z[ai]}else{am.flashvars=ai+"="+Z[ai]}}}if(F(Y)){var an=u(aj,am,ah);if(aj.id==ah){w(ah,true)}X.success=true;X.ref=an}else{if(aa&&A()){aj.data=aa;P(aj,am,ah,ac);return}else{w(ah,true)}}if(ac){ac(X)}})}else{if(ac){ac(X)}}},switchOffAutoHideShow:function(){m=false},ua:M,getFlashPlayerVersion:function(){return{major:M.pv[0],minor:M.pv[1],release:M.pv[2]}},hasFlashPlayerVersion:F,createSWF:function(Z,Y,X){if(M.w3){return u(Z,Y,X)}else{return undefined}},showExpressInstall:function(Z,aa,X,Y){if(M.w3&&A()){P(Z,aa,X,Y)}},removeSWF:function(X){if(M.w3){y(X)}},createCSS:function(aa,Z,Y,X){if(M.w3){v(aa,Z,Y,X)}},addDomLoadEvent:K,addLoadEvent:s,getQueryParamValue:function(aa){var Z=j.location.search||j.location.hash;if(Z){if(/\?/.test(Z)){Z=Z.split("?")[1]}if(aa==null){return L(Z)}var Y=Z.split("&");for(var X=0;X<Y.length;X++){if(Y[X].substring(0,Y[X].indexOf("="))==aa){return L(Y[X].substring((Y[X].indexOf("=")+1)))}}}return""},expressInstallCallback:function(){if(a){var X=c(R);if(X&&l){X.parentNode.replaceChild(l,X);if(Q){w(Q,true);if(M.ie&&M.win){l.style.display="block"}}if(E){E(B)}}a=false}}}}();
}
// Copyright: Hiroshi Ichikawa <http://gimite.net/en/>
// License: New BSD License
// Reference: http://dev.w3.org/html5/websockets/
// Reference: http://tools.ietf.org/html/draft-hixie-thewebsocketprotocol

(function() {
  
  if ('undefined' == typeof window || window.WebSocket) return;

  var console = window.console;
  if (!console || !console.log || !console.error) {
    console = {log: function(){ }, error: function(){ }};
  }
  
  if (!swfobject.hasFlashPlayerVersion("10.0.0")) {
    console.error("Flash Player >= 10.0.0 is required.");
    return;
  }
  if (location.protocol == "file:") {
    console.error(
      "WARNING: web-socket-js doesn't work in file:///... URL " +
      "unless you set Flash Security Settings properly. " +
      "Open the page via Web server i.e. http://...");
  }

  /**
   * This class represents a faux web socket.
   * @param {string} url
   * @param {array or string} protocols
   * @param {string} proxyHost
   * @param {int} proxyPort
   * @param {string} headers
   */
  WebSocket = function(url, protocols, proxyHost, proxyPort, headers) {
    var self = this;
    self.__id = WebSocket.__nextId++;
    WebSocket.__instances[self.__id] = self;
    self.readyState = WebSocket.CONNECTING;
    self.bufferedAmount = 0;
    self.__events = {};
    if (!protocols) {
      protocols = [];
    } else if (typeof protocols == "string") {
      protocols = [protocols];
    }
    // Uses setTimeout() to make sure __createFlash() runs after the caller sets ws.onopen etc.
    // Otherwise, when onopen fires immediately, onopen is called before it is set.
    setTimeout(function() {
      WebSocket.__addTask(function() {
        WebSocket.__flash.create(
            self.__id, url, protocols, proxyHost || null, proxyPort || 0, headers || null);
      });
    }, 0);
  };

  /**
   * Send data to the web socket.
   * @param {string} data  The data to send to the socket.
   * @return {boolean}  True for success, false for failure.
   */
  WebSocket.prototype.send = function(data) {
    if (this.readyState == WebSocket.CONNECTING) {
      throw "INVALID_STATE_ERR: Web Socket connection has not been established";
    }
    // We use encodeURIComponent() here, because FABridge doesn't work if
    // the argument includes some characters. We don't use escape() here
    // because of this:
    // https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Functions#escape_and_unescape_Functions
    // But it looks decodeURIComponent(encodeURIComponent(s)) doesn't
    // preserve all Unicode characters either e.g. "\uffff" in Firefox.
    // Note by wtritch: Hopefully this will not be necessary using ExternalInterface.  Will require
    // additional testing.
    var result = WebSocket.__flash.send(this.__id, encodeURIComponent(data));
    if (result < 0) { // success
      return true;
    } else {
      this.bufferedAmount += result;
      return false;
    }
  };

  /**
   * Close this web socket gracefully.
   */
  WebSocket.prototype.close = function() {
    if (this.readyState == WebSocket.CLOSED || this.readyState == WebSocket.CLOSING) {
      return;
    }
    this.readyState = WebSocket.CLOSING;
    WebSocket.__flash.close(this.__id);
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {string} type
   * @param {function} listener
   * @param {boolean} useCapture
   * @return void
   */
  WebSocket.prototype.addEventListener = function(type, listener, useCapture) {
    if (!(type in this.__events)) {
      this.__events[type] = [];
    }
    this.__events[type].push(listener);
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {string} type
   * @param {function} listener
   * @param {boolean} useCapture
   * @return void
   */
  WebSocket.prototype.removeEventListener = function(type, listener, useCapture) {
    if (!(type in this.__events)) return;
    var events = this.__events[type];
    for (var i = events.length - 1; i >= 0; --i) {
      if (events[i] === listener) {
        events.splice(i, 1);
        break;
      }
    }
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {Event} event
   * @return void
   */
  WebSocket.prototype.dispatchEvent = function(event) {
    var events = this.__events[event.type] || [];
    for (var i = 0; i < events.length; ++i) {
      events[i](event);
    }
    var handler = this["on" + event.type];
    if (handler) handler(event);
  };

  /**
   * Handles an event from Flash.
   * @param {Object} flashEvent
   */
  WebSocket.prototype.__handleEvent = function(flashEvent) {
    if ("readyState" in flashEvent) {
      this.readyState = flashEvent.readyState;
    }
    if ("protocol" in flashEvent) {
      this.protocol = flashEvent.protocol;
    }
    
    var jsEvent;
    if (flashEvent.type == "open" || flashEvent.type == "error") {
      jsEvent = this.__createSimpleEvent(flashEvent.type);
    } else if (flashEvent.type == "close") {
      // TODO implement jsEvent.wasClean
      jsEvent = this.__createSimpleEvent("close");
    } else if (flashEvent.type == "message") {
      var data = decodeURIComponent(flashEvent.message);
      jsEvent = this.__createMessageEvent("message", data);
    } else {
      throw "unknown event type: " + flashEvent.type;
    }
    
    this.dispatchEvent(jsEvent);
  };
  
  WebSocket.prototype.__createSimpleEvent = function(type) {
    if (document.createEvent && window.Event) {
      var event = document.createEvent("Event");
      event.initEvent(type, false, false);
      return event;
    } else {
      return {type: type, bubbles: false, cancelable: false};
    }
  };
  
  WebSocket.prototype.__createMessageEvent = function(type, data) {
    if (document.createEvent && window.MessageEvent && !window.opera) {
      var event = document.createEvent("MessageEvent");
      event.initMessageEvent("message", false, false, data, null, null, window, null);
      return event;
    } else {
      // IE and Opera, the latter one truncates the data parameter after any 0x00 bytes.
      return {type: type, data: data, bubbles: false, cancelable: false};
    }
  };
  
  /**
   * Define the WebSocket readyState enumeration.
   */
  WebSocket.CONNECTING = 0;
  WebSocket.OPEN = 1;
  WebSocket.CLOSING = 2;
  WebSocket.CLOSED = 3;

  WebSocket.__flash = null;
  WebSocket.__instances = {};
  WebSocket.__tasks = [];
  WebSocket.__nextId = 0;
  
  /**
   * Load a new flash security policy file.
   * @param {string} url
   */
  WebSocket.loadFlashPolicyFile = function(url){
    WebSocket.__addTask(function() {
      WebSocket.__flash.loadManualPolicyFile(url);
    });
  };

  /**
   * Loads WebSocketMain.swf and creates WebSocketMain object in Flash.
   */
  WebSocket.__initialize = function() {
    if (WebSocket.__flash) return;
    
    if (WebSocket.__swfLocation) {
      // For backword compatibility.
      window.WEB_SOCKET_SWF_LOCATION = WebSocket.__swfLocation;
    }
    if (!window.WEB_SOCKET_SWF_LOCATION) {
      console.error("[WebSocket] set WEB_SOCKET_SWF_LOCATION to location of WebSocketMain.swf");
      return;
    }
    var container = document.createElement("div");
    container.id = "webSocketContainer";
    // Hides Flash box. We cannot use display: none or visibility: hidden because it prevents
    // Flash from loading at least in IE. So we move it out of the screen at (-100, -100).
    // But this even doesn't work with Flash Lite (e.g. in Droid Incredible). So with Flash
    // Lite, we put it at (0, 0). This shows 1x1 box visible at left-top corner but this is
    // the best we can do as far as we know now.
    container.style.position = "absolute";
    if (WebSocket.__isFlashLite()) {
      container.style.left = "0px";
      container.style.top = "0px";
    } else {
      container.style.left = "-100px";
      container.style.top = "-100px";
    }
    var holder = document.createElement("div");
    holder.id = "webSocketFlash";
    container.appendChild(holder);
    document.body.appendChild(container);
    // See this article for hasPriority:
    // http://help.adobe.com/en_US/as3/mobile/WS4bebcd66a74275c36cfb8137124318eebc6-7ffd.html
    swfobject.embedSWF(
      WEB_SOCKET_SWF_LOCATION,
      "webSocketFlash",
      "1" /* width */,
      "1" /* height */,
      "10.0.0" /* SWF version */,
      null,
      null,
      {hasPriority: true, swliveconnect : true, allowScriptAccess: "always"},
      null,
      function(e) {
        if (!e.success) {
          console.error("[WebSocket] swfobject.embedSWF failed");
        }
      });
  };
  
  /**
   * Called by Flash to notify JS that it's fully loaded and ready
   * for communication.
   */
  WebSocket.__onFlashInitialized = function() {
    // We need to set a timeout here to avoid round-trip calls
    // to flash during the initialization process.
    setTimeout(function() {
      WebSocket.__flash = document.getElementById("webSocketFlash");
      WebSocket.__flash.setCallerUrl(location.href);
      WebSocket.__flash.setDebug(!!window.WEB_SOCKET_DEBUG);
      for (var i = 0; i < WebSocket.__tasks.length; ++i) {
        WebSocket.__tasks[i]();
      }
      WebSocket.__tasks = [];
    }, 0);
  };
  
  /**
   * Called by Flash to notify WebSockets events are fired.
   */
  WebSocket.__onFlashEvent = function() {
    setTimeout(function() {
      try {
        // Gets events using receiveEvents() instead of getting it from event object
        // of Flash event. This is to make sure to keep message order.
        // It seems sometimes Flash events don't arrive in the same order as they are sent.
        var events = WebSocket.__flash.receiveEvents();
        for (var i = 0; i < events.length; ++i) {
          WebSocket.__instances[events[i].webSocketId].__handleEvent(events[i]);
        }
      } catch (e) {
        console.error(e);
      }
    }, 0);
    return true;
  };
  
  // Called by Flash.
  WebSocket.__log = function(message) {
    console.log(decodeURIComponent(message));
  };
  
  // Called by Flash.
  WebSocket.__error = function(message) {
    console.error(decodeURIComponent(message));
  };
  
  WebSocket.__addTask = function(task) {
    if (WebSocket.__flash) {
      task();
    } else {
      WebSocket.__tasks.push(task);
    }
  };
  
  /**
   * Test if the browser is running flash lite.
   * @return {boolean} True if flash lite is running, false otherwise.
   */
  WebSocket.__isFlashLite = function() {
    if (!window.navigator || !window.navigator.mimeTypes) {
      return false;
    }
    var mimeType = window.navigator.mimeTypes["application/x-shockwave-flash"];
    if (!mimeType || !mimeType.enabledPlugin || !mimeType.enabledPlugin.filename) {
      return false;
    }
    return mimeType.enabledPlugin.filename.match(/flashlite/i) ? true : false;
  };
  
  if (!window.WEB_SOCKET_DISABLE_AUTO_INITIALIZATION) {
    if (window.addEventListener) {
      window.addEventListener("load", function(){
        WebSocket.__initialize();
      }, false);
    } else {
      window.attachEvent("onload", function(){
        WebSocket.__initialize();
      });
    }
  }
  
})();

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   *
   * @api public
   */

  exports.XHR = XHR;

  /**
   * XHR constructor
   *
   * @costructor
   * @api public
   */

  function XHR (socket) {
    if (!socket) return;

    io.Transport.apply(this, arguments);
    this.sendBuffer = [];
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(XHR, io.Transport);

  /**
   * Establish a connection
   *
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.open = function () {
    this.socket.setBuffer(false);
    this.onOpen();
    this.get();

    // we need to make sure the request succeeds since we have no indication
    // whether the request opened or not until it succeeded.
    this.setCloseTimeout();

    return this;
  };

  /**
   * Check if we need to send data to the Socket.IO server, if we have data in our
   * buffer we encode it and forward it to the `post` method.
   *
   * @api private
   */

  XHR.prototype.payload = function (payload) {
    var msgs = [];

    for (var i = 0, l = payload.length; i < l; i++) {
      msgs.push(io.parser.encodePacket(payload[i]));
    }

    this.send(io.parser.encodePayload(msgs));
  };

  /**
   * Send data to the Socket.IO server.
   *
   * @param data The message
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.send = function (data) {
    this.post(data);
    return this;
  };

  /**
   * Posts a encoded message to the Socket.IO server.
   *
   * @param {String} data A encoded message.
   * @api private
   */

  function empty () { };

  XHR.prototype.post = function (data) {
    var self = this;
    this.socket.setBuffer(true);

    function stateChange () {
      if (this.readyState == 4) {
        this.onreadystatechange = empty;
        self.posting = false;

        if (this.status == 200){
          self.socket.setBuffer(false);
        } else {
          self.onClose();
        }
      }
    }

    function onload () {
      this.onload = empty;
      self.socket.setBuffer(false);
    };

    this.sendXHR = this.request('POST');

    if (global.XDomainRequest && this.sendXHR instanceof XDomainRequest) {
      this.sendXHR.onload = this.sendXHR.onerror = onload;
    } else {
      this.sendXHR.onreadystatechange = stateChange;
    }

    this.sendXHR.send(data);
  };

  /**
   * Disconnects the established `XHR` connection.
   *
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.close = function () {
    this.onClose();
    return this;
  };

  /**
   * Generates a configured XHR request
   *
   * @param {String} url The url that needs to be requested.
   * @param {String} method The method the request should use.
   * @returns {XMLHttpRequest}
   * @api private
   */

  XHR.prototype.request = function (method) {
    var req = io.util.request(this.socket.isXDomain())
      , query = io.util.query(this.socket.options.query, 't=' + +new Date);

    req.open(method || 'GET', this.prepareUrl() + query, true);

    if (method == 'POST') {
      try {
        if (req.setRequestHeader) {
          req.setRequestHeader('Content-type', 'text/plain;charset=UTF-8');
        } else {
          // XDomainRequest
          req.contentType = 'text/plain';
        }
      } catch (e) {}
    }

    return req;
  };

  /**
   * Returns the scheme to use for the transport URLs.
   *
   * @api private
   */

  XHR.prototype.scheme = function () {
    return this.socket.options.secure ? 'https' : 'http';
  };

  /**
   * Check if the XHR transports are supported
   *
   * @param {Boolean} xdomain Check if we support cross domain requests.
   * @returns {Boolean}
   * @api public
   */

  XHR.check = function (socket, xdomain) {
    try {
      var request = io.util.request(xdomain),
          usesXDomReq = (global.XDomainRequest && request instanceof XDomainRequest),
          socketProtocol = (socket && socket.options && socket.options.secure ? 'https:' : 'http:'),
          isXProtocol = (global.location && socketProtocol != global.location.protocol);
      if (request && !(usesXDomReq && isXProtocol)) {
        return true;
      }
    } catch(e) {}

    return false;
  };

  /**
   * Check if the XHR transport supports cross domain requests.
   *
   * @returns {Boolean}
   * @api public
   */

  XHR.xdomainCheck = function (socket) {
    return XHR.check(socket, true);
  };

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.htmlfile = HTMLFile;

  /**
   * The HTMLFile transport creates a `forever iframe` based transport
   * for Internet Explorer. Regular forever iframe implementations will 
   * continuously trigger the browsers buzy indicators. If the forever iframe
   * is created inside a `htmlfile` these indicators will not be trigged.
   *
   * @constructor
   * @extends {io.Transport.XHR}
   * @api public
   */

  function HTMLFile (socket) {
    io.Transport.XHR.apply(this, arguments);
  };

  /**
   * Inherits from XHR transport.
   */

  io.util.inherit(HTMLFile, io.Transport.XHR);

  /**
   * Transport name
   *
   * @api public
   */

  HTMLFile.prototype.name = 'htmlfile';

  /**
   * Creates a new Ac...eX `htmlfile` with a forever loading iframe
   * that can be used to listen to messages. Inside the generated
   * `htmlfile` a reference will be made to the HTMLFile transport.
   *
   * @api private
   */

  HTMLFile.prototype.get = function () {
    this.doc = new window[(['Active'].concat('Object').join('X'))]('htmlfile');
    this.doc.open();
    this.doc.write('<html></html>');
    this.doc.close();
    this.doc.parentWindow.s = this;

    var iframeC = this.doc.createElement('div');
    iframeC.className = 'socketio';

    this.doc.body.appendChild(iframeC);
    this.iframe = this.doc.createElement('iframe');

    iframeC.appendChild(this.iframe);

    var self = this
      , query = io.util.query(this.socket.options.query, 't='+ +new Date);

    this.iframe.src = this.prepareUrl() + query;

    io.util.on(window, 'unload', function () {
      self.destroy();
    });
  };

  /**
   * The Socket.IO server will write script tags inside the forever
   * iframe, this function will be used as callback for the incoming
   * information.
   *
   * @param {String} data The message
   * @param {document} doc Reference to the context
   * @api private
   */

  HTMLFile.prototype._ = function (data, doc) {
    // unescape all forward slashes. see GH-1251
    data = data.replace(/\\\//g, '/');
    this.onData(data);
    try {
      var script = doc.getElementsByTagName('script')[0];
      script.parentNode.removeChild(script);
    } catch (e) { }
  };

  /**
   * Destroy the established connection, iframe and `htmlfile`.
   * And calls the `CollectGarbage` function of Internet Explorer
   * to release the memory.
   *
   * @api private
   */

  HTMLFile.prototype.destroy = function () {
    if (this.iframe){
      try {
        this.iframe.src = 'about:blank';
      } catch(e){}

      this.doc = null;
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;

      CollectGarbage();
    }
  };

  /**
   * Disconnects the established connection.
   *
   * @returns {Transport} Chaining.
   * @api public
   */

  HTMLFile.prototype.close = function () {
    this.destroy();
    return io.Transport.XHR.prototype.close.call(this);
  };

  /**
   * Checks if the browser supports this transport. The browser
   * must have an `Ac...eXObject` implementation.
   *
   * @return {Boolean}
   * @api public
   */

  HTMLFile.check = function (socket) {
    if (typeof window != "undefined" && (['Active'].concat('Object').join('X')) in window){
      try {
        var a = new window[(['Active'].concat('Object').join('X'))]('htmlfile');
        return a && io.Transport.XHR.check(socket);
      } catch(e){}
    }
    return false;
  };

  /**
   * Check if cross domain requests are supported.
   *
   * @returns {Boolean}
   * @api public
   */

  HTMLFile.xdomainCheck = function () {
    // we can probably do handling for sub-domains, we should
    // test that it's cross domain but a subdomain here
    return false;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('htmlfile');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports['xhr-polling'] = XHRPolling;

  /**
   * The XHR-polling transport uses long polling XHR requests to create a
   * "persistent" connection with the server.
   *
   * @constructor
   * @api public
   */

  function XHRPolling () {
    io.Transport.XHR.apply(this, arguments);
  };

  /**
   * Inherits from XHR transport.
   */

  io.util.inherit(XHRPolling, io.Transport.XHR);

  /**
   * Merge the properties from XHR transport
   */

  io.util.merge(XHRPolling, io.Transport.XHR);

  /**
   * Transport name
   *
   * @api public
   */

  XHRPolling.prototype.name = 'xhr-polling';

  /**
   * Indicates whether heartbeats is enabled for this transport
   *
   * @api private
   */

  XHRPolling.prototype.heartbeats = function () {
    return false;
  };

  /** 
   * Establish a connection, for iPhone and Android this will be done once the page
   * is loaded.
   *
   * @returns {Transport} Chaining.
   * @api public
   */

  XHRPolling.prototype.open = function () {
    var self = this;

    io.Transport.XHR.prototype.open.call(self);
    return false;
  };

  /**
   * Starts a XHR request to wait for incoming messages.
   *
   * @api private
   */

  function empty () {};

  XHRPolling.prototype.get = function () {
    if (!this.isOpen) return;

    var self = this;

    function stateChange () {
      if (this.readyState == 4) {
        this.onreadystatechange = empty;

        if (this.status == 200) {
          self.onData(this.responseText);
          self.get();
        } else {
          self.onClose();
        }
      }
    };

    function onload () {
      this.onload = empty;
      this.onerror = empty;
      self.retryCounter = 1;
      self.onData(this.responseText);
      self.get();
    };

    function onerror () {
      self.retryCounter ++;
      if(!self.retryCounter || self.retryCounter > 3) {
        self.onClose();  
      } else {
        self.get();
      }
    };

    this.xhr = this.request();

    if (global.XDomainRequest && this.xhr instanceof XDomainRequest) {
      this.xhr.onload = onload;
      this.xhr.onerror = onerror;
    } else {
      this.xhr.onreadystatechange = stateChange;
    }

    this.xhr.send(null);
  };

  /**
   * Handle the unclean close behavior.
   *
   * @api private
   */

  XHRPolling.prototype.onClose = function () {
    io.Transport.XHR.prototype.onClose.call(this);

    if (this.xhr) {
      this.xhr.onreadystatechange = this.xhr.onload = this.xhr.onerror = empty;
      try {
        this.xhr.abort();
      } catch(e){}
      this.xhr = null;
    }
  };

  /**
   * Webkit based browsers show a infinit spinner when you start a XHR request
   * before the browsers onload event is called so we need to defer opening of
   * the transport until the onload event is called. Wrapping the cb in our
   * defer method solve this.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  XHRPolling.prototype.ready = function (socket, fn) {
    var self = this;

    io.util.defer(function () {
      fn.call(self);
    });
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('xhr-polling');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {
  /**
   * There is a way to hide the loading indicator in Firefox. If you create and
   * remove a iframe it will stop showing the current loading indicator.
   * Unfortunately we can't feature detect that and UA sniffing is evil.
   *
   * @api private
   */

  var indicator = global.document && "MozAppearance" in
    global.document.documentElement.style;

  /**
   * Expose constructor.
   */

  exports['jsonp-polling'] = JSONPPolling;

  /**
   * The JSONP transport creates an persistent connection by dynamically
   * inserting a script tag in the page. This script tag will receive the
   * information of the Socket.IO server. When new information is received
   * it creates a new script tag for the new data stream.
   *
   * @constructor
   * @extends {io.Transport.xhr-polling}
   * @api public
   */

  function JSONPPolling (socket) {
    io.Transport['xhr-polling'].apply(this, arguments);

    this.index = io.j.length;

    var self = this;

    io.j.push(function (msg) {
      self._(msg);
    });
  };

  /**
   * Inherits from XHR polling transport.
   */

  io.util.inherit(JSONPPolling, io.Transport['xhr-polling']);

  /**
   * Transport name
   *
   * @api public
   */

  JSONPPolling.prototype.name = 'jsonp-polling';

  /**
   * Posts a encoded message to the Socket.IO server using an iframe.
   * The iframe is used because script tags can create POST based requests.
   * The iframe is positioned outside of the view so the user does not
   * notice it's existence.
   *
   * @param {String} data A encoded message.
   * @api private
   */

  JSONPPolling.prototype.post = function (data) {
    var self = this
      , query = io.util.query(
             this.socket.options.query
          , 't='+ (+new Date) + '&i=' + this.index
        );

    if (!this.form) {
      var form = document.createElement('form')
        , area = document.createElement('textarea')
        , id = this.iframeId = 'socketio_iframe_' + this.index
        , iframe;

      form.className = 'socketio';
      form.style.position = 'absolute';
      form.style.top = '0px';
      form.style.left = '0px';
      form.style.display = 'none';
      form.target = id;
      form.method = 'POST';
      form.setAttribute('accept-charset', 'utf-8');
      area.name = 'd';
      form.appendChild(area);
      document.body.appendChild(form);

      this.form = form;
      this.area = area;
    }

    this.form.action = this.prepareUrl() + query;

    function complete () {
      initIframe();
      self.socket.setBuffer(false);
    };

    function initIframe () {
      if (self.iframe) {
        self.form.removeChild(self.iframe);
      }

      try {
        // ie6 dynamic iframes with target="" support (thanks Chris Lambacher)
        iframe = document.createElement('<iframe name="'+ self.iframeId +'">');
      } catch (e) {
        iframe = document.createElement('iframe');
        iframe.name = self.iframeId;
      }

      iframe.id = self.iframeId;

      self.form.appendChild(iframe);
      self.iframe = iframe;
    };

    initIframe();

    // we temporarily stringify until we figure out how to prevent
    // browsers from turning `\n` into `\r\n` in form inputs
    this.area.value = io.JSON.stringify(data);

    try {
      this.form.submit();
    } catch(e) {}

    if (this.iframe.attachEvent) {
      iframe.onreadystatechange = function () {
        if (self.iframe.readyState == 'complete') {
          complete();
        }
      };
    } else {
      this.iframe.onload = complete;
    }

    this.socket.setBuffer(true);
  };

  /**
   * Creates a new JSONP poll that can be used to listen
   * for messages from the Socket.IO server.
   *
   * @api private
   */

  JSONPPolling.prototype.get = function () {
    var self = this
      , script = document.createElement('script')
      , query = io.util.query(
             this.socket.options.query
          , 't='+ (+new Date) + '&i=' + this.index
        );

    if (this.script) {
      this.script.parentNode.removeChild(this.script);
      this.script = null;
    }

    script.async = true;
    script.src = this.prepareUrl() + query;
    script.onerror = function () {
      self.onClose();
    };

    var insertAt = document.getElementsByTagName('script')[0];
    insertAt.parentNode.insertBefore(script, insertAt);
    this.script = script;

    if (indicator) {
      setTimeout(function () {
        var iframe = document.createElement('iframe');
        document.body.appendChild(iframe);
        document.body.removeChild(iframe);
      }, 100);
    }
  };

  /**
   * Callback function for the incoming message stream from the Socket.IO server.
   *
   * @param {String} data The message
   * @api private
   */

  JSONPPolling.prototype._ = function (msg) {
    this.onData(msg);
    if (this.isOpen) {
      this.get();
    }
    return this;
  };

  /**
   * The indicator hack only works after onload
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  JSONPPolling.prototype.ready = function (socket, fn) {
    var self = this;
    if (!indicator) return fn.call(this);

    io.util.load(function () {
      fn.call(self);
    });
  };

  /**
   * Checks if browser supports this transport.
   *
   * @return {Boolean}
   * @api public
   */

  JSONPPolling.check = function () {
    return 'document' in global;
  };

  /**
   * Check if cross domain requests are supported
   *
   * @returns {Boolean}
   * @api public
   */

  JSONPPolling.xdomainCheck = function () {
    return true;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('jsonp-polling');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

if (typeof define === "function" && define.amd) {
  define([], function () { return io; });
}
})();
},{}],13:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],14:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.once = noop;
process.off = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],15:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],16:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":15,"/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":14,"inherits":13}]},{},[])