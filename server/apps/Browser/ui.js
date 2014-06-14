// Code injected in the platform control window
//
// Here we let the user load pages and control the position and zoom factor 
// of the page being displayed on the wall.
//

var panZoomBrowser = null;

var app = platform.apps.getApp('Browser');

// The miniature wall position and scale factor
var wall = {
	originX: 0,
	originY: 0,
	width: 800,
	height: 600,
	zoom: 1.0
};

// Set the background URL.
function setURL(url) {
	$('#browserUrl').val(url);
	
	// Prepend local content dir if no http prefix
	if (! url.match(/http:\/\//))
		url = 'app://localhost/content/' + url;
	$('#browserPage').attr('src', url);
}

// Adjust the frame showing the page.
function adjustLocal() {
	var zoom = wall.zoom*app.zoom; // accounts for wallZoom in wild.html
	var percentZoom = Math.round(zoom*100,2)+'%';
	$('#browserPage')
		.css('left', Math.round(app.offsetX/app.zoom)+"px")
		.css('top',  Math.round(app.offsetY/app.zoom)+"px")
		.css('zoom', percentZoom)
		.contents().find('body').css('zoom', percentZoom);
}

// Called at the end of the script.
// Creates a UI to enter the URL and to 
// Creates a `PanZoom` object active over elements of class `tile`.
function startBrowser() {
	// Create a div that will hold the app's UI, so we can easily remove it
	$('#top').append('<div id="browserApp">Browser: </div>');

	// Add a text field to load a different URL
	$('#browserApp').append('<input id="browserUrl" type="text" size="80"/><input id="setBrowserUrl" type="button" value="Set URL"/>');
	$('#browserUrl').val(app.backgroundURL);
	$('#browserUrl').keypress(function(e) { if (e.which == 13) $('#setBrowserUrl').click(); });
	$('#setBrowserUrl').click(function() { app.setBackgroundURL($('#browserUrl').val()); });

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

	// Add an iframe for the URL.
	var url = app.backgroundURL;
	if (url) {
		if (! url.match(/http:\/\//))
			url = 'app://localhost/content/' + url;		
	}

	var size = 'width: ' +wall.width+'px; '
			 + 'height: '+wall.height+'px; ';

	$('#wall').append('<iframe id="browserPage" style="z-index: 1; position: absolute; overflow: hidden; '+size+'" scrolling="no" src="'+url+'"/>');
	$('#browserPage').load(adjustLocal);

	// Pan and zoom background when dragging / scrollwheeling in any of the tiles
	panZoomBrowser = new PanZoom({
		target: '.tile',
		panTarget: null,
		zoomTarget: null,
		pannedBy: function(pz, dX, dY) {
			app.panBackgroundBy(dX / wall.zoom, dY / wall.zoom);
			adjustLocal();
		},
		zoomedBy: function(pz, dZ, X, Y) {
			app.zoomBackgroundBy(dZ, (X - wall.originX) / wall.zoom, (Y - wall.originY) / wall.zoom);
			adjustLocal();
		},
	}).start();

	// Update URL when changed in the application
	app.wrapFields({
		set url(url) { this._set(url); setURL(url); }
	});
}

function stopBrowser() {
	// Remove panzoom on wall
	panZoomBrowser.stop();

	// Remove the elements that we added
	$('#browserApp').remove();
	$('#browserPage').remove();
	$('#browserJS').remove();
	$('#mousewheelJS').remove();
}

// A `panZoom` object controls panning and zooming by 
// dragging on an element and using the scrollwheel.
function PanZoom(options) {
	this.dragging = 0;
	this.screenX = this.screenY = 0;
	this.offsetX = this.offsetY = 0;
	this.zoom = options.zoom || 1;

	this.target = options.target || 'html';
	this.panTarget = options.panTarget;
	this.zoomTarget = options.zoomTarget;
	this.startedPanning = options.startedPanning || function() {};
	this.stoppedPanning = options.stoppedPanning || function() {};
	this.pannedBy = options.pannedBy || function() {};
	this.zoomedBy = options.zoomedBy || function() {};
}

// The `start` method sets the handlers to implement the panzoom interaction.
PanZoom.prototype.start = function() {
	var self = this;
	$(self.target)
		.mousedown(function(event) {
			self.dragging = 1;
			self.screenX = event.screenX;
			self.screenY = event.screenY;
		})
		.mousemove(function(event) {
			if (self.dragging == 1) {
				self.dragging = 2;
				self.startedPanning(self);
			}
			if (self.dragging) {
				var deltaX = event.screenX - self.screenX;
				var deltaY = event.screenY - self.screenY;
				
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
		})
		.mouseup(function(event) {
			self.dragging = false;
			self.stoppedPanning(self);
		})
		.mousewheel(function(event, delta, deltaX, deltaY) {
			var deltaZ = 1;
			if (deltaY > 0)
				deltaZ = 1.05;
			else if (delta < 0)
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
PanZoom.prototype.stop = function() {
	$(this.target).off('mousedown mousemove mouseup mousewheel');
};

// Go!
startBrowser();
