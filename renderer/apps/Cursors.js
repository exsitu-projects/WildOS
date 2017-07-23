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

// Hotspot offset for our cursor
//	scaled to display size: 28 = viewbox size, 40 = parent div size
var hotSpot = {
	x: Math.round(9.2 * 40 / 28),
	y: Math.round(7.3 * 40 / 28)
}

// The Cursor class: a single cursor.
var Cursor = OO.newClass().name('Cursor')
	.fields({
		id: null,
		x: 100,
		y: 100,
		color: 'yellow',
		zoomLevel: 1
	})
	.constructor(function(config) {
		if (config)
			this.set(config);

		this.wrapFields({
			set x(x) { this._set(x); this.updateCursor(); },
			set y(y) { this._set(y); this.updateCursor(); },
			set zoomLevel(zoomLevel) { this._set(zoomLevel); this.updateCursor(); }
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

			var left = this.x - tile.originX - hotSpot.x;
			var top = this.y - tile.originY - hotSpot.y;
			var cursor = HTML.element(win, 'div class="Cursor"', {
					id: id,
					style: {
						position: 'fixed',
						zIndex: '1000',
						minWidth: '40px',
						minHeight: '40px',
						backgroundColor: 'transparent',
						left: left+'px',
						top: top +'px',
						transform: 'scale(' + this.zoomLevel + ')',
					  	transformOrigin: '' + hotSpot.x + 'px ' + hotSpot.y + 'px'
					}
				});

			if (this.app && this.app.layer) {
				// SVG cursor
				HTML.add(win, '<svg x="0px" y="0px" viewBox="0 0 28 28">'+
					'<polygon fill="#FFFFFF" points="8.2,20.9 8.2,4.9 19.8,16.5 13,16.5 12.6,16.6 "/>'+
					'<polygon fill="#FFFFFF" points="17.3,21.6 13.7,23.1 9,12 12.7,10.5 "/>'+
					'<rect fill="'+this.color+'" x="12.5" y="13.6" transform="matrix(0.9221 -0.3871 0.3871 0.9221 -5.7605 6.5909)" width="2" height="8"/>'+
					'<polygon fill="'+this.color+'" points="9.2,7.3 9.2,18.5 12.2,15.6 12.6,15.5 17.4,15.5 "/>'+
					'</svg>', 'content', cursor);
				HTML.add(win, cursor, 'end', this.app.layer.id);
			}
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
				var left = this.x - tile.originX - hotSpot.x;
				var top = this.y - tile.originY - hotSpot.y;
				HTML.setStyle(win, cursor, {
					left: left+'px',
					top: top+'px',
				  	transform: 'scale(' + this.zoomLevel + ')'
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
Cursors.sharer.slave(Cursor, {fields: 'own'});

module.exports = Cursors;
