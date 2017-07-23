// One cursor
//

// Shared modules
var OO = require('OO');
var log = require('Log').logger('Cursor');

// Cursor colors
var colors = ['yellow', 'green', 'red', 'blue', 'orange', 'purple', 'lightgrey', 'darkgrey'];
var zoomLevels = [1, 2, 4, 6];

var Cursor = OO.newClass().name('Cursor')
	.classFields({
		nextId: 0,
	})
	.fields({
		id: null,		// Unique id for the cursor
		x: 100,
		y: 100,
		color: 'yellow',
		zoomLevel: 1
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

	  zoomIn: function(){
	    let idx = zoomLevels.indexOf(this.zoomLevel);
	    if(idx == -1){
	      console.info("zoom index out of range")
	      idx = 0;
	    }
	    if(idx < zoomLevels.length - 1){
	      this.zoomLevel = zoomLevels[idx+1];
	      if (this.app)
		this.app.cursorUpdated(this);
	    }
	  },

	  zoomOut: function(){
	    let idx = zoomLevels.indexOf(this.zoomLevel);
	    if(idx == -1){
	      console.info("zoom index out of range")
	      idx = 0;
	    }
	    if(idx > 0){
	      this.zoomLevel = zoomLevels[idx-1];
	      if (this.app)
		this.app.cursorUpdated(this);
	    }
	  },
	
		// Send a click at the position of the cursor
		click: function() {
			Cursor.wall.click(this.x, this.y);	// tell the surface to click
		},

	        // Send a dblclick at the position of the cursor
		dblclick: function() {
			Cursor.wall.dblclick(this.x, this.y);	// tell the surface to dblclick
		},
	})
;

log.spyMethods(Cursor);

module.exports = Cursor;
