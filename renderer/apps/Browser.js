// Browser app - displays a web page 
//
// Simple example of application:
// Load a page in the surface and pan/zoom it from the control interface.
//

// Shared modules
var OO = require('OO');
var log = require('Log').logger('Browser');

// Renderer modules
var App = require('../lib/App');

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
		this._super(config);

		// Monitor state to adjust presentation
		this.wrapFields({
			set url(url)   { this._set(url); this.adjustURLs(); },
			set offsetX(x) { this._set(x); this.adjustPositions(); },
			set offsetY(y) { this._set(y); this.adjustPositions(); },
			set zoom(z)    { this._set(z); this.adjustPositions(); },
		});
	})
	.methods({
		// Called by the framework when the webpage representing the tile is ready
		tileReady: function(tile) {
			if (!tile.window)
				return;

			if (this.url)
				this.adjustURL();

			// Set a permanent handler for subsequent loads.
			// Note that this works too when a page has an auto-refresh.
			var self = this;
			tile.window.on('loaded', function() {
				log.enter(self, 'loaded');
				self.loaded(tile);
				log.exit(self, 'loaded');
			});
		},
		
		// Called when the content of the window is loaded and ready.
		loaded: function(tile) {
			// Adjust the style of the body.
			var style = tile.window.window.document.body.style;
			style.position = "absolute";
			style.overflow = "hidden";
			style.width = "1000px";

			// Adjust the tile origin.
			this.adjustPosition(tile);
		},

		// Adjust positions of each tile
		adjustURLs: function() {
			var self = this;
			this.mapTiles(function(tile) {
				self.adjustURL(tile);
			});
		},

		// Change the URL.
		adjustURL: function (tile) {
			if (!tile || !tile.ready || !tile.window) {
				log.method(this, 'adjustURL', '- tile not ready');
				return;
			}
			log.method(this, 'adjustURL',this.url);

			// If URL is empty, use default one (tile.html).
			// If it is relative, prepend local server prefix.
			var url = this.url;
			if (!url)
				url = 'tile.html';
			if (! url.match(/http:\/\//))
				url = 'app://localhost/content/'+url;

			// This will trigger a loaded event that will be handled above.
			tile.window.window.location.href = url;
		},

		// Adjust positions of each tile
		adjustPositions: function() {
			var self = this;
			this.mapTiles(function(tile) {
				self.adjustPosition(tile);
			});
		},

		// Adjust the offset of the body element to view the proper part 
		// of the content and create the mosaic effect
		adjustPosition: function (tile) {
			if (!tile || !tile.ready || !tile.window) {
				log.method(this, 'adjustPosition', '- tile not ready');
				return;
			}
			log.method(this, 'adjustTile'+this.offsetX+' '+this.offsetY+' - '+tile.originX+' '+tile.originY+' - '+this.zoom);

			var style = tile.window.window.document.body.style;
			style.left = Math.round((this.offsetX-tile.originX)/this.zoom)+"px";
			style.top = Math.round((this.offsetY-tile.originY)/this.zoom)+"px";
			style.zoom = Math.round(this.zoom*100,2)+'%';
		},

	})
	.shareState()
;

log.spyMethods(Browser);

module.exports = Browser;
