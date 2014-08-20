// Photoz app - displays a grid of photos that autozoom 
//

// Shared modules
var log = require('Log').logger('Photoz');

// Renderer modules
var App = require('../lib/App');
var Layer = require('../lib/Layer');

// The `Browser` class.
var Photoz = App.subclass().name('Photoz')
	.fields({

	})
	.constructor(function(config) {
		log.enter(this, 'create', config);

		this._super(config);

		this.layer = Layer.create({
			type: 'iframe',
			mode: 'grid',
			url: 'http://'+App.server.hostname+':'+App.server.port+'/Photoz/index.html',
		});

		log.newObject(this);
		log.exit(this, 'create');
	})
	.methods({
		// Clean up when application is closed
		stop: function() {
			this.layer.close();
			this.layer = null;
			this._super();
		},
	})
	.shareState()
;

log.spyMethods(Photoz);

module.exports = Photoz;
