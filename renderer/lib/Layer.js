// Layer - manage content 
//
// A layer is an HTML element in the rendering tiles.
// 

// Shared modules
var OO = require('OO');
var log = require('Log').logger('Layer');
var HTML = require('HTML');

// Local modules
var Tile = null; //require('./Tile'); *** We need to load it later because of a dependency cycle 

var Layer = OO.newClass().name('Layer')
	.classFields({
		layerId: 0,
		layers: [],
	})
	.classMethods({
		initTile: function(tile, state) {
			Layer.layers.forEach(function(layer) {
				layer.initTile(tile);
			});
		},
		tileReady: function(tile) {
			Layer.layers.forEach(function(layer) {
				layer.tileReady(tile);
			});
		},
		tileGone: function(tile) {
			Layer.layers.forEach(function(layer) {
				layer.tileGone(tile);
			});
		},
	})
	.fields({
		id: null,		// Element id

		type: 'normal',	// 'normal', 'iframe', 'component'
		overlay: false,	// If true, layer has no background and is on top of other layers

		left: 100,		// Layer position and size *** default values for testing
		top: 100,
		width: 400,
		height: 300,
		zoom: 1.0,

		url: null,		// If non null, url to load into the layer
	})
	.constructor(function(config) {
		log.enter(this, 'create', config);

		if (config)
			this.set(config);

		// Make sure it has an id
		if (! this.id)
			this.id = 'l_'+Layer.layerId++;

		// Wrap fields
		this.wrapFields({
			set left(value)   { log.message('set left'); this._set(value); this.updateFrame({left:   this.left});    log.message('done set left');},
			set top(value)    { log.message('set top'); this._set(value); this.updateFrame({top:    this.top});     log.message('done set top');},
			set width(value)  { log.message('set width'); this._set(value); this.updateFrame({width:  this.width});   log.message('done set width');},
			set height(value) { log.message('set height'); this._set(value); this.updateFrame({height: this.height});  log.message('done set height');},
			set zoom(value)   { log.message('set zoome'); this._set(value); this.updateFrame({zoom:   this.zoom});    log.message('done set zoome');},
			set url(value)    { log.message('set url'); this._set(value); this.updateURL(this.url); log.message('done set url'); }
		});

		// Record layer
		Layer.layers.push(this);

		// Init tiles
		if (!Tile) // lazy-load module to avoid dependency cycle
			Tile = require('./Tile');

		var self = this;
		Tile.mapReadyTiles(function(tile) {
			self.tileReady(tile);
		});

		log.newObject(this);
		log.exit(this, 'create');
	})
	.methods({
		// Lifecycle callbacks
		initTile: function(tile) {
			// nothing
		},

		tileReady: function(tile) {
			var layerTag = 'div class=layer';
			if (this.type == 'iframe')
				layerTag = 'iframe scrolling=no class=layer';

			// Create the layer element
			var layerElement = HTML.add(tile.window.window, 
				[layerTag, 
					{
						id: this.id, 
						style: {
							position: 'absolute',
							overflow: 'hidden',
						},
					},
					{
						style: this.getFrameStyleForTile(this, tile)
					},
					"Layer "+this.id,	// for testing
				]
			);

			if (!layerElement) {
				log.warn.method(this, 'tileReady', 'Could not create layer');
				return;
			}

			// *** why is layerElement.setAttribute null ??
			if (!layerElement.setAttibute)
				log.warn.method(this, 'tileReady (before set url)', 'layerElement.setAttibute undefined!!');

			// Load content if any
			if (this.url) {
				if (this.type == 'iframe')
					// layerElement.setAttibute('src', this.url);	*** does not work (see above)
					HTML.setAttributes(tile.window.window, this.id, {src: this.url});
				else if (this.url.match(/^http?s:\/\//))
					HTML.addHTML_URL(tile.window.window, this.url, 'content', layerElement);
				else
					HTML.addHTMLFile(tile.window.window, this.url, 'content', layerElement);
			}
		},

		tileGone: function(tile) {
			HTML.remove(tile.window.window, this.id);
		},

		// Remove the layer
		close: function() {
			// Remove the layer from the tiles
			var self = this;
			Tile.mapReadyTiles(function(tile) {
				HTML.remove(tile.window.window, self.id);
			});

			// Remove the layer from our list
			var index = Layer.layers.indexOf(this);
			if (index >= 0)
				Layer.layers.splice(index, 1);
		},

		setAttributes: function(attrSet) {
			var self = this;
			Tile.mapReadyTiles(function(tile) {
				HTML.setAttributes(tile.window.window, self.id, attrSet);
			});
		},

		setStyle: function(attrSet) {
			var self = this;
			Tile.mapReadyTiles(function(tile) {
				HTML.setStyle(tile.window.window, self.id, attrSet);
			});
		},

		getFrameStyleForTile: function(frame, tile) {
			var attrSet = {};
			if (frame.left !== undefined)
				attrSet.left = Math.round(frame.left - tile.originX)+"px";
			if (frame.top !== undefined)
				attrSet.top = Math.round(frame.top - tile.originY)+"px";
			if (frame.width !== undefined)
				attrSet.width = Math.round(frame.width)+'px';
			if (frame.height !== undefined)
				attrSet.height = Math.round(frame.height)+'px';
			if (frame.zoom) {
				attrSet['-webkit-transform'] = "scale("+(Math.round(frame.zoom *100)/100)+")";
				attrSet['-webkit-transform-origin']= "0 0";
			}

			return attrSet;
		},

		updateFrame: function(frame) {
			var self = this;
			Tile.mapReadyTiles(function(tile) {
				HTML.setStyle(tile.window.window, self.id, self.getFrameStyleForTile(frame, tile));
			});
		},

		updateURL: function(url) {
			if (this.type == 'iframe') {
				this.setAttributes({
					src: url,
				});
			} else {
				var self = this;
				if (url.match(/^https?:\/\//))
					this.mapReadyTiles(function(tile) {
						HTML.addHTML_URL(tile.window.window, url, 'content', layerElement);
					});
				else
					this.mapReadyTiles(function(tile) {
						HTML.addHTMLFile(tile.window.window, url, 'content', layerElement);
					});
			}
		},
});

log.spyMethods(Layer);

module.exports = Layer;
