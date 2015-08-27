// User interface for a Surface device
//
// Show the tiled display and the connected state of each tile.
// Attach a context menu to each tile.
// Applications can enrich the display using the `#wall` element.
//

// Wrap in a function to protect global space
(function () {

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

function tileMenu(tile) {
	var gui = require('nw.gui');
	var menu = new gui.Menu();

	menu.append(new gui.MenuItem({label: 'Tile', enabled: false}));
	menu.append(new gui.MenuItem({ type: 'separator'}));

	menu.append(new gui.MenuItem({
		label: 'Start renderer',
		click: function() {
			wall.startOne(tile);
		},
	}));

	menu.append(new gui.MenuItem({
		label: 'Stop renderer',
		click: function() {
			wall.stopOne(tile);
		},
	}));

	menu.append(new gui.MenuItem({
		label: 'Show remote log',
		click: function() {
			if (tile.logWindow) {
				tile.logWindow.show();
				tile.getLog();
				tile.clearLog();
			} else {
				// create window
				var win = tile.logWindow = gui.Window.open('log.html');
				// get log once it has loaded
				win.on('loaded', function() {
					this.window.setTile(tile);
					tile.getLog();
					tile.clearLog();
				});
				// hide on close
				win.on('close', function() {
					this.hide();
				});
			}
		},
	}));

	menu.append(new gui.MenuItem({
		label: 'Clear remote log',
		click: function() {
			tile.clearLog();
		},
	}));

	menu.append(new gui.MenuItem({
		label: 'Debug tile',
		click: function() {
			gui.Window.open('http://'+tile.host+':'+tile.debugPort);
		},
	}));

	return menu;
}

function updateMenu(tile, id) {
	var menu = tile.contextMenu;
	if (! menu)
		menu = tile.contextMenu = tileMenu(tile);

	// update menu items according to whether the tile is connected or not
	var connected = false;
	if ($('#'+id).hasClass('connected'))
		connected = true;
	
	menu.items[0].label = "Tile "+tile.instance;
	menu.items[2].enabled = ! connected;
	menu.items[3].enabled = connected;
	menu.items[4].enabled = connected;
	menu.items[5].enabled = connected;
	menu.items[6].enabled = connected;
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
				updateMenu(tile, id);
				tile.contextMenu.popup(event.originalEvent.x, event.originalEvent.y);
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

// Invoke the main function
}) ();
