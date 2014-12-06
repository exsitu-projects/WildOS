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

// This is only called when running under node.js
process.on('SIGINT', function() {
	console.log('Interrupt - quitting');
	//gui.App.quit();
	if (global.platform)
		global.platform.shutdown();
	process.exit(1);
});

// Command line options
var program = require('commander');

program
	.version('0.2.2')
	.usage('[options] [app ...]')
	.option('-w, --wall <config>', 'Platform name (defaults to $WALL)')
	.option('-c, --config <dir>', 'Config path (defaults to ./configs)')
	.option('-p, --port <number>', 'Port number (defaults to 8080)', parseInt)
	.option('-n, --no-clients', 'Do not start/stop clients with server')
	.option('-d, --debug [level]', 'Enable debugging')
	.option('-l, --log file', 'Log config file')
	.option('--no-GUI', 'Do not create graphical user interface')
;

// Node modules
var events = require('events');

// Shared modules
var Log = require('Log');
var log = null;

// Internal modules - initialized after logging has been configured
var GUI = null; // require('./lib/gui');
var App = null; // require('./lib/App');
var Config = null; // require('./lib/config');
var Platform = null; // require('./lib/Platform');
var Server = null; // require('./lib/Server');

// Process the logging and debugging options.
function processLogDebugOptions(program) {
	// Process debug level
	if (program.debug === undefined) // no -d argument
		program.debug = 0;
	else if (program.debug === true) // -d argument without level
		program.debug = 1;

	// Interpretation of debug level:
	// - 0: no trace, no titlebars (i.e. no access to debugger), trace windows hidden
	// - 1: trace all, show titlebars, hide trace windows
	// - 2: trace all, show titlebars, show trace windows
	// - 3: trace all, show titlebars, log to console
	Log.logToConsole = (program.debug >= 3);
	program.showWindows = (program.debug >= 2) && !Log.logToConsole;
	program.showToolbar = (program.debug >= 1);

	// Load load config file if debugging is enabled
	if (program.debug) {
		var logFile = program.log || 'logdefault';
		// Prepend ../ unless path starts with / because starting path is node_modules
		if (!logFile.match(/^\//))
			logFile = '../'+logFile;
		Log.loadConfig(logFile);
	} else {
		Log.display = 'skip';
	}

	// Create logger now that we have configured logging and debugging
	log = Log.logger('WildOS');

	// Now that the logger is configured, load modules
	GUI = require('./lib/gui'); if (! program.GUI) GUI.disable();
	App = require('./lib/App');
	Config = require('./lib/config');
	Platform = require('./lib/Platform');
	Server = require('./lib/Server');
}

// Load a platform config file and initialize it.
// Call `cb` when ready with the platform as parameter.
function loadPlatform(name, cb) {
	log.enter(null, 'loadPlatform', name);

	// Update the config path
	if (program.config)
		Config.searchPath.prepend(program.config);

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

	// Override platform server port if --port argument is specified,
	// Set it to default value if not specified
	if (program.port)
		config.serverPort = program.port;
	else if (! config.serverPort)
		config.serverPort = 8080;	// Default port

	// The platform acts as an event emitter,
	// notifying of devices being created and becoming available/unavailable
	var eventEmitter = new events.EventEmitter();
	eventEmitter.setMaxListeners(100);	// default limit is 10!

	// *** We need a way to specify options from the command line or a json file or something...
	var options = {
	};

	// Create the platform object.
	var platform = Platform.create(config, options, eventEmitter);

	// Make it easier for devices to access apps (although at this point they are not yet loaded).
	platform.apps = App;

	// Give access to program arguments
	platform.program = program;

	// Give access to GUI
	platform.GUI = GUI;

	// Create the platform UI, if any, start the platform and notify the apps.
	// If there is a UI, we only start the platform and notify the apps once the UI is loaded,
	// so that both the platform and the apps have access to it.
	var init = function() {
		platform.addDevices();
		GUI.getPlatformMenu(platform);		
		if (cb)
			cb(platform);
	};

	var win = GUI.makePlatformUI(platform, program.showToolbar);
	if (win) {
		log.message('loadPlatform', name, '- will start when window ready');
		win.once('loaded', init);

		// Kill clients on exit
		win.on('close', function() {
			if (program.clients)
				platform.stop();
			exports.gui.App.quit();
		});
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

	// Create the web and websocket servers.
	var server = platform.server = Server.create(platform, { port: platform.serverPort });
	server.start();

	// Create the Applications menu
	GUI.getAppsMenu(App);

	// Run the apps (specified as the remaining arguments on the command line)
	var appNames = program.args;

// *** Quick hack to make sure the apps are loaded after the platform is fully initialized
setTimeout(function() {

	App.loadApps(appNames, function(apps) {
		// *** we should also use this callback to tell we are ready, in case it's done asynchronously (which is not the case at the moment)
		appNames.forEach(function(app) {
			if (apps.indexOf(app) < 0)
				log.warn.message('startApps', '- App', app, 'not found.');
		});

		// Start clients
		if (program.clients) {
			setTimeout(function() {
				platform.restart();
			}, 1000);			
		}
	});

}, 100);

	log.exit(null, 'startServerAndApps');
}

// Main initialization function.
// It is called by the webkit side when it is ready,
// to make sure the UI is available
exports.init = function() {
	var gui = exports.gui = window.require('nw.gui');
	var win = gui.Window.get();

	// Process arguments: need to prepend 2 arguments for commander to work
	var args = ['nw', 'server'];
	for (var i = 0; i < gui.App.argv.length; i++)
		args.push(gui.App.argv[i]);
	program.parse(args);

	// Use preferences if called without any argument
	if (args.length == 2) {
		var preferences = win.window.localStorage.preferences;
		if (preferences) {
			preferences = JSON.parse(preferences);
			console.log('preferences=', preferences);
			program.wall = preferences.platform;
			program.config = preferences.configPath;
			program.port = preferences.port;
			program.clients = preferences.runClients;
			program.debug = preferences.debug;
			program.log = preferences.logConfig;
			program.args = preferences.apps;
		}
	}

	// Process logging and debugging options
	processLogDebugOptions(program);

	// Hide trace window when not debugging
	if (program.showWindows)
		win.show();

	// Closing log window only hides it so it can be reopened
	win.on('close', function() {
		this.hide();
	});

	// Get platform name: --wall argument, otherwise $WALL, defaulting to 'WILD'
	/*jshint sub:true */
	var platformName = program.wall || process.env["WALL"] || 'WILD';
	/*jshint sub:false */

	// Create the platform
	// When the platform is ready, start the server and the apps
	var platform = loadPlatform(platformName, startServerAndApps);

	// Return the platform, which is also an event emitter,
	// so that the UI can register listeners, etc. 
	return platform;
};

// Launch with node.js instead of webkit.
// There is no 'window' object under node, and therefore the GUI will disable itself.
// Note that in this case we're not using the stored preferences.
// *** maybe they should be saved by node-webkit in a json file rather than in the localStorage?
exports.headless = function() {
	program.parse(process.argv);

	// Process logging and debugging options
	processLogDebugOptions(program);
	log.message('runnning headless');

	// Get platform name: --wall argument, otherwise $WALL, defaulting to 'WILD'
	/*jshint sub:true */
	var platformName = program.wall || process.env["WALL"] || 'WILD';
	/*jshint sub:false */

	// Create the platform
	// When the platform is ready, start the server and the apps
	var platform = loadPlatform(platformName, startServerAndApps);

	// Store platform in global object
	global.platform = platform;
};
