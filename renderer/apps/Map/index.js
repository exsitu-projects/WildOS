// Map app - displays a map with OpenLayers 
//

// Node modules
var Path = require('path');

// Shared modules
var log = require('Log').logger('Map');
var HTML = require('HTML');

// Renderer modules
var App = require('../../lib/App');
var Layer = require('../../lib/Layer');

var contentRoot = Path.join(__dirname, "content/");

// The `Map` class.
var Map = App.subclass().name('Map')
	.fields({
		source: "OSM", //"MapQuest",
		options: {layer: "sat"},
		center: [37.41, 8.82],		// LonLat coordinates of the center of the map
		mapCenter: {x:960, y:540}, 	// pixel coordinates of the center of the display (from topleft)
		resolution: undefined,
		rotation: 0,
	})
	.constructor(function(config) {
		this._super(config);

		this.layer = Layer.create({
			type: 'normal',
			mode: 'grid',
		});

		this.wrapFields({
			set center(c)   	{ this._set(c); this.panned(); },
			set resolution(r)	{ this._set(r); this.zoomed(); },
			set mapCenter(c)	{ this._set(c); this.panned(); },
			set rotation(r)		{ this._set(r); this.rotated();},
		});
	})
	.methods({
		tileReady: function(tile) {
			var self = this;
			this.loadTile(tile);
		},

		loadTile: function(tile) {
			if (!tile || !tile.ready || !tile.window)
				return;

			var win = tile.window.window;
			var self = this;
			var layerId = this.layer.id;
			HTML.replace(win, layerId, '');
			HTML.addCSS_URL(win, "http://openlayers.org/en/v4.2.0/css/ol.css", {onload: function() {
				HTML.addJS_URL(win, "http://openlayers.org/en/v4.2.0/build/ol.js", {onload: function() {
					HTML.addJSFile(win, Path.join(contentRoot, "map.js"), 'end', layerId);
					// setTimeout(function() { 
						win.loadMap(layerId, self, tile); 
					// }, 1000);
				}}, 'end', layerId);
			}},'end', layerId);
		},

		panned: function() {
			var self = this;
			this.mapReadyTiles(function(tile) {
				var win = tile.window.window;
				if (win.panned)
					win.panned(self.center);
			});	
		},
		zoomed: function() {
			var self = this;
			this.mapReadyTiles(function(tile) {
				var win = tile.window.window;
				if (win.zoomed)
					win.zoomed(self.resolution);
			});	
		},
		rotated: function() {
			var self = this;
			this.mapReadyTiles(function(tile) {
				var win = tile.window.window;
				if (win.rotated)
					win.rotated(self.rotation);
			});	
		},

		// Clean up when application is closed
		stop: function() {
			this.layer.close();
			this.layer = null;
			this._super();
		},
	})
	.shareState({
		fields: 'own', 
	})
;

log.spyMethods(Map);

module.exports = Map;
