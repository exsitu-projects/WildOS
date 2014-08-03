// Renderer - connection to a rendering client
//
// A `Renderer` manages a connection to a single client that may run multiple tiles.
// It exists because of this m<->n mapping between clients and tiles.
//

// Shared modules
var OO = require('OO');
var log = require('Log').logger('Renderer');

// Server modules
var ObjectSharer = require('../../lib/ObjectSharer');
var SharingClient = require('../../lib/SharingClient');

// The `Renderer` class
var Renderer = OO.newClass().name('Renderer')
	.fields({
		host: null,
		client: null,
		tiles: [],
	})
	.classFields({
		sharer: ObjectSharer.create().name('renderingSharer'),	// The object sharer used by all renderer
		byInstance: {},	// maps instance names to clients
	})
	.constructor(function(host, tile) {
		// A `Renderer` is created with at least one tile.
		// More tiles can be added with `addTile`.
		this.host = host;
		this.addTile(tile);
	})
	.methods({
		// Add a tile to the renderer.
		// Nothing happens until a client is attached to the renderer with `setClient`.
		addTile: function(t) {
			this.tiles.push(t);
		},

		// Connect this renderer to a client.
		// While the connection is up, the state of the tile devices that "belong" 
		// to this renderer is shared with the client.
		setClient: function(socket, server, clientInfo) {
			// If there is already an active client, we kill it and use the new one instead.
			// This may happen when restarting the system with dangling clients, for example.
			if (this.client) {	// we don't want two renderers for one host
				log.method(this, 'setClient', '- OOPS - already a renderer for', clientInfo.host, '- Killing it.');
				this.shutdown();	// tell the client to quit
				this.client.close();
			}

			// Create the server-side representation of the client.
			// This is a `SharingClient`, which we configure to sync the objects specified in the renderer's sharer.
			this.client = SharingClient.create(socket, clientInfo.host).resetObjects().addSharer(Renderer.sharer);
			server.registerClient(socket, this);

			// Share the tiles managed by this renderer with the client
			for (var i = 0; i < this.tiles.length; i++) {
				var tile = this.tiles[i];
				log.method(this, 'setClient', 'for tile', i, tile.name, tile.instance);
				this.client.addObject(Renderer.sharer, tile);
				tile.connected();
			}
		},

		disconnected: function() {
			// Stop sharing the tiles
			for (var i = 0; i < this.tiles.length; i++) {
				var tile = this.tiles[i];
				this.client.removeObject(tile);
				tile.disconnected();
			}
			// And stop sharing altogether
			this.client.removeSharer(Renderer.sharer);
			this.client = null;
		},

		// Shutdown the renderer, by sending a `quit` message to the connected client (if any).
		shutdown: function() {
			if (this.client)
				this.client.emit('quit');
		}
	})
;

log.spyMethods(Renderer);

module.exports = Renderer;
