// Platform - a hierarchy of devices
//
// A platform represents the various equipments available, typically in a room.
// It is described by a configuration file (a json file).

// Node modules
var fs = require('fs');

// Shared modules
var OO = require('OO');
var log = require('Log').shared();
var Path = require('path');

// Internal modules
var Device = require('./Device');

// The `Platform` class.
var Platform = Device.subclass().name('Platform')
	.constructor(function(config, options, events) {
		this._super(config, options, events);
		if (options)
			this.set(options);
	})
	.methods({
		// Create the platform menu
		makeMenu: function() {
			// Create Platform menu in UI
			var gui = null;
			try {
				gui = window.require('nw.gui');
			} catch(e) {
				// We're not running under node-webkit - give up
				this.menu = null;
				return;
			}

			var win = gui.Window.get();
			if (!win.menu)
				win.menu = new gui.Menu({ type: 'menubar' });
			var menuBar = win.menu;

			var platformMenu = new gui.Menu();
			var self = this;
			var name = this.name || 'devices';

			platformMenu.append(new gui.MenuItem({
				label: 'Start '+ name,
				click: function() { self.start(); },
			}));
			platformMenu.append(new gui.MenuItem({
				label: 'Stop '+ name,
				click: function() { self.stop(); },
			}));
			platformMenu.append(new gui.MenuItem({
				label: 'Restart '+ name,
				click: function() { self.restart(); },
			}));
			platformMenu.append(new gui.MenuItem({
				label: 'Shutdown '+ name,
				click: function() { self.shutdown(); },
			}));
			menuBar.insert(new gui.MenuItem({
				label: 'Platform',
				submenu: platformMenu,
			}), 2);

			this.menu = platformMenu;
		},

		// Notify that the platform object is created,
		// add the component devices to it, and notify that the platform is available
		addDevices: function() {
			this.makeMenu();
			this.deviceCreated();
			this._super();
			this.deviceAvailable();
		},

		// Create a window with the UI for the platform.
		// The UI, if any, is described by a property `UI` in the config file.
		// This property holds at least a `frame` propery (size of the window holding the UI)
		// and an optional `url` property, to be loaded in the new window.
		// *** We could also inject JS/CSS/HTML in the default UI
		makeUI: function() {
			if (! this.config.UI)
				return;
			var UI = this.config.UI;
			var win = null;
			
			if (UI.frame) {
				var gui = process.mainModule.exports.gui;
				var url = '../content/platform.html';	// URL is relative to the lib folder
				if (UI.url)	// interpret it relative to the config file folder
					url = 'file://'+Path.resolve(this.dirname(), UI.url);
				log.method(this, 'makeUI', '- url', url);
				win = gui.Window.open(url, UI.frame);
				this.window = win;
			}

			return win;
		},

		// Return the window holding the platform UI.
		getUIWindow: function() {
			if (!this.window)
				return null;
			return this.window.window;
		},

		// Inject a script file (by creating and adding a <script> tag) into the platform UI.
		// `id` is an optional id to assign to the created element (e.g., to remove it later).
		// `cb` is an optional callback called when the inserted JS has executed.
		injectJSText: function(text, id, cb) {
			// parse arguments for the case where id is omitted
			if (typeof id === 'function') { cb = id; id = null; }

			var win = this.getUIWindow();
			if (!win)
				return false;

			var script = win.document.createElement('script');
			if (id)
				script.id = id;
			script.type = 'text/javascript';
			script.innerHTML = text;
			if (cb)
				script.onload = cb;

			win.document.body.appendChild(script);
			return true;
		},

		// Inject a script (by creating and adding a <script> tag) into the platform UI.
		// `id` is an optional id to assign to the created element (e.g., to remove it later).
		// `cb` is an optional callback called when the inserted JS has executed.
		injectJSFile: function(path, id, cb) {
			// parse arguments for the case where id is omitted
			if (typeof id === 'function') { cb = id; id = null; }

			var win = this.getUIWindow();
			if (!win)
				return false;

			var script = win.document.createElement('script');
			if (id)
				script.id = id;
			script.type = 'text/javascript';
			script.src = path;	// path is relative to the server/content directory
			if (cb)
				script.onload = cb;

			win.document.body.appendChild(script);
			return true;
		},

		// Inject a stylesheet (by creating and adding a <style> tag) into the platform UI.
		// `id` is an optional id to assign to the created element (e.g., to remove it later).
		// `cb` is an optional callback called when the inserted CSS is ready.
		injectCSSText: function(text, id, cb) {
			// parse arguments for the case where id is omitted
			if (typeof id === 'function') { cb = id; id = null; }

			var win = this.getUIWindow();
			if (!win)
				return false;

			if (id)
				script.id = id;
			var style = win.document.createElement('style');
			style.type = 'text/css';
			style.innerHTML = text;
			if (cb)
				style.onload = cb;

			win.document.head.appendChild(style);
			return true;
		},

		// Inject a stylesheet file (by creating and adding a <link> tag) into the platform UI.
		// `id` is an optional id to assign to the created element (e.g., to remove it later).
		// `cb` is an optional callback called when the inserted CSS is ready.
		injectCSSFile: function(path, id, cb) {
			// parse arguments for the case where id is omitted
			if (typeof id === 'function') { cb = id; id = null; }

			var win = this.getUIWindow();
			if (!win)
				return false;

			var style = win.document.createElement('link');
			if (id)
				script.id = id;
			style.rel = 'stylesheet';
			style.type = 'text/css';
			style.href = path;	// path is relative to the server/content directory
			if (cb)
				style.onload = cb;

			win.document.head.appendChild(style);
			return true;
		},

		// Inject a piece of HTML inside/around an element of the platform UI.
		// `elementId` defaults to `platform`, the section of the platform UI that can be extended.
		// `how` can be `replace`, or one of the modes accepted by `insertAdjacentHTML`:
		// `beforebegin` (before element), `afterbegin` (at beginning of element), 
		// `beforeend` (at end of element - the default), or `afterend` (after element).
		// Note that the inserted HTML is not executed, i.e. embedded scripts are not executed.
		// Use injectJSFile/Text for this.
		// *** Note: this one has no callback because we don't know on what element to set it.
		// *** We should turn the HTML into a tree ourselves, and then do as above.
		// *** It also does not have an id since it can be put in the script itslef
		injectHTMLText: function(html, elementId, how) {
			var win = this.getUIWindow();
			if (!win)
				return false;

			if (! elementId)
				elementId = 'platform';
			if (! how)
				how = 'beforend';

			var element = win.document.getElementById(elementId);
			if (! element) {
				log.warn.message('injectHTML: could not find element', elementId);
				return false;
			}

			if (how == 'replace')
				element.innerHTML = html;
			else
				element.insertAdjacentHTML(how, html);

			return true;
		},

		// Insert an HTML file inside/around an element of the platform UI.
		// See `injectHTMLText` above for arguments.
		injectHTMLFile: function(path, elementId, how) {
			// path is relative to server/content 
			path = __dirname + '/../content/' + path;
			var html = fs.readFileSync(path, {encoding: 'utf8'});
			if (!html) {
				log.warn.message('injectHTML: could not read file', path);
				return false;
			}
			return this.injectHTMLText(html, elementId, how);
		},

		// Callback when a new client connects/disconnects.
		// Find a matching device and if so notify it.
		// The device can register itself to the server with be notified of the disconnection
		clientConnected: function(socket, server, clientInfo) {
			var device = this.findDevice(clientInfo.device);
			if (device)
				device.clientConnected(socket, server, clientInfo);
			return device;
/*
			this.mapDevices(function(device) {
				if (device.clientConnected)
					device.clientConnected(socket, server);
			});
*/
		},
		clientDisconnected: function(socket, server) {
			this.mapDevices(function(device) {
				if (device.clientDisconnected)
					device.clientDisconnected(socket, server);
			});
		},

		// Start/Stop/Restart the platform.
		// Emits an event that devices can listen to.
		start: function() {
			log.method(this, 'start');
			this.emit('start');
		},
		stop: function() {
			log.method(this, 'stop');
			this.emit('stop');
		},
		restart: function() {
			log.method(this, 'restart');
			this.emit('restart');
		},

		// Shudown the platform.
		// Emits a 'shutdown' events that devices can listen to.
		shutdown: function() {
			log.method(this, 'shutdown');
			this.emit('shutdown');
		},
	});

log.spyMethodsExcept(Platform, ['getUIWindow']);

module.exports = Platform;
