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
var log = require('Log').logger('Tile');

// Internal modules
var App = require('./App');
var Layer = require('./Layer');

// The client-side `Tile` class.
var Tile = OO.newClass().name('Tile')
	.classFields({
		tiles: [],		// The list of tiles
	})
	.classMethods({
		// Call `f` for all tiles
		mapTiles: function(f) {
			Tile.tiles.forEach(function(tile) {
				f(tile);
			});
		},

		// Call `f` for all tiles that are active
		mapReadyTiles: function(f) {
			Tile.tiles.forEach(function(tile) {
				if (tile.ready && tile.window)
					f(tile);
			});
		},
	})
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
		// Tile name (used only to display it in tile.html)
		tileName: null,
		// port for debugger (used only to display it in tile.html)
		debugPort: null,
	})
	.constructor(function (state){
		log.enter(this, 'constructor');
		this.set(state);

		// Notify layers and apps that we exist.
		Layer.initTile(this, state);
		App.initTile(this, state);

		// Create the window representing the tile.
		this.createTile();

		// Setup a handler to notify new applications that we exist
		var self = this;
		App.onAppStarted(function(app) {
			app.initTile(self, state);
			if (self.ready) 
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
//				resizable: false,
				fullscreen: true,
			};
// need an option in config file to enable fullscreen
// also need to take into account the viewport, if any [for WILDER]

			// *** Hack for testing
			if (this.left !== 0 && this.top !== 0) {
				// Assume we're testing and add frame & toolbar so we can get to the developer tools
				tile.frame = true;
				tile.resizable = true;
				tile.fullscreen = false;
			}

			// Open the tile page
			var self = this;
			this.ready = false;
			this.window = null;

			nw.Window.open('content/tile.html', tile, function(win) {
				self.window = win;

				// Wait for the page to be loaded signaling that we are ready.
				win.once('loaded', function() {
					self.ready = true;
					log.event(self, 'loaded', self.oid);
					var id = win.window.document.getElementById('renderer');
					if (id)
						id.innerHTML = self.tileName + ' debugPort=' + self.debugPort;

					// Tell the layers and apps that the tile is ready.
					Layer.tileReady(self);
					App.tileReady(self);
				});
			});

			// Record in our list
			Tile.tiles.push(this);
		},

		// Reset the content of the tile to the default page
		reset: function() {
			if (this.window)
				this.window.window.location.href = 'tile.html';
		},

		// Called when the connection is shut down, to remove the window.
		die: function() {
			// Notify apps and layers
			App.tileGone(this);
			Layer.tileGone(this);

			// Clean up
			this.window.close();
			this.window = null;
			this.ready = false;

			// Remove from our list
			var index = Tile.tiles.indexOf(this);
			if (index >= 0)
				Tile.tiles.splice(index, 1);
		},

		// Remote calls from/to server to manage the log remotely
		getLog_after: function() {
			this.remoteLog(App.logWindow.window.getLog());
		},

		clearLog_after: function() {
			App.logWindow.window.clearLog();
		},

		remoteLog: function(html) {
			// remote call to the server
		},

		// *** Not sure if this is still used or how it worked...
		callJavascript_after: function(fun) {
			log.method(this, 'callJavascript_after ', fun);
			this.window.window[fun]();
		},

		// Called by server to deliver a click
		deliverClick_after: function(path) {
			if (this.window)
				this.window.window.deliverClick(path);
		},

		// Called by server to get the element at position x, y (in the Tile)
		elementAtPoint: function(x, y) {
			if (! this.window)
				return;

			return this.window.window.getElementAt(x, y) || undefined;
		}
	})
;

log.spyMethodsExcept(Tile, ['getLog_after', 'clearLog_after', 'remoteLog']);

module.exports = Tile;
