// Cursors app - manage multiple cursors on the wall
//
//

// Node mocules
var events = require('events');

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// Server modules
var App = require('../../lib/App');

// Device modules
var Surface = require('../../devices/Surface');

var wall = {
	width: 800,
	height: 600,
};

var colors = ['yellow', 'green', 'red', 'blue', 'orange', 'purple', 'lightgrey', 'darkgrey'];

var Cursor = OO.newClass().name('Cursor')
	.classFields({
		nextId: 0,
	})
	.fields({
		id: null,
		x: 100,
		y: 100,
		color: 'yellow',
	})
	.constructor(function(config) {
		this.color = colors[Cursor.nextId % colors.length];
		if (config)
			this.set(config);

		if (!this.id)
			this.id = '_C'+(Cursor.nextId++);
	})
	.methods({
		setPos: function(x, y) {
			var border = false;
			if (x < 0) {
				border = true;
				x = 0;
			} else if (x > Cursors.wall.width) {
				border = true;
				x = Cursors.wall.width;
			}

			if (y < 0) {
				border = true;
				y = 0;
			} else if (y > Cursors.wall.height) {
				border = true;
				y = Cursors.wall.height;
			}

			if (border && x === this.x && y === this.y)
				return;

			if (x !== this.x)
				this.x = x;
			if (x !== this.y)
				this.y = y;

			if (this.app)
				this.app.cursorUpdated(this);
		},

		moveBy: function(dx, dy) {
			this.setPos(this.x + dx, this.y + dy);
		},

		moveTo: function(x, y) {
			this.setPos(x, y);
		},
	})
;

log.spyMethods(Cursor);

// The `Cursors` class.
var Cursors = App.subclass().name('Cursors')
	.fields({
		cursors: [],
	})
	.constructor(function(config) {
		// *** It looks like we must define a constructor for the ObjectSharer constructor mixin to work
		log.method(this, 'constructor');
		this._super(config);
	})
	.methods({
		// Called when the app is started
		initPlatform: function(platform) {
			log.warn.message('Cursors::initPlatform');
			this.platform = platform;
			// The path for `injectUIScript` is relative to the url of the document.
			// Since we don't control this, we use an absolute path, based on
			// `this.__dirname`, the absolute path from which the app was loaded.
			platform.injectJSFile('file://'+this.__dirname+'/ui.js', 'cursorsJS');

			Cursors.wall = platform.findDevice({type: 'Surface'});

			// Make the app an emitter to signal state changes to the local UI.
			this.uievents = new events.EventEmitter();

			// *** test ***
			// Link the first cursor to the 'pointer' WISDevice, if any.
			var self = this;
			platform.onDeviceAvailable(function(device) {
				if (device.className() === "WISDevice" && device.name === "pointer") {
					device.onWISDeviceChanged(function(dev) {
						if (self.cursors.length === 0)
							return;
						if (dev.x || dev.y)
							self.cursors[0].moveTo(dev.x, dev.y);
						else
							self.cursors[0].moveBy(dev.dx, dev.dy);
					});
				}
			});
		},

		// Called when the app is about to be unloaded.
		stop: function() {
			this._super();

			if (this.platform.window)
				this.platform.window.window.stopCursors();
		},

		// Find a cursor by name.
		findCursor: function(id) {
			for (var i = this.cursors.length - 1; i >= 0; i--) {
				var cursor = this.cursors[i];
				if (cursor.id === id)
					return cursor;
			}
			return null;
		},

		// Create a new cursor.
		// If a cursor by the same name exists, it is reused
		addCursor: function(config) {
			var cursor = null;
			if (config && config.id) {
				cursor = this.findCursor(config.id);
				if (cursor) {
					cursor.set(config);
					return cursor;
				}
			}
			cursor = Cursor.create(config);
			this.cursors.push(cursor);
			cursor.app = this;

			this.cursorCreated(cursor);
			return cursor;
		},

		// Remove a cursor by name.
		removeCursor: function(id) {
			for (var i = 0; i < this.cursors.length; i++) {
				var cursor = this.cursors[i];
				if (cursor.id === id) {
					this.cursors.splice(i, 1);
					this.cursorRemoved(cursor);
					cursor.die();
					return true;
				}
			}
			return false;
		},

/* only for local UI */
		// Emit an event.
		emit: function(event, cursor) {
			if (this.uievents)
				this.uievents.emit(event, cursor);
			return this;
		},

		// Emit the predefined events.
		cursorCreated: function(cursor) { 
			this.emit('cursorCreated', cursor);
		},
		cursorUpdated: function(cursor) { 
			this.emit('cursorUpdated', cursor);
		},
		cursorRemoved: function(cursor) { 
			this.emit('cursorRemoved', cursor);
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
		onCreate: function(cb) { return this.on('cursorCreated', cb); },
		onUpdate: function(cb) { return this.on('cursorUpdated', cb); },
		onRemove: function(cb) { return this.on('cursorRemoved', cb); },

	})
	.shareState(/*fields: */ 'own', /*allow remote calls: */ ['addCursor', 'removeCursor'], /* notify: */ ['cursorCreated', 'cursorRemoved'])
;

log.spyMethods(Cursors);

// Add the `Cursor` class to the Cursors sharer
Cursors.sharer.master(Cursor, 'own', ['moveBy', 'moveTo']);

module.exports = Cursors;
