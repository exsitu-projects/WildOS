// WildOS - main entry point
//
// The system has three main components:
//	- a platform, made of a hierarchy of devices
//	- a set of plugins called apps to extend the capabilities of the platform
//	- a server and object sharing facility to communicate with clients
// Typically, clients represent resources from the platform that are not local to the machine running the server.
// For example, the computers of a visualization cluster driving a tiled wall display,
// a motion capture system, a tablet used as a controller, etc.
//

// *** pending problem - this does not work
process.on('SIGINT', function() {
	console.log('Interrupt - quitting');
	gui.App.quit();
});

// Node modules
var events = require('events');

// Shared modules
var log = require('Log').shared();

// Internal modules
var App = require('./lib/App');
var Config = require('./lib/config');
var Platform = require('./lib/Platform');
var Server = require('./lib/Server');

// Load a platform config file and initialize it.
// Call `cb` when ready with the platform as parameter.
function loadPlatform(name, cb) {
	log.enter(null, 'loadPlatform', name);

	// Load the json file representing the platform.
	// In case of an error, we throw an error because
	// running the server without a proper config file is useless.
	var config = {};
	try {
		config = Config.load(name);	
	} catch(e) {
		log.exit(null, 'loadPlatform', name, 'failed');
		throw e;
	}

	// The platform acts as an event emitter,
	// notifying of devices being created and becoming available/unavailable
	var eventEmitter = new events.EventEmitter();
	eventEmitter.setMaxListeners(100);	// default limit is 10!

	// *** We need a way to specify options from the command line
	var options = {
		wall: {
			// for Browser app
				backgroundURL: 
//				null,			// default page
//				'tile.html',	// page loaded from the local webserver in the client
//				'http://Michels-MacBook-Pro.local:9000/wildschedule.html',
				'http://www.lri.fr/~mbl',
//				'http://localhost:8080/fullschedule.html',
//				'http://www.lri.fr/~mbl/WILD/index.html',

			// for SlideShow app
				slideImage: 'test',
		},
	};

	// Create the platform object.
	var platform = Platform.create(config, options, eventEmitter);

	// Make it easier for devices to access apps (although at this point they are not yet loaded).
	platform.apps = App;

	// Create the platform UI, if any, start the platform and notify the apps.
	// If there is a UI, we only start the platform and notify the apps once the UI is loaded,
	// so that both the platform and the apps have access to it.
	var init = function() {
		platform.addDevices();
		if (cb)
			cb(platform);
	};

	var win = platform.makeUI();
	if (win) {
		log.message('loadPlatform', name, '- will start when window ready');
		win.once('loaded', init);
	} else {
		// Start the platform after the init sequence is finished.
		setImmediate(init);
	}

	log.exit(null, 'loadPlatform', name);
	return platform;
}

// Star the server, then the apps
function startServerAndApps(platform) {
	log.enter(null, 'startServerAndApps');

	// Finally create the web and websocket servers.
	var server = platform.server = Server.create(platform);
	server.start();

	// Create the Applications menu
	App.makeMenu();

	// Run the apps
	var appNames = exports.gui.App.argv;
	App.loadApps(appNames, function(apps) {
		// *** we should also use this callback to tell we are ready, in case it's done asynchronously (which is not the case at the moment)
		appNames.forEach(function(app) {
			if (apps.indexOf(app) < 0)
				log.warn.message('startApps', '- App', app, 'not found.');
		})
	});

	log.exit(null, 'startServerAndApps');
}

// Main initialization function.
// It is called by the webkit side when it is ready,
// to make sure the UI is available
exports.init = function() {
	var gui = exports.gui = window.require('nw.gui');

	// Create the platform using $WALL (default to WILD).
	// When the platform is ready, start the server and the apps
	/*jshint sub:true */
	var platform = loadPlatform(process.env["WALL"] || 'WILD', startServerAndApps);
	/*jshint sub:false */

	// Return the platform, which is also an event emitter,
	// so that the UI can register listeners, etc. 
	return platform;
};
