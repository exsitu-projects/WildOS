// Cursors app - show cursors 
//
//

// Shared modules
var OO = require('OO');
var log = require('Log').logger('Cursors');
var HTML = require('HTML');

// Renderer modules
var App = require('../lib/App');
var Layer = require('../lib/Layer');

// Use different logger for Cursor class
var cursorLog = require('Log').logger('Cursor');

// The Cursor class: a single cursor.
var Cursor = OO.newClass().name('Cursor')
	.fields({
		id: null,
		x: 100,
		y: 100,
		color: 'yellow',
	})
	.constructor(function(config) {
		if (config)
			this.set(config);

		this.wrapFields({
			set x(x) { this._set(x); this.updateCursor(); },
			set y(y) { this._set(y); this.updateCursor(); },
		});
	})
	.methods({
		// Add a div to the tile's page representing the cursor
		createCursor: function(tile) {
			if (!tile || !tile.ready || !tile.window) {	// should not happen
				log.warn.method('createCursor', 'called with tile not ready');
				return;
			}

			var win = tile.window.window;
			var id = 'Cursor_'+this.id;

			// Remove the element if it already exists
			HTML.remove(win, id);

			var left = this.x - tile.originX -5;
			var top = this.y - tile.originY -5;
			var cursor = HTML.element(win, 'div class="Cursor"', {
					id: id,
					style: {
						position: 'fixed',
						zIndex: '1000',
						minWidth: '10px',
						minHeight: '10px',
						backgroundColor: this.color,
						left: left+'px',
						top: top +'px',
					}
				});

			if (this.app && this.app.layer)
				HTML.add(win, cursor, 'end', this.app.layer.id);
			else
				log.warn.method(this, 'createCursor', 'app or layer not available');
		},

		// Remove the cursor's div
		removeCursor: function(tile) {
			if (!tile || !tile.ready || !tile.window) {	// should not happen
				log.warn.method('removeCursor', 'called with tile not ready');
				return;
			}

			HTML.remove(tile.window.window, 'Cursor_'+this.id);
		},

		// Adjust the position of the cursor's div.
		// Recreate it if it does not exist.
		adjustPos: function(tile) {
			if (!tile || !tile.ready || !tile.window) {	// should not happen
				log.warn.method('adjustPos', 'called with tile not ready');
				return;
			}

			var win = tile.window.window;
			var cursor = HTML.findElement(win, 'Cursor_'+this.id);
			if (cursor) {
				var left = this.x - tile.originX -5;
				var top = this.y - tile.originY -5;
				HTML.setStyle(win, cursor, {
					left: left+'px',
					top: top+'px',
				});
			} else
				this.createCursor(tile);
		},

		updateCursor: function() {
			if (this.app) {
				var self = this;
				this.app.mapReadyTiles(function(tile) {
					self.adjustPos(tile);
				});
			}
		},
	})
;

cursorLog.spyMethods(Cursor);


// The `Cursors` app class.
var Cursors = App.subclass().name('Cursors')
	.fields({
		cursors: [],
	})
	.constructor(function(config) {
		this._super(config);

		this.layer = Layer.create({
			overlay: true,
			mode: 'grid',
		});

		this.wrapFields({
			set cursors(list)   { this._set(list); this.createCursors(); },
		});

		this.createCursors();

	})
	.methods({
		// Make sure all cursors exist in the tile
		createCursorsForTile: function(tile) {
			var self = this;

			// Local function to create the cursor when it is ready
			function resolve(cursor, idx) {
				if (idx >= 0) log.method(self, 'createCursorsForTile', 'resolving pending object', cursor.oid);
				if (idx >= 0)
					self.cursors[idx] = cursor;
				cursor.app = self;
				cursor.createCursor(tile);
			}

			this.cursors.forEach(function(cursor, idx) {
				// Some cursors may not have been received yet:
				if (cursor.isPendingObject) {
					log.method(self, 'createCursorsForTile', 'pending object', cursor.oid);
					cursor.onResolved(function(obj) {
						resolve(obj, idx);
					});
				} else 
					resolve(cursor, -1);
			});
		},

		createCursors: function() {
			var self = this;
			this.mapReadyTiles(function(tile) {
				self.createCursorsForTile(tile);
			});			
		},

		// This is called after the layer is created for the corresponding tile
		tileReady: function(tile) {
			this.createCursorsForTile(tile);
		},
		
		// Called when the layer is removed
		stop: function() {
			this.layer.close();
			this.layer = null;
			this._super();
		},

		// Called by the notification system when a cursor is added/removed:
		// Add/remove the cursor from all tiles
		cursorCreated_after: function(cursor) {
			cursor.app = this;

			// The content of the cursors array is not shared, so we have to update it
			if (this.cursors.indexOf(cursor) < 0)
				this.cursors.push(cursor);

			this.mapReadyTiles(function(tile) {
				cursor.createCursor(tile);
			});
		},

		cursorRemoved_after: function(cursor) {
			var idx = this.cursors.indexOf(cursor);
			if (idx >= 0)
				this.cursors.splice(idx, 1);

			this.mapReadyTiles(function(tile) {
				cursor.removeCursor(tile);
			});
		},

	})
	.shareState()
;

log.spyMethods(Cursors);

// Add the `Cursor` class to the Cursors sharer
Cursors.sharer.slave(Cursor, 'own');

module.exports = Cursors;
