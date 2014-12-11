// Photoz app - displays a grid of photos that autozoom 
//

// Node modules
var Path = require('path');

// Shared modules
var log = require('Log').logger('Photoz');

// Server modules
var App = require('../../lib/App');

// Root of the executable
var appContent = Path.join(__dirname, "content");	// app's content directory (on server)

function makeDir(dir) {
	if (! dir)
		return "";
	if (dir.match(/\/$/))
		return dir;
	return dir+'/';
}

// The `Photoz` class.
var Photoz = App.subclass().name('Photoz')
	.fields({
		indexFile: "photos.js",	// The path on the server to the file holding the description of the images (absolute, or relative to appContent)
		imageRoot: null,	// The URL (file:/// or http:// or app://) for the images listed in indexFile (for the renderers)
		fullFrameDir: null,	// relative directory to full-frame images
		halfFrameDir: null,	// relative directory to half-frame images
		quarterFrameDir: null,	// relative directory to quarter-frame images
	})
	.constructor(function(config) {
		// *** It looks like we must define a constructor for the ObjectSharer constructor mixin to work
		log.enter(this, 'create');
		this._super(config);

		// Default indexFile to server/apps/Photoz/content/photos.js
		// and imageRoot to the server URL for server/apps/Photos/content/photos
		if (! this.imageRoot)
			this.imageRoot = App.server.rootURL()+'/Photoz/photos';

		var photos = null;
		try {
			if (! this.indexFile.match(/^\//))
				this.indexFile = Path.join(appContent, this.indexFile);
			photos = require(this.indexFile);
		} catch(e) {
			log.warn.method(this, 'create', 'could not load index file '+this.indexFile);
		}

		this.photos = photos;

		// Update the directories in the index to be relative to the <appRoot>/photoz directory
		// Note: we're not using photos.dir - we assume it's part of imageRoot.
		this.fullFrameDir = makeDir(photos.fullFrameDir);
		this.halfFrameDir = makeDir(photos.halfFrameDir);
		this.quarterFrameDir = makeDir(photos.quarterFrameDir);

		this.unused = [];

		log.newObject(this);
		log.exit(this, 'create');
	})
	.methods({
		// Called when the app is about to be unloaded.
		stop: function() {
			this._super();

		},

		// Return a new photo.
		getPhoto: function() {
			if (this.unused.length === 0) {
				// Refill unused array
				for (var i = 0; i < this.photos.all.length; i++)
					this.unused.push(this.photos.all[i].file);
			}

			// Pick an unused photo at random
			var idx = Math.floor(Math.random() * this.unused.length);
			var photo = this.unused[idx];

			// Remove it from the unused array
			this.unused.splice(idx, 1);

			// Return it
			return photo;
		},

		// Return an array of n new photos
		getBatch: function(n) {
			var batch = [];
			for (var i = 0; i < n; i++)
				batch.push(this.getPhoto());
			return batch;
		},

		// Return a photo to the unused batch
		recyclePhoto: function(photo) {
			this.unused.push(photo);
		},

		// These methods are meant to be called by clients to change the state of the app

	})
	.shareState('own', ['getBatch', 'recyclePhoto'])
;

log.spyMethods(Photoz);

module.exports = Photoz;
