// SlideShow app - displays slides 
//
// Slides can be tiled images or HTML pages.
//

// Node modules
var Path = require('path');

// Shared modules
var OO = require('OO');
var log = require('Log').logger('SlideShow');
var HTML = require('HTML');

// Renderer modules
var App = require('../lib/App');
var Layer = require('../lib/Layer');

// Root of the executable
var appRoot = Path.join(__dirname, "../..");	// *** probably wrong when the app is packaged

// The `SlideShow` class.
var SlideShow = App.subclass().name('SlideShow')
	.fields({
		slideRoot: null,
		clientRoot: null,

		slideShow: null,
		slides: [],
		currentSlideIndex: -1,
		currentSlide: null,
	})
	.constructor(function(config) {
		this._super(config);

		this.layer = Layer.create({
			type: 'image',
			mode: 'grid',
		});

		this.wrapFields({
			set currentSlide(path) { this._set(path); this.adjustSlides(); },
		});

		this.adjustSlides();
	})
	.methods({
		// Return the tilename, which corresponds to the root of the name of the image to load in the tile.
		tileName: function(tile) {
			// *** WE ALSO NEED TO UPDATE TILEMAKER to understand the new format with the rank
			var name = this.server.host+'_'+this.server.instance;
			if (tile.rank !== null)
				name += '_'+tile.rank;
			return name;
		},

		// Return the absolute path to `file`:
		//	<clientRoot>/<file> if file is relative and clientRoot is absolute
		//	<appRoot>/<clientRoot>/<file> if file and clientRoot are relative
		//	<clientRoot> defaults to <slideRoot>
		slidePath: function(file) {
			var path = this.clientRoot || this.slideRoot || '';
			if (! file)
				file = '';

			if (! path.match(/^\//))	// relative to WildOS executable
				return Path.join(appRoot, path, file);
			return Path.join(path, file);
		},

		// Adjust the view
		adjustSlides: function() {
			var self = this;
			this.mapReadyTiles(function(tile) {
				self.adjustSlide(tile, self.tileName(tile));
			});
		},

		adjustSlide: function(tile, tileName) {
			if (!tile || !tile.ready || !tile.window) {	// should not happen
				log.warn.method('adjustSlide', 'called with tile not ready');
				return;
			}

			var url = 'file://'+Path.join(this.slidePath(this.currentSlide), 'tiles_byhost', tileName+'.png');
			HTML.setAttributes(tile.window.window, this.layer.id, {src: url});
		},

		// Called when the layer is removed
		stop: function() {
			this.layer.close();
			this.layer = null;
			this._super();
		},
	})
	.shareState()
;

log.spyMethods(SlideShow);

module.exports = SlideShow;
