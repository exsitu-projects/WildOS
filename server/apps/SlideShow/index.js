// SlideShow app - displays slides
//
// Slides are tiled images, typically created with maketiles.
// They are looked up in the slides directory. Each slide is a directory with two subdirectories:
// `thumbs` contains the thumbnail images, called `thumb<size>.png` where size is 100, 200, 500, 1000, 2000.
// `tiles_byhost` contains one image per screen, named `<hostname>_<screen>.png`, e.g. `a1_L.png`.

// Node modules
var events = require('events');
var fs = require('fs');

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// Server modules
var App = require('../../lib/App');

// log.message('- current module file', module.filename);

// relative path to slides directory
var slideDir = './content/slides/';		// relative from this file
var appSlideDir = 'apps/SlideShow/content/slides/'; 		// relative from nw app

// The `SlideShow` class.
// Its state is shared with the clients.
var SlideShow = App.subclass().name('SlideShow')
	.fields({
		slideShow: null,
		slides: [],
		currentSlideIndex: -1,
		currentSlide: null,
	})
	.constructor(function(config) {
		// *** It looks like we must define a constructor for the ObjectSharer constructor mixin to work
		log.method(this, 'constructor');
		this._super(config);
	})
	.methods({
		// Called when the app is loaded on the platform.
		initPlatform: function(platform) {
			log.method(this, 'initPlatform');
			this.platform = platform;
			// The path for `injectJSFile` is relative to the url of the document.
			// Since we don't control this, we use an absolute path, based on
			// `this.__dirname`, the absolute path from which the app was loaded.
			platform.injectJSFile('file://'+this.__dirname+'/ui.js', 'slideShowJS');

			// Make the app an emitter to signal state changes to the local UI.
			this.uievents = new events.EventEmitter();
		},

		// Called when the app is about to be unloaded.
		stop: function() {
			this._super();

			if (this.platform.window)
				this.platform.window.window.stopSlideShow();
		},

		// Load a slideshow stored as an array of slide names exported by a js file.
		loadSlideShow: function(name) {
			this.slideShow = name;
			log.message("Loading slide show", name);
			try {
				this.slides = require(name).slides;
			} catch (e) {
				this.slides = null;
				return false;
			}

			this.slideChanged();
			this.currentSlideIndex = -1;
			this.firstSlide();
			return true;
		},

		// Load a slide from a directory name.
		// The name must be relative to the `slides` directory.
		// The directory is supposed to include a file `thumb.png`
		// and a subdirectory `tiles` containing one image per tile, 
		// named after the tile instance name (e.g., `a1L.png`).
		loadSlide: function(name) {
			if (this.currentSlide == name)
				return;

			this.currentSlide = name;
			this.slideChanged();
		},

		// Load a slideshow defined by a list of slide names.
		// The names must be relative to the `slides` directory.
		// `name` is the name used to show the loaded file 
		// (defaults to a blank-separated list of names).
		loadSlideList: function(list, name) {
			this.slideShow = name || list.join(' ');
			this.slides = list;
			this.slideChanged();

			this.currentSlideIndex = -1;
			this.firstSlide();
		},

		// Return an object describing the content of the file/directory at `path`
		// or `null` if the path is invalid.
		getSlides: function(path) {
			// Check if it is a .json file, i.e. a slideshow file
			m = path.match(/\.json$/);
			if (m) {
				try {
					slides = require(path).slides;
				} catch(e) {
					slides = null;
				}
				if (! slides)
					return null;
				return {
					type: 'slideshow',
					name: path,
					slides: slides,
				};
			}

			// Check if we are in a legitimate path
			// *** This is a bit of a hack, really 
			var m = path.match(/\/SlideShows\/(.*)(\.[^.]*)$/)	// file with extension
				 || path.match(/\/SlideShows\/(.*$)/)			// file without extension
				 || path.match(/\/SlideShow$/)				 	// root dir
				 || path.match(/\/slides\/(.*$)/)	// file without extension
				 || path.match(/\/slides$/)		 	// root dir
			if (! m)
				return null;

			// Check if file exists
			var dir = m[1] || '';
			if (! fs.existsSync(appSlideDir+dir))
				return null;

			// Check if it is a slide directory
			if (fs.existsSync(appSlideDir+dir+'/thumbs'))
				return {
					type: 'slide',
					name: path,
					slides: [dir],
				};

			// If it is a regular directory, we collect its content (NOT RECURSIVE yet)
			var stats = fs.statSync(appSlideDir+dir);
			var slides = [];
			if (stats.isDirectory()) {
				var names = fs.readdirSync(appSlideDir+dir);
				for (var i = 0; i < names.length; i++) {
					name = appSlideDir+dir+'/'+names[i];
					if (fs.existsSync(name+'/thumbs'))
						slides.push(dir+'/'+names[i]);
				}
				return {
					type: 'slide',
					name: path,
					slides: slides,
				};
			}
			return null;

		},
		
		// Load the slides from a list of file names. The list can contain slides and slideshows.
		loadFiles: function(files) {
			var slideShow = [];
			var names = [];
			for (var i = 0; i < files.length; i++) {
				var slides = this.getSlides(files[i]);
				if (! slides)
					continue;
				slideShow.push.apply(slideShow, slides.slides);
				names.push(slides.name);
			}
			this.loadSlideList(slideShow, names.join(' '));
		},

		// Navigate the list of slides.
		gotoSlide: function(i) {
			if (i < 0)
				i = 0;
			else if (i >= this.slides.length)
				i = this.slides.length -1;
			if (i == this.currentSlideIndex)
				return;

			this.currentSlideIndex = i;
			this.loadSlide(this.slides[i]);
		},

		nextSlide: function() {
			return this.gotoSlide(this.currentSlideIndex +1);
		},
		prevSlide: function() {
			return this.gotoSlide(this.currentSlideIndex -1);
		},
		firstSlide: function() {
			return this.gotoSlide(0);
		},
		lastSlide: function() {
			return this.gotoSlide(this.slides.length+1);
		},

/* only for local UI */
		// Emit an event.
		emit: function(event) {
			if (this.uievents)
				this.uievents.emit(event, this);
			return this;
		},

		// Emit the predefined events.
		slideChanged: function() { 
			this.emit('slideChanged');
		},
		slideShowChanged: function() { 
			this.emit('slideShowChanged');
		},

		// Set event handlers
		on: function(event, cb) {
			var self = this;
			if (this.uievents)
				this.uievents.on(event, function(app) {
					log.eventEnter(self, event, 'for app', self.className());
					cb(app);
					log.eventExit(self, event);
				});
			return this;
		},

		// Set event handlers for the predefined events.
		onSlideChanged: function(cb) { return this.on('slideChanged', cb); },
		onSlideShowChanged: function(cb) { return this.on('slideShowChanged', cb); },

	})
	.shareState('own', ['nextSlide', 'prevSlide', 'firstSlide', 'lastSlide'])
;

log.spyMethods(SlideShow);

module.exports = SlideShow;
