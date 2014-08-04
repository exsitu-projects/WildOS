// Browser app - displays a web page 
//
// Simple example of application:
// Load a page in the surface and pan/zoom it from the control interface.
//

// Shared modules
var OO = require('OO');
var log = require('Log').logger('Browser');

// Server modules
var App = require('../../lib/App');

// Device modules
var Surface = require('../../devices/Surface');

// The `Browser` class.
var Browser = App.subclass().name('Browser')
	.fields({
		// background page + its offset and zoom factor
		url: null,		// URL of the page to load
		offsetX: 0,		// Offset of the page from the topleft of the surface
		offsetY: 0,				
		zoom: 1,		// Zoom factor
	})
	.constructor(function(config) {
		// *** It looks like we must define a constructor for the ObjectSharer constructor mixin to work
		log.method(this, 'constructor');
		this._super(config);
	})
	.methods({
		initPlatform: function(platform) {
			log.method(this, 'initPlatform');
			this.platform = platform;
			// The path for `injectUIScript` is relative to the url of the document.
			// Since we don't control this, we use an absolute path, based on
			// `this.__dirname`, the absolute path from which the app was loaded.
			platform.injectJSFile('file://'+this.__dirname+'/jquery.mousewheel.min.js', 'mousewheelJS');
			platform.injectJSFile('file://'+this.__dirname+'/ui.js', 'browserJS');
		},

		// Called when the app is about to be unloaded.
		stop: function() {
			this._super();

			if (this.platform.window)
				this.platform.window.window.browserApp.stop();
		},

		// These methods are meant to be called by clients to change the state of the app

		// Set the URL
		setURL: function(url) {
			// Prepend local content dir if no http prefix
			if (! url.match(/http:\/\//))
				url = 'app://localhost/content/' + url;
			this.url = url;
		},

		// Pan/zoom the page in the display surface
		panBy: function(dX, dY) {
			log.method(this, 'panBy', dX, dY);
			this.offsetX += dX;
			this.offsetY += dY;
		},

		// Called by the UI to zoom the page.
		zoomBy: function(dZ, x, y) {
			log.method(this, 'zoomBy', dZ, x, y);
			this.offsetX = x + (this.offsetX - x) * dZ;
			this.offsetY = y + (this.offsetY - y) * dZ;
			this.zoom *= dZ;
		},
	})
	.shareState('own', 'own')
;

log.spyMethods(Browser);

module.exports = Browser;
