// SlideShow app - displays slides 
//
// Slides can be tiled images or HTML pages.
//

// Node modules
var Path = require('path');

// Shared modules
var OO = require('OO');
var log = require('Log').logger('SlideShow');

// Renderer modules
var App = require('../lib/App');

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

		this.wrapFields({
			set currentSlide(path) { this._set(path); this.adjustSlides(); },
		});
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

		// Called by the framework when the webpage representing the tile is ready
		tileReady: function(tile) {
			this.adjustSlide(tile, this.tileName(tile));
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
			this.mapTiles(function(tile) {
				self.adjustSlide(tile, self.tileName(tile));
			});
		},

		adjustSlide: function(tile, tileName) {
			if (! tile) log.warn.method(this, 'adjustSlide', 'No tile!!');
			else if (! tile.ready) log.warn.method(this, 'adjustSlide', 'Tile not ready!!');
			else if (! tile.window) log.warn.method(this, 'ajustSlide', 'No window!!');

			if (tile && tile.ready && tile.window && this.currentSlide)
				tile.window.window.location.href = 'file://'+Path.join(this.slidePath(this.currentSlide), 'tiles_byhost', tileName+'.png');			
		},
	})
	.shareState()
;

log.spyMethods(SlideShow);

module.exports = SlideShow;
