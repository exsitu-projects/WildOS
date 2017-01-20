// renderer - main module for the client
//
// 

// Command line options
var program = require('commander');

program
	.version('0.2.2')
	.usage('[options] [app ...]')
	.option('-l, --local', 'Run locally: server is on localhost')
	.option('-s, --server <name[:port]>', 'Server to connect to (defaults to $SSH_CLIENT)')
	.option('-p, --port <number>', 'Port number (defaults to 8080)', parseInt)
	.option('-h, --hostname <name>', 'Host name to send to server (defaults to the hostname returned by node.js)')
	.option('-i, --instance <name>', 'Instance name (required)')
	.option('-d, --debug [level]', 'Enable debugging')
	.option('--log file', 'Log config file')
	.option('--user-data-dir', 'user data dir for nw.js')
;

// Shared modules
var Log = require('Log');
var log = null;

// Internal modules - initialized after logging has been configured
var App = null; // require('lib/App');
var Renderer = null; // require('lib/Renderer');

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
	App = require('./lib/App');
	Renderer = require('./lib/Renderer');
}

// Quit the application.
exports.quit = function() {
	if (nw)
		nw.App.quit();
	else
		process.exit(0);
};

// The main function, called from the window created when node-webkit starts.
// This is so that we have access to that window during start-up (e.g., for logging).
//
exports.init = function (win) {
	// Process arguments: need to prepend 2 arguments for commander to work
	var args = ['nw', 'renderer'];
	for (var i = 0; i < nw.App.argv.length; i++)
		args.push(nw.App.argv[i]);
	program.parse(args);

	// Process logging and debugging options
	processLogDebugOptions(program);

	// Hide trace window when not debugging
	if (program.showWindows)
		win.show();

	// Backward compatibility: if no --instance flag and only one loose argument, take it as instance name
	if (! program.instance && program.args.length == 1)
		program.instance = program.args[0];

	if (! program.instance)
		program.instance = 'default';
	// Create and start the client.
	var renderer = App.server = Renderer.create(program).connect();

	// Make the App objects available to client code
	renderer.apps = App;

	// Hack to make the logging window available
	//App.logWindow = win;

	// Set log window title
	win.window.setTitle(renderer.host+'_'+program.instance);
	global.renderer = renderer;
	global.logWindow = win;

	return renderer;
};

