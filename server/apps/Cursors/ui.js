// Code injected in the platform control window
//
// Here we let create and move cursors.
//

var app = platform.apps.getApp('Cursors');

// The miniature wall position and scale factor
var wall = {
	originX: 0,
	originY: 0,
	width: 800,
	height: 600,
	zoom: 1.0
};

var selectedCursor = null;

function createCursor(cursor) {
	if (!cursor || !cursor.id)
		return;

	var id = 'Cursor_'+cursor.id;
	if ($('#'+id).length === 0)
		$('#wall').append('<div id="'+id+'" style="position: absolute; z-index: 1000; min-width: 6px; min-height: 6px; background-color: '+cursor.color+'" class="Cursor"></div>');

	var swatch = 'Swatch_'+cursor.id;
	if ($('#'+swatch).length === 0) {
		$('#cursors').append('<span id="'+swatch+'" style="margin: 5px; background-color: '+cursor.color+'">'+cursor.id+'</span>');

		// Move cursor by using the swatch as a joystick
		new Joystick({
			target: '#'+swatch,
			dragTarget: cursor,
			startedDragging: selectCursor,
			draggedBy: function(cursor, dx, dy) {
				cursor.moveBy(dx, dy);
			},
		}).start();

		// Move cursor by dragging it
		new Drag({
			target: '#'+id,
			dragTarget: cursor,
			startedDragging: selectCursor,
			draggedBy: function(cursor, dx, dy) {
				cursor.moveBy(dx/wall.zoom, dy/wall.zoom);
			},
		}).start();
	}

	updateCursor(cursor);
}

function updateCursor(cursor) {
	if (!cursor || !cursor.id)
		return;

	var id = '#Cursor_'+cursor.id;
	$(id).css('left', ((cursor.x * wall.zoom) - 3) + 'px').css('top', ((cursor.y * wall.zoom) - 3) + 'px');
}

function removeCursor(cursor) {
	if (cursor && cursor.id) {
		$('#Cursor_'+cursor.id).remove();
		$('#Swatch_'+cursor.id).remove();
	}
}

function selectCursor(cursor) {
	if (selectedCursor) {
		$('#Swatch_'+selectedCursor.id).css('border', '');
	}
	selectedCursor = cursor;
	if (selectedCursor) {
		$('#Swatch_'+selectedCursor.id).css('border', 'solid black 1px');
	}
}

// Called at the end of the script.
// Creates a UI to control the cursors.
function startCursors() {
	// Get the wall position / zoom factor
	var config = platform.config.UI;
	if (config)
		wall.zoom = config.wallZoom || 1.0;
	var wallOffset = $('#wall').offset();
	wall.originX = wallOffset.left;
	wall.originY = wallOffset.top;
	var surface = platform.findDevice({type: 'Surface'});
	if (surface) {
		wall.width = surface.width;
		wall.height = surface.height;
	}

	// Create a div that will hold the app's UI, so we can easily remove it
	$('#top').append('<div id="cursorsApp">Cursors control: </div>');

	// Add buttons to navigate
	$('#cursorsApp').append('<input id="newCursor" type="button" value="New cursor"/>')
					.append('<span id="cursors"></span>')
					.append('<input id="removeCursor" type="button" value="Remove selected"/>');
	$('#newCursor').click(function() { app.addCursor(); });
	$('#removeCursor').click(function() { if (selectedCursor) app.removeCursor(selectedCursor.id); });

	// Synchronize state
	for (var i = 0; i < app.cursors.length; i++) {
		var cursor = app.cursors[i];
		createCursor(cursor);
	}

	// Update when state changes
	app.onCreate(createCursor);
	app.onUpdate(updateCursor);
	app.onRemove(removeCursor);
}

function stopCursors() {
	// Remove the elements that we added
	$('#cursorsApp').remove();
	$('.Cursor').remove();
	$('#cursorsJS').remove();
}

// A `Joystick` interactor.
function Joystick(options) {
	this.dragging = 0;
	this.screenX = this.screenY = 0;
	this.deltaX = this.deltaY = 0;
	this.delay = 100;
	this.timer = null;

	this.target = options.target || 'html';
	this.dragTarget = options.dragTarget || this.target;
	this.startedDragging = options.startedDragging || function() {};
	this.stoppedDragging = options.stoppedDragging || function() {};
	this.draggedBy = options.draggedBy || function() {};
	this.dragChanged = options.dragChanged || function() {};
}

// The `start` method sets the handlers to implement the panzoom interaction.
Joystick.prototype.start = function() {
	var self = this;
	$(self.target)
		.mousedown(self.mousedown = function(event) {
			self.dragging = true;
			self.screenX = event.screenX;
			self.screenY = event.screenY;
			self.deltaX = self.deltaY = 0;
			self.startedDragging(self.dragTarget);
			if (self.delay)
				self.timer = window.setInterval(function() {
					if (self.deltaX && self.deltaY && self.dragging)
						self.draggedBy(self.dragTarget, self.deltaX, self.deltaY);
				}, self.delay);
		});

	$('html')
		.mousemove(self.mousemove = function(event) {
			if (self.dragging) {
				self.deltaX = event.screenX - self.screenX;
				self.deltaY = event.screenY - self.screenY;
				self.dragChanged(self.dragTarget, self.deltaX, self.deltaY);
			}
		})
		.mouseup(self.mouseup = function(event) {
			self.dragging = false;
			if (self.timer) {
				window.clearInterval(self.timer);
				self.timer = null;
			}
			self.stoppedDragging(self.dragTarget);
		})
	;

	return this;
};

// The `stop` method removes the listeners.
Joystick.prototype.stop = function() {
	$(this.target).off('mousedown', this.mousedown);
	$('html').off('mousemove', this.mousemove).off('mouseup', this.mouseup);
	delete this.mousedown;
	delete this.mousemove;
	delete this.mouseup;
	if (this.timer) {
		window.clearInterval(this.timer);
		this.timer = null;
	}
};

// A `Drag` interactor.
function Drag(options) {
	this.dragging = 0;
	this.screenX = this.screenY = 0;
	this.deltaX = this.deltaY = 0;

	this.target = options.target || 'html';
	this.dragTarget = options.dragTarget || this.target;
	this.startedDragging = options.startedDragging || function() {};
	this.stoppedDragging = options.stoppedDragging || function() {};
	this.draggedBy = options.draggedBy || function() {};
}

// The `start` method sets the handlers to implement the panzoom interaction.
Drag.prototype.start = function() {
	var self = this;
	$(self.target)
		.mousedown(self.mousedown = function(event) {
			self.dragging = true;
			self.screenX = event.screenX;
			self.screenY = event.screenY;
			self.deltaX = self.deltaY = 0;
			self.startedDragging(self.dragTarget);
		});

	$('html')
		.mousemove(self.mousemove = function(event) {
			if (self.dragging) {
				self.deltaX = event.screenX - self.screenX;
				self.deltaY = event.screenY - self.screenY;
				self.draggedBy(self.dragTarget, self.deltaX, self.deltaY);
				self.screenX = event.screenX;
				self.screenY = event.screenY;
			}
		})
		.mouseup(self.mouseup = function(event) {
			self.dragging = false;
			self.stoppedDragging(self.dragTarget);
		})
	;

	return this;
};

// The `stop` method removes the listeners.
Drag.prototype.stop = function() {
	$(this.target).off('mousedown', this.mousedown);
	$('html').off('mousemove', this.mousemove).off('mouseup', this.mouseup);
	delete this.mousedown;
	delete this.mousemove;
	delete this.mouseup;
};

// Go!
startCursors();
