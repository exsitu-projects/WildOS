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
		offsetX: 0,		// Offset of the page from the topleft of the surface
		offsetY: 0,				
		width: 800,		// Size of page
		height: 600,	
		zoom: 1,		// Zoom factor
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
			set offsetX(x) { log.message('set offsetX'); this._set(x); this.layer.left = x; log.message('done set offsetX'); },
			set offsetY(y) { log.message('set offsetY'); this._set(y); this.layer.top = y; log.message('done set offsetY'); },
			set width(w)   { log.message('set width'); this._set(w); this.layer.width = w; log.message('done set width'); },
			set height(h)  { log.message('set height'); this._set(h); this.layer.height = h; log.message('done set height'); },
			set zoom(z)    { log.message('set zoom'); this._set(z); this.layer.zoom = z; log.message('done set zoom'); },
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
