// Cursors app - show cursors 
//
//

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// Renderer modules
var App = require('../lib/App');

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
			set x(x) { this._set(x); if (this.app) this.app.updateCursor(this); },
			set y(y) { this._set(y); if (this.app) this.app.updateCursor(this); },
		});
	})
	.methods({
		// Add a div to the tile's page representing the cursor
		createCursor: function(tile) {
			if (!tile || !tile.ready || !tile.window)
				return;

			var doc = tile.window.window.document;
			var id = 'Cursor_'+this.id;

			// Remove the element if it already exists
			var el = doc.getElementById(id);
			if (el)
				doc.body.removeChild(el);

			// We use plain DOM manipulation instead of jQuery since we don't know it it's loaded and it's easy anyway
			// $('html').append('<div id="'+id+'" class="Cursor" style="position: fixed; z-index: 1000; min-width: 10px; min-height: 10px; background-color: '+this.color+'"></div>');
			el = doc.createElement('div');
				el.setAttribute('id', id);
				el.setAttribute('class', 'Cursor');
				el.setAttribute('style', 'position: fixed; z-index: 1000; min-width: 10px; min-height: 10px; background-color: '+this.color);
			var left = this.x - tile.originX -5;
			var top = this.y - tile.originY -5;
				el.style.left = left+'px';
				el.style.top =  top +'px';
			doc.body.appendChild(el);
		},

		// Remove the cursor's div
		removeCursor: function(tile) {
			if (!tile || !tile.ready || !tile.window)
				return;

			var doc = tile.window.window.document;
			var id = 'Cursor_'+this.id;
			// We use plain DOM manipulation instead of jQuery since we don't know it it's loaded and it's easy anyway
			// $('#'+id).remove();
			var el = doc.getElementById(id);
			if (el)
				doc.body.removeChild(el);
		},

		// Adjust the position of the cursor's div.
		// Recreate it if it does not exist.
		adjustPos: function(tile) {
			if (!tile || !tile.ready || !tile.window)
				return;

			var doc = tile.window.window.document;
			var id = 'Cursor_'+this.id;
			var left = this.x - tile.originX -5;
			var top = this.y - tile.originY -5;
			// We use plain DOM manipulation instead of jQuery since we don't know it it's loaded and it's easy anyway
			// $('#'+id).css('left', left + 'px').css('top', top + 'px');
			var el = doc.getElementById(id);
			if (el) {
				el.style.left = left+'px';
				el.style.top  = top+'px';
			} else
				this.createCursor(tile);
		},
	})
;

log.spyMethods(Cursor);


// The `Cursors` app class.
var Cursors = App.subclass().name('Cursors')
	.fields({
		cursors: [],
	})
	.constructor(function(config) {
		this._super(config);
	})
	.methods({
		// Make sure all cursors exist in the tile
		createCursors: function(tile) {
			var self = this;
			this.cursors.forEach(function(cursor) {
				// The objects may not have been resolved yet
				if (cursor && cursor.oid && ! cursor.id)
					cursor = self.classs().sharer.getObject(cursor.oid);
				if (cursor) {
					cursor.app = self;
					cursor.createCursor(tile);
				}
			});
		},

		// Called by the framework when the webpage representing the tile is ready
		tileReady: function(tile) {
			this.createCursors(tile);

			if (! tile.window) {
				log.warn.method(this, 'tileReady', '- tile.window is null!!');
				return;
			}
			// Set a permanent handler for subsequent loads.
			// Note that this works too when a page has an auto-refresh.
			var self = this;
			tile.window.on('loaded', function() {
				log.enter(self, 'loaded');
				self.createCursors(tile);
				log.exit(self, 'loaded');
			});

		},

		// Adjust the position of a cursor in all tiles
		updateCursor: function(cursor) {
			var self = this;
			this.mapTiles(function(tile) {
				cursor.adjustPos(tile);
			});
		},

		// Called by the notification system when a cursor is added/removed:
		// Add/remove the cursor from all tiles
		cursorCreated_after: function(cursor) {
			cursor.app = this;
			this.mapTiles(function(tile) {
				cursor.createCursor(tile);
			});
		},

		cursorRemoved_after: function(cursor) {
			this.mapTiles(function(tile) {
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
