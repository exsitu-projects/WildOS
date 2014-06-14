// Tile - a part of a Surface
//
// A `Tile` object represents a tile in a tiled display.
// In most cases, the tile corresponds to a physical display, but this is not required.
// For example, an application may want to have two tiles per display.
// 
// Tiles are not described explicitly in config files (at least at present)
// but they use a configuration created by a `Surface` object.
// The following properties are used:
//		"left", "top", "width", "height": the position and size of the tile
//		"originX", "originY": the location of the tile in the overall surface 
//			(must be consistent with the physical layout of the display)
//		"host": the host name of the client running that tile
//		"name": the name of the tile, e.g. "Left" or "Right" if a host manages two tiles
//		"instance": the instance name, of the form 
//			<hostname> if there is a single client per host
//			or <hostname>_<tilename> if there is one client per tile for each host
//

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// Server modules
var Device = require('../../lib/Device');

// Internal modules
var Renderer = require('./Renderer');	// represents a connection to a rendering client

// The server-side `Tile` class.
var Tile = Device.subclass().name('Tile')
	.fields({
		// Coordinates of the frame, relative to the display surface.
		left: 0,
		top: 0,
		width: 800,
		height: 600,
		// Coordinates of top-left corner, relative to the enclosing surface.
		originX: 0,
		originY: 0,
		// Host name and instance name running that tile
		host: null,
		instance: null,	// `host` or `host_tile` if running one instance per tile
		rank: null,		// `null` or a number denoting the rank of the instance when there are multiple instances per host
		tileName: null,	// same as `instance` if one tile per host, or `instance_rank` if multiple tiles per host.
		// Note that `name` holds the full name : `host_instance_rank`
	})
	.constructor(function(options, events) {
		this._super({}, options, events);
		if (options)
			this.set(options);

		// Connect to the client if it is up
		if (this.host)
			this.recordTile();

		// Notify that we exist
		this.deviceCreated();

		// In case of shutdown, tell the client (if any) to quit.
		var self = this;
		this.events.on('shutdown', function() {
			log.eventEnter(self, 'shutdown');
			var renderer = Renderer.byInstance[self.instance];
			if (renderer)
				renderer.shutdown();
			log.eventExit(self, 'shutdown');
		});
	})
	.methods({
		// Register the tile with the sharing manager (see `Renderer` class for details). 
		recordTile: function() {
			if (Renderer.byInstance[this.instance])
				Renderer.byInstance[this.instance].addTile(this);
			else
				Renderer.byInstance[this.instance] = Renderer.create(instance.host, this);
		},

		// Callbacks from the connected tile renderer.
		// The device is available only when the connection with the client is up.
		connected: function() {
			this.deviceAvailable();
		},
		disconnected: function() {
			this.deviceUnavailable();
		},

		// *** Not sure if this is still used or how it worked...
		callJavascript: function(fun /* args */) {
			// calling javascript in the background page
			// let the sharer forward it to the clients
		},
	})
;

log.spyMethods(Tile);

module.exports = Tile;

