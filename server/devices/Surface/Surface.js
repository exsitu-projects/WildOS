// Surface - a tiled display surface
//
// A `Surface` object is a device and contains a set of devices of class `Tile`.
// The tiles are managed by a client process, therefore the surface manages
// the connection with those clients and the sharing of tile information with these clients.
//
// A surface is described in the config file with the following properties:
//		"type": "Surface"
//		"name" - optional
//		"tileSize": {"width": nn, "height": nn}
//		"bezelSize": {"width": nn, "height": nn}
//		"numTiles": {"columns": nn, "rows": nn}
//		"tiles": array of row arrays of columns cells [ [r1c1]...[r1cn] ] [ [r2c1]...[r2cn] ] ... 
//			Each cell is either a host name or a pair ["hostname", "tilename"]
//			The latter is needed when each computer manages multiple tiles
//		"renderer": "perTile" or "perHost" - optional, defaults to perHost
//		"layout": literal object indexed by tile name - optional
//			Each entry in that object is of the form {"left": nn, "top": nn}
//			and represents the position of the topleft corner of that tile
//		"start", "stop", "restart": commands to be run when starting/stopping/restarting the platform

// Node modules
var util = require('util');
var os = require('os');

// Shared modules
var OO = require('OO');
var log = require('Log').shared();

// Server modules
var Device = require('../../lib/Device');
var ObjectSharer = require('../../lib/ObjectSharer');

// Internal modules
var Renderer = require('./Renderer');	// represents a connection to a rendering client
var Tile = require('./Tile');

// *** To be tested:
// *** It's not clear that we could manage multiple surfaces from one server ***
// *** this is because of the sharing scheme, which is attached to classes  ***

