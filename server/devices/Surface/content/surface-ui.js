var wall = null;

var wallZoom = 0.5;
if (platform.config.UI)
	wallZoom = platform.config.UI.wallZoom || wallZoom;

var wallOriginX = 0;
var wallOriginY = 0;

// Record the wall and give the div representing it a border
function createWall(device) {
	$("#platform").append('<div id="wall"></div>');
	wall = device;	// *** hardwired: need to get a better scheme
	var hbezel = Math.round(wall.config.bezelSize.width/2 * wallZoom);
	var vbezel = Math.round(wall.config.bezelSize.height/2 * wallZoom);
	$("#wall").css('border-left-width', hbezel)
			  .css('border-right-width', hbezel)
			  .css('border-top-width', vbezel)
			  .css('border-bottom-width', vbezel);
}

// Creates a div with `id` representing `tile`
function createTile (tile, id) {
	var left = Math.round(tile.originX * wallZoom + wallOriginX);
	var top = Math.round(tile.originY * wallZoom + wallOriginY);
	var width = Math.round(tile.width * wallZoom);
	var height = Math.round(tile.height * wallZoom);
	var hbezel = Math.round(wall.config.bezelSize.width/2 * wallZoom);
	var vbezel = Math.round(wall.config.bezelSize.height/2 * wallZoom);
	$('<div class="tile" id="'+id+'"></div>').appendTo('#wall');
	$("#"+id).css('left', (left-hbezel)+'px')
			 .css('top', (top-vbezel)+'px')
			 .css('width', width+'px')
			 .css('height', height+'px')
			 .css('border-left-width', hbezel)
			 .css('border-right-width', hbezel)
			 .css('border-top-width', vbezel)
			 .css('border-bottom-width', vbezel)
			 .on('contextmenu', function(event) { 
			 	if ($(this).hasClass('connected'))
			 		wall.stopOne(tile);
			 	else
				 	wall.startOne(tile); 
			 	event.preventDefault(); 
			 });
}

// Called when a tile becomes connected / disconnected
function tileConnected(id) {
	$("#"+id).addClass('connected');
}
function tileDisconnected(id) {
	$("#"+id).removeClass('connected');
}

// Called when the surface is ready, i.e. all the tiles have been created.
// By then we know its size.
function adjustSurface(wall) {
	var width = Math.round(wall.width * wallZoom);
	var height = Math.round(wall.height * wallZoom);
	$('#wall').width(width).height(height);
}

// Setup handlers to monitor the tiles and wall
function initSurface() {
	global.console.log('*** initSurface ***');
	platform.onDeviceCreated(function(device) {
		if (device.className() == "Tile")
			createTile(device, device.name);
		else
		if (device.className() == "Surface")
			createWall(device);
	});
	platform.onDeviceAvailable(function(device) {
		if (device.className() == "Tile")
			tileConnected(device.name);
		else
		if (device.className() == "Surface") 
			adjustSurface(wall);
	});
	platform.onDeviceUnavailable(function(device) {
		if (device.className() == "Tile")
			tileDisconnected(device.name);
	});
}

initSurface();
