// Browser app - displays a web page 
//
// Simple example of application:
// Load a page in the surface and pan/zoom it from the control interface.
//

// Shared modules
var log = require('Log').logger('Browser');

// Server modules
var App = require('../../lib/App');


// The `Browser` class.
var Browser = App.subclass().name('Browser')
	.fields({
		// background page + its offset and zoom factor
		url: null,		// URL of the page to load
		coords: {x: 0, y: 0, zoom: 1},
		width: 800,		// Size of page
		height: 600,
	})
	.constructor(function(config) {
		// *** It looks like we must define a constructor for the ObjectSharer constructor mixin to work
		log.method(this, 'constructor');
		this._super(config);
	})
	.methods({
		initPlatform: function(platform) {
			log.method(this, 'initPlatform', platform);
			this.platform = platform;

			// Find out the size of the surface
			var surface = platform.findDevice({type: 'Surface'});
			if (surface && surface.width) {
					// Guess a reasonable zoom factor
					this.coords.zoom = surface.width / 1280;
					this.width = surface.width / this.coords.zoom;
					this.height = surface.height / this.coords.zoom;
					this.coords.x = this.coords.y = 0;
			}

			// The path for `injectJSFile` is relative to the url of the document.
			// Since we don't control this, we use an absolute path, based on
			// `this.__dirname`, the absolute path from which the app was loaded.
			var plugin = 'file://'+this.__dirname+'/jquery.mousewheel.min.js';
			var ui = 'file://'+this.__dirname+'/ui.js';
			platform.GUI.injectJSFile(plugin, 'mousewheelJS',
				// make sure we load the ui after the mousewheel code is loaded
				function() { platform.GUI.injectJSFile(ui, 'browserJS'); }
			);
		},

		// Called when the app is about to be unloaded.
		stop: function() {
			this._super();

			// var win = this.platform.GUI.getUIWindow();
			// if (win)
			// 	win.window.stopBrowser();
		},

		// These methods are meant to be called by clients to change the state of the app

		// Set the URL
		setURL: function(url) {
			// Prepend local content dir if no http prefix
			if (! url.match(/https?:\/\//))
				url = 'app://localhost/content/' + url;
			this.url = url;
		},

		// Pan/zoom the page in the display surface
		panBy: function(dX, dY) {
			log.method(this, 'panBy', dX, dY);
			this.coords.x += dX;
			this.coords.y += dY;
		},

		// Zoom the content of the page (and resize it accordingly)
		zoomBy: function(dZ, x, y) {
			log.method(this, 'zoomBy', dZ, x, y);
			this.coords.x = x + (this.coords.x - x) * dZ;
			this.coords.y = y + (this.coords.y - y) * dZ;
			this.coords.zoom *= dZ;
		},

		// Resize the page (without scaling the content)
		resizeBy: function(dW, dH) {
			log.method(this, 'resizeBy', dW, dH);
			var width = this.width + dW;
			if (width < 10)
				width = 10;
			var height = this.height + dH;
			if (height < 10)
				height = 10;
			this.width = width;
			this.height = height;
		},

		// Execute Javascript method in the web page of each client
		remoteExec: function(obj, fun, args) {
			// execute in the local UI and remotely at each client
			var targetWindow = this.platform.GUI.getUIWindow().frames['browserPage'].contentWindow;
			if (targetWindow)
				try {
					targetWindow[obj][fun](); // *** ignore args for now
				} catch(e) {
					// ignore errors
				}
		}
	})
	.shareState({
		fields: 'own', 
		objectFields: ['coords'], 
		notify: ['remoteExec'], 
		methods: ['stop', 'setURL', 'panBy', 'zoomBy', 'resizeBy'],
	});


log.spyMethods(Browser);

module.exports = Browser;