// The `Surface` class
var Surface = Device.subclass().name('Surface')
	.fields({
		// Overall size, computed as tiles are added.
		width: 0,
		height: 0,
	})
	.constructor(function(config, options, events) {
		this._super(config, options, events);
		if (options)
			this.set(options);

		// Create a sharer to share the state of `Surface` and `Tile` objects with clients
		this.surfaceSharer = ObjectSharer.create().name('surfaceSharer');
		this.surfaceSharer.master(Surface, 'own', ['callJavascript']);
		Renderer.sharer.master(Tile, 'own', null, ['callJavascript'], 'after');

		// Catch events to start/stop/restart the clients on the cluster.
		// The commands are taken from the config file (if they exist)
		var self = this;
		this.events.on('start',   function() { self.start(); });
		this.events.on('stop',    function() { self.stop(); });
		this.events.on('restart', function() { self.restart(); });
	})
	.methods({
		// Called when the Surface is added to the platform.
		added: function() {
			// Find the platform we are in
			var platform = this.parent.findAncestor({type: 'Platform'});
			if (! platform)
				return;

			// The function that creates the tiles and sends notifications
			// that will be captured by the injected code below.
			var self = this;
			function createTiles() {
				self.deviceCreated();
				self.createTiles();
				self.deviceAvailable();
			}

			// Inject CSS and JS in platform UI.
			// Because the insertion and execution of JS is asynchronous
			// we create the tiles in the callback called when the JS is done.
			platform.injectCSSFile('../devices/Surface/content/surface-ui.css');
			platform.injectJSFile('../devices/Surface/content/surface-ui.js', createTiles);
		},

		// Add a tile to the surface, whose size and position are stored in `options`
		addTile: function(options) {
			// Copy all of the Surface options to the tile
			// *** Maybe we should screen those that are a property of the tile?
			if (this.options)
				for (var prop in this.options)
					options[prop] = this.options[prop];

			// Create the tile object and add it to the surface.
			var tile = this.addDevice(Tile.create(options, this.events));

			// Update surface size.
			if (tile.originX + tile.width > this.width)
				this.width = tile.originX + tile.width;
			if (tile.originY + tile.height > this.height)
				this.height = tile.originY + tile.height;

			return tile;
		},

		// Create the tiles described in the configuration.
		createTiles: function() {
			var config = this.config;

			// The config may specify a subset of the mosaic.
			var firstRow = config.top || 0;
			var lastRow = config.bottom || (config.numTiles.rows -1);
			var firstCol = config.left || 0;
			var lastCol = config.right || (config.numTiles.columns -1);

			// Get the sizes of tiles and bezels from the config.
			var width  = config.tileSize.width;
			var height = config.tileSize.height;
			var hGap   = config.skipBezels ? 0 : config.bezelSize.width;
			var vGap   = config.skipBezels ? 0 : config.bezelSize.height;

			// Create the tiles in the mosaic.
			var yO = 0; // x0 & y0 = coordinates relative to the subset
			for (var r = firstRow; r <= lastRow; r++) {
				var xO = 0;
				for (var c = firstCol; c <= lastCol; c++) {
					// The `config.tiles` property holds an array specifying,
					// for each tile, the name of the host (when each host has a single tile)
					// or a pair: host name (`host`), tile name (`name`)
					// or a triplet: host name (`host`), tile groug (`name`), rank in group (`rank`).
					// In the latter case, all tiles in the same group are managed by the same renderer.
					var tile = config.tiles[r][c];
					var host = tile;
					var name = "main";
					var rank = null;
					if (util.isArray(tile)) {
						host = tile[0];
						name = tile[1];
						rank = tile[2];
					}
/*
					if (host == 'localhost')
						host = os.hostname();
*/
					// In addition, the `config.renderer` property specifies
					// whether a single process per host runs all the tiles on that host (`perHost`),
					// or whether there is one process per tile (`perTile`).
					// This is used to assign an instance name to each tile.
					if (config.renderer == "perTile")
						instance = host+'_'+name;
					else
						instance = host;

					// Finally, the `config.layout` may describe the position of each tile.
					// The default is 0, 0. It can be used to, e.g., have two logical tiles
					// on one physical one, and for testing. 
					var left = 0, top = 0;
					if (config.layout && config.layout[name]) {
						tile = config.layout[name];
						if (util.isArray(tile)) {
							left = tile[rank].left;
							top = tile[rank].top;
						} else {
							left = tile.left;
							top = tile.top;
						}
					}

					// Name of the tile on the host running it
					// Full name of the tile in the server
					var tileName = name;
					var fullName = instance;
					if (rank !== null) {
						tileName += '_'+rank;
						fullName += '_'+rank;
					}

					// Now we can create the tile.
					this.addTile({
						left: left, top: top, width: width, height: height,
						originX: xO, originY: yO,
						host: host,			// e.g. "a1"
						instanceName: name,	// e.g., "Left"
						instance: instance,	// e.g., "a1_Left"
						rank: rank,			// e.g., 1
						tileName: tileName,	// e.g., "Left_1"
						name: fullName,		// e.g., "a1_Left_1"
					});

					xO += width + hGap;
				}
				yO += height + vGap;
			}
		},

		// Callback when a new client is connected and has said hello.
		// Note that this is done at the surface rather than tile level
		// because logically, the clients manage (part of) the surface.
		// Also, since multiple tiles may be managed by the same client,
		// it would be hard to decide what to do at the tile level.
		clientConnected: function(socket, server, clientInfo) {
			// The message lets us identify the client and map it to a `Renderer` object.
			if (clientInfo.host == os.hostname())
				clientInfo.host = 'localhost';
			var instance = clientInfo.host+'_'+(clientInfo.instance || 0);
			var renderer = Renderer.byInstance[instance];
			// Assign the client to that renderer, so that we can sync states.
			if (renderer) {
				log.method(this, 'clientConnected', '- renderer at', instance);
				renderer.setClient(socket, server, clientInfo);
			} else
				log.method(this, 'clientConnected', '- no renderer for', instance);
		},

		// Run `cmd` for each tile in the configuration
		runCmd: function(cmd) {
			var platform = this.parent.findAncestor({type: 'Platform'});
			var env = this.config.env || {};
			var domain = this.config.domain || '';

			// This object has one entry per instance, i.e. per process running on a client.
			// The index is either the hostname, when running one client per host,
			// or hostname_instance when running one client per tile.
			var ctxByClient = {};

			// We create the set of contexts in which to run the command
			// by going through the set of tiles.
			this.mapDevices(function(tile) {
				clientName = tile.instance;

				ctxByClient[clientName] = {
					HOST: tile.host + domain,
					INSTANCE: tile.instanceName,
					PORT: platform.serverPort,
					ENV: env[tile.instanceName],
				};
			});

			// Now we can run the command for each instance
			for (var instance in ctxByClient)
				this.spawn(cmd, ctxByClient[instance]);
		},

		// Run the start/stop/restart commands specified in the config file.
		// If restart is not defined, run stop then start.
		start: function() {
			if (this.config.start)
				this.runCmd(this.config.start);
		},

		stop: function() {
			if (this.config.stop)
				this.runCmd(this.config.stop);
		},

		restart: function() {
			if (this.config.restart)
				this.runCmd(this.config.restart);
			else {
				this.stop();
				this.start();
			}
		},

		// Invoke a javascript function on the clients managing the tiles of the surface.
		// *** Not sure if this is still used or how it worked...
		callJavascript: function(fun /* args */) {
			this.mapDevices(function(tile) {
				tile.callJavascript(fun /* args */);			
			});
		},
	});

log.spyMethods(Surface);

module.exports = Surface;
