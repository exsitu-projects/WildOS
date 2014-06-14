// Tile - a virtual screen in a tiled display
//
// A `Tile` object represents a tile in a tiled display.
// In most cases, the tile corresponds to a physical display, but this is not required.
// For example, an application may want to have two tiles per display.
// 
// Tiles mirror the server-side Client objects and are synchronized with them.
//

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// Internal modules
var App = require('./App');

// The client-side `Tile` class.
var Tile = OO.newClass().name('Tile')
	.fields({
		// Coordinate of the frame, relative to the display surface.
		left: 0,
		top: 0,
		width: 800,
		height: 600,
		// Coordinates of top-left corner, relative to the enclosing surface.
		originX: 0,
		originY: 0,
		// Rank of tile when the host manages multiple tiles
		rank: null,
	})
	.constructor(function (state){
		log.enter(this, 'constructor');
		this.set(state);

		// Notify the applications that we exist.
		App.initTile(this, state);

		// Create the window representing the tile.
		this.createTile();

		// Setup a handler to notify new applications that we exist
		var self = this;
		App.onAppStarted(function(app) {
			app.initTile(self, state);
			app.tileReady(self);
		});

		log.exit(this, 'constructor');
	})
	.methods({
		// Create the window representing the tile. 
		createTile: function () {
			log.method(this, 'createTile', 'at', this.left, this.top);
			var tile = {
				x: this.left,
				y: this.top,
				width: this.width,
				height: this.height,
				frame: false,
				toolbar: false,
				resizable: false,
			};

			// *** Hack for testing
			if (this.left !== 0 && this.top !== 0) {
				// Assume we're testing and add frame & toolbar so we can get to the developer tools
				tile.frame = true;
				tile.toolbar = true;
			}

			// *** Should apps be allowed to change the URL? Probably...
			var gui = process.mainModule.exports.gui;
			var win = gui.Window.open('tile.html', tile);

			this.window = win;
			this.ready = false;

			// Wait for the page to be loaded signaling that we are ready.
			var self = this;
			win.once('loaded', function() {
				self.ready = true;
				log.event(self, 'loaded', self.oid);

				// Tell the apps that the tile is ready.
				App.tileReady(self);
			});
		},

		// Reset the content of the tile to the default page
		reset: function() {
			if (this.window)
				this.window.window.location.href = 'app://localhost/content/tile.html';
		},

		// Called when the connection is shut down, to remove the window.
		die: function() {
			App.tileGone(this);
			this.window.close();
			this.window = null;
			this.ready = false;
		},

		// *** Not sure if this is still used or how it worked...
		callJavascript_after: function(fun) {
			log.method(this, 'callJavascript_after ', fun);
			this.window.window[fun]();
		},
	})
;

log.spyMethods(Tile);

module.exports = Tile;
