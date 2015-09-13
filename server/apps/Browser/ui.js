// Code injected in the platform control window for the Browser app.
//
// The user can load pages and control the position and zoom factor 
// of the page being displayed on the wall by interacting with the
// representation of the tiled display.
//

// Wrap in a function to protect global space
var browserApp = (function () {

var panZoomResizeBrowser = null;

var app = platform.apps.getApp('Browser');

// The miniature wall position and scale factor
var wall = {
	originX: 0,
	originY: 0,
	zoom: 1.0,
	width: 800,
	height: 600
};

// Set the url
function adjustURL() {
	var url = app.url;
	$('#browserUrl').val(url);
	$('#browserPage').attr('src', url);
}

// Adjust the frame showing the page.
function adjustPanZoom() {
	var zoom = wall.zoom*app.coords.zoom; // accounts for wallZoom in wild.html
	var percentZoom = Math.round(zoom*100,2)+'%';
	$('#browserPage')
		.css('left', Math.round(app.coords.x/app.coords.zoom)+"px")
		.css('top',  Math.round(app.coords.y/app.coords.zoom)+"px")
		.css('zoom', percentZoom)
		.contents().find('body').css('zoom', percentZoom);
}

function adjustSize() {
	$('#browserPage')
		.width(app.width) // * wall.zoom)
		.height(app.height); // * wall.zoom);
}

// Called at the end of the script.
// Creates a UI to enter the URL and to 
// Creates a `PanZoomResize` object active over elements of class `tile`.
function startBrowser() {
	// Create a div that will hold the app's UI, so we can easily remove it
	$('#top').append('<div id="browserApp">Browser: </div>');

	// Add a text field to load a different URL
	$('#browserApp').append('<input id="browserUrl" type="text" size="80"/><input id="setBrowserUrl" type="button" value="Set URL"/>');

	$('#browserApp').append('<br/><input id="revealPrev" type="button" value="Prev"/>');
	$('#browserApp').append('<input id="revealNext" type="button" value="Next"/>');
	$('#revealPrev').click(function() { app.remoteExec('Reveal', 'left'); });
	$('#revealNext').click(function() { app.remoteExec('Reveal', 'right'); });

	$('#browserApp').append('<br/><span style="color:grey">Drag web page to move, shift-drag to resize, scrollwheel to zoom.</span>');
	$('#browserUrl').keypress(function(e) { if (e.which == 13) $('#setBrowserUrl').click(); });
	$('#setBrowserUrl').click(function() { app.setURL($('#browserUrl').val()); });

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

	// Add an iframe to show the page.
	var size = 'width: ' +wall.width+'px; '
			 + 'height: '+wall.height+'px; ';

	size = 'left: '  + app.coords.x + 'px; '
		 + 'top: '   + app.coords.y + 'px; '
		 + 'width: ' + app.width   + 'px; '
		 + 'height: '+ app.height  + 'px; ';

	$('#wall').append('<iframe id="browserPage" style="background-color: #edc; z-index: 1; position: absolute; overflow: hidden; '+size+'" scrolling="no"/>');
	$('#browserPage').load(function() {
		adjustPanZoom();
		adjustSize();
	});

	adjustURL();

	// Pan and zoom background when dragging / scrollwheeling in any of the tiles
	panZoomResizeBrowser = new PanZoomResize({
		target: '.tile',
		panTarget: null,
		zoomTarget: null,
		resizeTarget: null,
		pannedBy: function(pz, dX, dY) {
			app.panBy(dX / wall.zoom, dY / wall.zoom);
		},
		zoomedBy: function(pz, dZ, X, Y) {
			app.zoomBy(dZ, (X - wall.originX) / wall.zoom, (Y - wall.originY) / wall.zoom);
		},
		resizedBy: function(pz, dW ,dH) {
			app.resizeBy(dW / wall.zoom, dH / wall.zoom);
		}
	}).start();

	// Update UI when application state changes
	app.wrapFields({
		set url(url) { this._set(url); adjustURL(); },
		set coords(val)		{ 
			// We need to track the changes of the object ourselves
			if (this[val] && typeof this[val] === 'object')
				Object.unobserve(this[val], adjustPanZoom);
			this._set(val); 
			if (val && typeof val === 'object')
				Object.observe(val, adjustPanZoom);
			adjustPanZoom(); 
		},
		set width(val)   { this._set(val); adjustSize(); },
		set height(val)  { this._set(val); adjustSize(); },
	});

	if (app.coords)
		Object.observe(app.coords, adjustPanZoom);
}

function stopBrowser() {
	// Remove panzoom on wall
	panZoomResizeBrowser.stop();

	// Remove the elements that we added
	$('#browserApp').remove();
	$('#browserPage').remove();
	$('#browserJS').remove();
	$('#mousewheelJS').remove();
}

// A `panZoom` object controls panning and zooming by 
// dragging on an element and using the scrollwheel.
function PanZoomResize(options) {
	this.state = 'off';
	this.screenX = this.screenY = 0;
	this.offsetX = this.offsetY = 0;
	this.zoom = options.zoom || 1;

	this.target = options.target || 'html';
	this.panTarget = options.panTarget;
	this.zoomTarget = options.zoomTarget;
	this.resizeTarget = options.resizeTarget;

	this.startedPanning = options.startedPanning || function() {};
	this.stoppedPanning = options.stoppedPanning || function() {};
	this.pannedBy = options.pannedBy || function() {};

	this.zoomedBy = options.zoomedBy || function() {};

	this.startedResizing = options.startedResizing || function() {};
	this.stoppedResizing = options.stoppedResizing || function() {};
	this.resizedBy = options.resizedBy || function() {};
}

// The `start` method sets the handlers to implement the panzoom interaction.
PanZoomResize.prototype.start = function() {
	var self = this;
	$(self.target)
		.mousedown(function(event) {
			// Only process left button interactions
			if (event.button !== 0)	
				return;
			// Normal drag = move; any modifier key (other than control, which on the Mac emulates the right click) = resize
			if (event.shiftKey || event.metaKey || event.altKey)
				self.state = 'resize-start';
			else
				self.state = 'pan-start';
			self.screenX = event.screenX;
			self.screenY = event.screenY;
		});

	// Set mousemove and mouseup listeners on the body so we can drag beyond the wall.
	$('body')
		.mousemove(function(event) {
			var deltaX, deltaY;

			if (self.state == 'pan-start') {
				self.state = 'pan';
				self.startedPanning(self);
			}
			if (self.state == 'pan') {
				deltaX = event.screenX - self.screenX;
				deltaY = event.screenY - self.screenY;
				
				var offset;
				var panTarget = self.panTarget;
				if (panTarget == 'this')
					panTarget = this;
				if (panTarget) {
					offset = $(panTarget).offset();
					offset.left += deltaX;
					offset.top += deltaY;
				}
				self.screenX = event.screenX;
				self.screenY = event.screenY;
				if (panTarget) {
					$(panTarget).offset(offset);
				}
				self.pannedBy(self, deltaX, deltaY);
			}

			if (self.state == 'resize-start') {
				self.state = 'resize';
				self.startedResizing(self);
			}
			if (self.state == 'resize') {
				deltaX = event.screenX - self.screenX;
				deltaY = event.screenY - self.screenY;

				var resizeTarget = self.resizeTarget;
				if (resizeTarget == 'this')
					resizeTarget = this;
				self.screenX = event.screenX;
				self.screenY = event.screenY;
				if (resizeTarget) {
					var width = $(resizeTarget).width() + deltaX;
					var height = $(resizeTarget).height() + deltaY;
					$(resizeTarget).width(width).height(height);
				}
				self.resizedBy(self, deltaX, deltaY);
			}
		})
		.mouseup(function(event) {
			if (self.state == 'pan') {
				self.stoppedPanning(self);
				self.state = 'off';
			} else if (self.state == 'resize') {
				self.stoppedResizing(self);
				self.state = 'off';
			}
		});

	$(self.target)
		.mousewheel(function(event, delta, deltaX, deltaY) {
			var deltaZ = 1;
			if (deltaY > 0)
				deltaZ = 1.05;
			else if (deltaY < 0)
				deltaZ = 1 / 1.05;
			else
				return;
			
			// **** Zoom does not work well: cursor should be center of zoom but isn't
			var offset;
			var zoomTarget = self.zoomTarget;
			if (zoomTarget == 'this')
				zoomTarget = this;
			if (zoomTarget) {
				offset = $(zoomTarget).offset();
				offset.left = event.clientX + (offset.left - event.clientX) * deltaZ;
				offset.top = event.clientY + (offset.top - event.clientY) * deltaZ;
			}
			self.zoom *= deltaZ;
			if (zoomTarget) {
				//offset.left /= self.zoom;
				//offset.top /= self.zoom;
				$(zoomTarget).offset(offset);
				$(zoomTarget).css({
					zoom : (self.zoom*100)+"%",
				});
			}

			self.zoomedBy(self, deltaZ, event.clientX, event.clientY);
		})
	;

	return this;
};

// The `stop` method removes the listeners.
PanZoomResize.prototype.stop = function() {
	$(this.target).off('mousedown mousemove mouseup mousewheel');
	if (app.coords)
		Object.unobserve(app.coords, adjustPanZoom);
};

// Go!
startBrowser();

// Return the exported functions.
return {
	stop: stopBrowser,
};

// Invoke the main function
}) ();
