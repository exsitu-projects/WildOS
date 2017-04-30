// SlideShow app - displays slides
//
// Slides are tiled images, typically created with maketiles.
// They are looked up in the slides directory. Each slide is a directory with two subdirectories:
// `thumbs` contains the thumbnail images, called `thumb<size>.png` where size is 100, 200, 500, 1000, 2000.
// `tiles_byhost` contains one image per screen, named `<hostname>_<screen>.png`, e.g. `a1_L.png`.

// Node modules
var events = require('events');
var fs = require('fs');
var Path = require('path');

// Shared modules
var OO = require('OO');
var log = require('Log').logger('SlideShow');

// Server modules
var App = require('../../lib/App');

// Root of the executable
var urlRoot = '/apps/SlideShow';
var appRoot = Path.join(__dirname, "../../..");	// go up server/apps/SlideShow
// Adjust root when the application is packaged:
// On Mac, look whether we're inside an app package 
if (process.platform == 'darwin' && __dirname.match(/\.app\//)) {
	appRoot = Path.join(appRoot, "../../..");	// go up Content/Resources/nw.app
}
// *** What to do on Linux???

// The `SlideShow` class.
// Its state is shared with the clients.
var SlideShow = App.subclass().name('SlideShow')
	.fields({
		slideRoot: 'slides',	// Path to root directory for slides on the server
		clientRoot: null,		// Path to root directory for slides on the client

		slideShow: null,		// Path relative to root of slideshow file
		slideShowTitle: null,	// Title of slide show
		slides: [],				// List of slides - each is a path relative to slideRoot
		currentSlideIndex: -1,	// Index of current slide
		currentSlide: null,		// path of current slide
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

			// Add a route to the slides directory
			platform.server.insertRoute(urlRoot, this.slidePath());

			// The path for `injectJSFile` is relative to the url of the document.
			// Since we don't control this, we use an absolute path, based on
			// `this.__dirname`, the absolute path from which the app was loaded.
			platform.GUI.injectJSFile('file://'+this.__dirname+'/ui.js', 'slideShowJS');

			// Make the app an emitter to signal state changes to the local UI.
			this.uievents = new events.EventEmitter();

			var gui = platform.GUI.getGUI();
			if (gui) {
				var url = '../apps/SlideShow/content/serverBrowser.html';	// URL is relative to the lib folder
				this.browserWindow = gui.Window.open(url, {
					width: 1200,
					height: 800,
					// toolbar: platform.program.showToolbar,
				});				
			}
		},

		// Called when the app is about to be unloaded.
		stop: function() {
			this._super();

			platform.server.removeRoute(urlRoot);

			var win = this.platform.GUI.getUIWindow();
			if (win)
				win.slideShowApp.stop();

			if (this.browserWindow)
				this.browserWindow.close();
		},

		// Return the absolute path to `file`:
		//	<file> if it is absolute
		//	<slideRoot>/<file> if file is relative and slideRoot is absolute
		//	<appRoot>/<slideRoot>/<file> if file and slideRoot are relative
		slidePath: function(file) {
			if (!file)
				file = '';
			if (file.match(/^\//))
				return file;
			var path = this.slideRoot;
			if (! path.match(/^\//))	// relative to WildOS executable
				return Path.join(appRoot, path, file);
			return Path.join(path, file);
		},

		// Return the URL for a slide
		urlLocation: function(slide) {
			return 'http://localhost:'+this.platform.server.port+urlRoot+'/'+slide;
		},

		// Return a list of slideshows in the slideRoot directory.
		// Each element is a pair with the file name and the slideshow title.
		getSlideShowList: function() {
			var slideShows = [];
			var dir = this.slidePath();
			fs.readdirSync(dir).forEach(function(fileName) {
				if (Path.extname(fileName) != '.json')
					return;
				try {
					var slideShow = fs.readFileSync(Path.join(dir, fileName), 'utf8');
					slideShow = JSON.parse(slideShow);
					if (! slideShow.slides)
						return;	// not a slideshow file
					slideShows.push({
						file: fileName,
						title: slideShow.title || fileName,
						length: slideShow.slides.length,
					});
				} catch(e) {
					// nothing
				}
			});
			return slideShows;
		},

		// Load a slideshow stored as an array of slide names exported by a js file.
		loadSlideShow: function(name) {
			this.slideShow = name;
			log.message("Loading slide show", name);
			var slideShow = null;
			try {
				slideShow = require(this.slidePath(name));
				this.slideShowTitle = slideShow.title;
				this.slides = slideShow.slides;
			} catch (e) {
				// this.slideShowTitle = null;
				// this.slides = null;
				return false;
			}

			this.slideShowChanged();
			//this.slideChanged();
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
		// The names must be relative to the `slideRoot` directory.
		// `name` is the name used to show the loaded file 
		// (defaults to a blank-separated list of names).
		loadSlideList: function(list, name, title) {
			this.slideShow = name || list.join(', ');
			this.slides = list;
			this.slideShowTitle = title;
			this.slideShowChanged();
			//this.slideChanged();

			this.currentSlideIndex = -1;
			this.firstSlide();
		},

		// Return an object describing the content of the file/directory at `path`
		// or an object describing the error.
		getSlides: function(path) {
			var fullPath = this.slidePath(path);

			// Check if it is a .json file, i.e. a slideshow file
			var slideshow;
			if (Path.extname(path) == '.json') {
				try {
					delete require.cache[require.resolve(fullPath)];	// unload in case already loaded
					slideshow = require(fullPath);
				} catch(e) {
					slideshow = null;
				}
				if (! slideshow || ! slideshow.slides) {
					log.warn.method(this, 'getFiles', 'not a slideshow file:', path);
					return {
						type: 'error',
						name: path+' is not a slideshow',
					};
				}
				log.method(this, 'getFiles', 'loading json file:', path);
				return {
					type: 'slideshow',
					name: path,
					title: slideshow.title || path,
					slides: slideshow.slides,
				};
			}

			// Check if we are in a legitimate path:
			// Compute the relative path from the root to the target path,
			// if it starts with `../`, we are outside the slideRoot and we return null.
			var root = this.slidePath();
			var relPath = Path.relative(root, fullPath);
			log.method(this, 'getFiles', 'computing relative path for', fullPath, ', root:', root, ', relPath =', relPath);
			if (path.match(/^\.\.\//)) {
				log.warn.method(this, 'getFiles', path, 'not under slideRoot');
				return {
					type: 'error',
					name: fullPath+' is not in the slides directory ('+this.slidePath()+')',
				};
			}

			// Check if file exists
			if (! fs.existsSync(fullPath)) {
				log.warn.method(this, 'getFiles', 'does not exist:', path);
				return {
					type: 'error',
					name: fullPath+' does not exist',
				};
			}

			// Check if it is a slide directory
			if (fs.existsSync(Path.join(fullPath, 'thumbs'))) {
				log.method(this, 'getFiles', 'loading single slide:', path);
				return {
					type: 'slide',
					name: relPath,
					slides: [relPath],
				};
			}

			// If it is a regular directory, we collect its content (NOT RECURSIVE yet)
			var stats = fs.statSync(fullPath);
			var slides = [];
			if (stats.isDirectory()) {
				log.method(this, 'getFiles', 'loading directory:', path);
				var names = fs.readdirSync(fullPath);
				for (var i = 0; i < names.length; i++) {
					name = Path.join(fullPath, names[i]);
					if (fs.existsSync(Path.join(name, 'thumbs')))
						slides.push(Path.join(relPath, names[i]));
				}
				return {
					type: 'slide',
					name: relPath,
					slides: slides,
				};
			}

			// Not a directory
			log.warn.method(this, 'getFiles', 'not a directory:', path);
			return {
				type: 'error',
				name: path+' is not a directory',
			};
		},
		
		// Load the slides from a list of file names. The list can contain slides and slideshows.
		loadFiles: function(files) {
			var slideShow = [];
			var names = [];
			var title = [];
			var errors = [];
			for (var i = 0; i < files.length; i++) {
				var slides = this.getSlides(files[i]);
				if (! slides)
					continue;
				if (slides.type == 'error') {
					errors.push(slides.name);
					continue;
				}
				slideShow.push.apply(slideShow, slides.slides);
				names.push(slides.name);
				if (slides.title)
					title.push(slides.title);
			}
			this.loadSlideList(slideShow, names.join(', '), title.join(', '));
			return errors.length ? errors : null;
		},

		// Navigate the list of slides.
		gotoSlide: function(i) {
			if (! this.slides)
				return;

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
	.shareState({
		fields: 'own', 
		methods: ['getSlideShowList', 'loadSlideShow', 'nextSlide', 'prevSlide', 'firstSlide', 'lastSlide', 'gotoSlide'],
	});

log.spyMethods(SlideShow);

module.exports = SlideShow;
