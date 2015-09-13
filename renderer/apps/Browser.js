// Browser app - displays a web page 
//
// Simple example of application:
// Load a page in the surface and pan/zoom it from the control interface.
//

// Shared modules
var log = require('Log').logger('Browser');

// Renderer modules
var App = require('../lib/App');
var Layer = require('../lib/Layer');
var Tile = require('../lib/Tile');

// The `Browser` class.
var Browser = App.subclass().name('Browser')
	.fields({
		// background page + its offset and zoom factor
		url: null,		// URL of the page to load
		// offsetX: 0,		// Offset of the page from the topleft of the surface
		// offsetY: 0,				
		// zoom: 1,		// Zoom factor
		coords: {x: 0, y: 0, zoom: 1},
		width: 800,		// Size of page
		height: 600,	
	})
	.constructor(function(config) {
		log.enter(this, 'create', config);

		this._super(config);

		this.layer = Layer.create({
			type: 'iframe',
			url: this.url,
			left: this.offsetX, 
			top: this.offsetY,
			width: this.width,
			height: this.height,
			zoom: this.zoom,
		});

		// Monitor state to adjust presentation
		this.wrapFields({
			set url(url)   { this._set(url); this.layer.url = this.adjustURL(url); },
			set coords(c)  { log.message('set coords'); this._set(c); this.layer.left = c.x; this.layer.top = c.y; this.layer.zoom = c.zoom; log.message('done set zoom'); },
			set width(w)   { log.message('set width'); this._set(w); this.layer.width = w; log.message('done set width'); },
			set height(h)  { log.message('set height'); this._set(h); this.layer.height = h; log.message('done set height'); },
		});

		log.newObject(this);
		log.exit(this, 'create');
	})
	.methods({
		// Change the URL.
		adjustURL: function (tile) {
			log.method(this, 'adjustURL',this.url);

			// If URL is empty, use default one (default.html).
			// If it is relative, prepend local server prefix.
			var url = this.url;
			if (!url)
				url = 'default.html';
			if (! url.match(/https?:\/\//))
				url = 'app://localhost/content/'+url;

			return url;
		},

		stop: function() {
			this.layer.close();
			this.layer = null;
			this._super();
		},

		// execute a script in the local page
		remoteExec_after: function(obj, fun, args) {
			if (!this.layer)
				return;

			var self = this;
			Tile.mapReadyTiles(function(tile) {
				var targetWindow = tile.window.window.frames[self.layer.id].contentWindow;
				if (targetWindow)
					try {
						targetWindow[obj][fun](); // *** ignore args for now
					} catch(e) {
						// ignore errors
					}
			});
		},

	})
	.shareState()
;

log.spyMethods(Browser);

module.exports = Browser;
