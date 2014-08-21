// One cursor
//

// Shared modules
var OO = require('OO');
var log = require('Log').logger('Cursor');

// Cursor colors
var colors = ['yellow', 'green', 'red', 'blue', 'orange', 'purple', 'lightgrey', 'darkgrey'];

var Cursor = OO.newClass().name('Cursor')
	.classFields({
		nextId: 0,
	})
	.fields({
		id: null,		// Unique id for the cursor
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
			} else if (x > Cursor.wall.width) {
				border = true;
				x = Cursor.wall.width;
			}

			if (y < 0) {
				border = true;
				y = 0;
			} else if (y > Cursor.wall.height) {
				border = true;
				y = Cursor.wall.height;
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

module.exports = Cursor;
