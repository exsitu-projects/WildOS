// Photoz app - displays a grid of photos that autozoom 
//

// Shared modules
var log = require('Log').logger('Photoz');

// Renderer modules
var App = require('../../lib/App');
var Layer = require('../../lib/Layer');

// The `Photoz` class.
var Photoz = App.subclass().name('Photoz')
	.fields({
		imageRoot: null,
		fullFrameDir: null,
		halfFrameDir: null,
		quarterFrameDir: null,
	})
	.constructor(function(config) {
		log.enter(this, 'create', config);

		this._super(config);

		this.layer = Layer.create({
			type: 'iframe',
			mode: 'grid',
			url: 'app://localhost/apps/Photoz/content/index.html',
				//'http://'+App.server.hostname+':'+App.server.port+'/Photoz/index.html',
		});

		this.unused = [];
		this.onLoad = null;

		log.newObject(this);
		log.exit(this, 'create');
	})
	.methods({
		tileReady: function(tile) {
			var self = this;
			this.getBatch(16, function(result) {
				log.message('getBatch', ': got images', result);
				self.unused = result;
				if (self.onLoad)
					self.onLoad();
			});
		},

		// Clean up when application is closed
		stop: function() {
			this.layer.close();
			this.layer = null;
			this._super();
		},

		getNextUnusedPhoto: function() {
			if (this.unused.length === 0)
				return null;
			var photo = this.unused[0];
			this.unused.splice(0, 1);
			return photo;
		},

		getBatch: function(n) {
			// remote call
		},

		recyclePhoto: function(photo) {
			// remote call
		},

	})
	.shareState('own', ['getBatch', 'recyclePhoto'])
;

log.spyMethods(Photoz);

module.exports = Photoz;
