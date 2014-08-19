// Photoz app - displays a grid of photos that autozoom 
//

// Shared modules
var log = require('Log').logger('Photoz');

// Server modules
var App = require('../../lib/App');

// The `Photoz` class.
var Photoz = App.subclass().name('Photoz')
	.fields({

	})
	.constructor(function(config) {
		// *** It looks like we must define a constructor for the ObjectSharer constructor mixin to work
		log.method(this, 'constructor');
		this._super(config);
	})
	.methods({
		// Called when the app is about to be unloaded.
		stop: function() {
			this._super();

		},

		// These methods are meant to be called by clients to change the state of the app

	})
	.shareState('own', 'own')
;

log.spyMethods(Photoz);

module.exports = Photoz;
