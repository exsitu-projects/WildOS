// Log - logger
//
// Facilitate logging OO classes.
// This is used most often as follows:
//		var log = require('Log').shared();
//		log.message(...);
//
// Each `Log` object has three properties, `warn`, `error` and `fatal`, which
// lets use the same methods to issue warnings, errors and fatal errors:
//		log.warn.message('I told you');
//		log.error.message('You are having a bad day');
//		log.fatal.message('You cannot do that!');
//
// NOTE: newObject adds a property _name to the object if not already there, 
// and a property _nextId to the object's class (to assign unique names).
//
//	*** TODO: filtering options (class name, object name, method name, severity)
//	*** should be managed with white/black lists + UI to change it dynamically
//  *** Better formatting of errors in HTML

// node modules
var util = require('util');

// local module
var OO = require('./OO');

// Global logging functions.

// Calls global.log if defined (typically to log to an HTML window),
// otherwise to the console.
function log(status /*, varargs*/) {
	// process.title is set to 'browser' by browserify, to 'node' by node and node-webkit
  if (process.title != 'browser' && global.log && !global.logToConsole) {
    global.log.apply(this, arguments);
  } else {
		var args = Array.prototype.slice.call(arguments, 1);
		if (status.indent === 0 && status.level == 'Info')
			console.log.apply(console, args);
		else {
			var blank = '                                                                                ';
			var indent = blank.substring(0, status.indent*Log.indentSize);
			if (status.level != 'Info')
				indent += status.level;
                        args = [ indent + args.join(' ') ];
		  console.log.apply(console, args);
		}
	}
}

// Calls global.logIndent if defined.
// Useful for example to create nested boxes in the output.
function logIndent(indentLevel) {
	if (process.title != 'browser' && global.logIndent && !global.logToConsole)
		global.logIndent(indentLevel);
}

// The `Log` class.
var Log = OO.newClass().name('Log')
	.classFields({
		indentSize: 2,		// size of indentation
		indent: 0,			// indentation level
		stack: [],			// indent call stack, to check proper balancing
		sharedLogger: null,	// the logger returned by `Log.shared()`
		display: 'show',	// global logging style
		domains: {}			// for each domain, whether it is logged or not and which entries are logged or not
/*
		domains: {
			"MyClass": {
				display: 'open',
				style: {
					color: 'blue',
				},
				entries: {
					_object: '',
					_message: '',
					create: '',
					m1: 'closed',
					m2: 'skip',
					m3: {
						display: 'open',
						style: { color: 'red' }
					}
				}
			MyOtherClass: "open", "show", "closed", "hide", hidden", "skip",
		}
*/
	})
	.classMethods({
		// Load domain description
		loadConfig: function(file) {
			try {
				var config = require(file);
				if (config.display)
					this.display = config.display;
				if (config.domains)
					this.domains = config.domains;
			} catch(e) {
				console.log('domains file', file, 'not found');
			}
		},

		// Utility function to extract the elements from array `a` from index `from` (0 by default).
		// Useful to manipulate the `arguments` pseudo-array.
		slice: function(a, from) {
			if (! from)
				from = 0;
			return Array.prototype.slice.call(a, from);
		},

		// A shared logger, created lazily.
		shared: function() {
			if (! this.sharedLogger) {
				if (this.display == 'skip')
					this.sharedLogger = NoLog.create();
				else
					this.sharedLogger = Log.create();
			}
			return this.sharedLogger;
		},

		// A logger for a given domain.
		// The configuration for the domains is specified by loading a file (see `loadDomain`).
		logger: function(domainName) {
			var domain = Log.domains[domainName];
			if (! domain)
				domain = Log.display;	// Global default

			if (typeof domain == "string")
				// turn shortcut (e.g., myDomain: "closed") into proper config object
				domain = {
					display: domain,
				};
			
			if (domain.display == "skip" && !domain.entries)
				return NoLog.create();	// No logging at all (more efficient)

			if (!domain.entries)
				domain.entries = {};

			return Log.create(domainName, domain);
		},
	})
	.fields({
		level: 'Info',			// severity level (see `Warning` and `Error` below).
		inspectOptions: null,	// options to pass to util.inspect.
		domainName: null,		// name of domain for this logger.
		display: 'show',		// how to display this logger's output.
		entries: {}				// override display type for individual entries
	})
	.constructor(function(domainName, domain) {
		this.domainName = domainName || 'global';
		this.display = Log.display;
		if (domain) {
			this.display = domain.display;
			this.entries = domain.entries;
		}

		// `currentDisplay` is used to avoid extra argument to `log`. (Dirty hack...)
		this.currentDisplay = this.display;

		// Create the three loggers to issue warnings, errors and fatal errors.
		this.warn = Warning.create();
		this.error = ErrorLog.create();
		this.fatal = Fatal.create();
	})
	.methods({
		// Return a name for the object.
		objName: function(obj) {
			if (!obj)
				return 'null';
			return obj._name || obj.className();
		},

		// General logging function, not meant to be used directly.
		// Calls the global logging function.
		log: function() {
			// Turn the arguments into a real array.
			var args = Log.slice(arguments);

			// Flatten the last argument in the list if it's an array.
			// This is because `log` will be called most of the time
			// with the array of arguments of the original call as last argument.
			var lastArg = args[args.length-1];
			if (util.isArray(lastArg))
				args = args.slice(0, -1).concat(lastArg);

			log.apply(this, [{
				level: this.level,
				indent: Log.indent,
				display: this.currentDisplay,
				domain: this.domainName,
			}].concat(args));

			if (this.level == 'Fatal')
				process.exit(1);
		},

		logIndent: function(indentLevel) {
			logIndent(indentLevel);
		},

		// Return true if an entry should not be logged
		displayEntry: function(e) {
			var display = this.display;
			var entry = this.entries[e];
			if (entry)
				display = entry;

			this.currentDisplay = display;
			return (display !== 'skip');
		},

		// Log a message when entering/exiting method `m` of object `obj`.
		// Additional arguments are logged too.
		// Make sure to balance calls. If `exit` is called with `obj` and `m`
		// they will be checked against the corresponding call to `enter`.
		enter: function(obj, m) {
			if (! this.displayEntry(m))
				return;
			this.logIndent(Log.indent+1);
			this.log('>', this.objName(obj)+'::'+m, Log.slice(arguments, 2));
			Log.stack.push({object: obj, method: m});
			Log.indent++;
		},
		exit: function(obj, m) {
			if (! this.displayEntry(m))
				return;
			Log.indent--;
			if (Log.stack.length === 0) {
				this.log('Log::exit - empty stack');
				Log.indent = 0;
			} else {
				var top = Log.stack.pop();
				if (! obj) obj = top.object;
				if (! m) obj = top.method;
				if (top.object != obj)
					this.log('Log::exit - mismatched object');
				if (top.method != m)
					this.log('Log::exit - mismatched method');
			}
			this.log('<', this.objName(obj)+'::'+m, Log.slice(arguments, 2));
			this.logIndent(Log.indent);
		},

		// Log a message with arbitrary arguments.
		message: function() {
			if (! this.displayEntry('_message'))
				return;
			this.log(Log.slice(arguments));
		},

		// Log a message when creating `obj`. May add a property `_name` to it to identify it in future calls.
		// Additional arguments are logged too.
		newObject: function(obj) {
			if (! this.displayEntry('create'))
				return;
			if (! obj._name) {
				var cls = obj.classs();
				if (! cls._nextId) cls._nextId = 0;
				obj._name = obj.className()+'_'+cls._nextId++;
			}
			this.log('new', this.objName(obj), Log.slice(arguments, 1));
		},

		// Log a message when inside method `m` of object `obj`.
		// Additional arguments are logged too.
		method: function(obj, m) {
			if (! this.displayEntry(m))
				return;
			this.log(this.objName(obj)+'::'+m, Log.slice(arguments, 2));
		},

		// Log a message when handling event `e` received by object `obj`.
		// Additional arguments are logged too.
		// Beware that `this` does not work as expected inside a listener.
		// Declare `var self=this;` first and use `self` in the listener.
		event: function(obj, e) {
			if (! this.displayEntry(e))
				return;
			this.log(this.objName(obj), 'event', e, Log.slice(arguments, 2));
		},

		eventEnter: function(obj, e) {
			if (! this.displayEntry(e))
				return;
			this.logIndent(Log.indent+1);
			this.log('>', this.objName(obj), 'event', e, Log.slice(arguments, 2));
			Log.stack.push({object: obj, event: e});
			Log.indent++;
		},

		eventExit: function(obj, e) {
			if (! this.displayEntry(e))
				return;
			Log.indent--;
			if (Log.stack.length === 0) {
				this.log('Log::exit - empty stack');
				Log.indent = 0;
			} else {
				var top = Log.stack.pop();
				if (! obj) obj = top.object;
				if (! e) obj = top.event;
				if (top.object != obj)
					this.log('Log::exit - mismatched object');
				if (top.event != e)
					this.log('Log::exit - mismatched event');
			}
			this.log('<', this.objName(obj), 'event', e, Log.slice(arguments, 2));
			this.logIndent(Log.indent);
		},

		// Dump `obj` to level `depth` (the default is that of `util.inspect`).
		object: function(obj, depth) {
			if (! this.displayEntry('_object'))
				return;
			var opts = null;
			if (depth) opts = { depth: depth };
			this.log('object', this.objName(obj), util.inspect(obj, opts));
		},

		// Wraps the own methods of `cls` to log enter/exit
		spyMethods: function(cls, include, exclude) {
			var self = this;
			cls.listOwnMethods().forEach(function(name) {
				if (include && include.indexOf(name) < 0)
					return;
				if (exclude && exclude.indexOf(name) >= 0)
					return;
				if (! self.displayEntry(name))
					return;
				cls.wrap(name, function() {
					self.enter(this, /* cls.className()+'::'+ */ name, arguments);
					var res = this._inner.apply(this, arguments);	
					self.exit(this, /* cls.className()+'::'+ */ name);
					return res;
				});
			});
		},

		spyMethodsExcept: function(cls, exclude) {
			this.spyMethods(cls, null, exclude);
		},
		spySomeMethods: function(cls, include) {
			this.spyMethods(cls, include, null);
		},
	})
	;

// The `NoLog` class, used when logging is disabled.
var NoLog = Log.subclass().name('NoLog')
	.methods({
		enter: function(obj, m) {},
		exit: function(obj, m) {},
		message: function() {},
		newObject: function(obj) {},
		method: function(obj, m) {},
		event: function(obj, e) {},
		eventEnter: function(obj, e) {},
		eventExit: function(obj, e) {},
		object: function(obj, depth) {},
		spyMethods: function(cls, include, exclude) {},
		spyMethodsExcept: function(cls, exclude) {},
		spySomeMethods: function(cls, include) {},
	})
	;

// The `Warning` class is a logger that prefixes all messages by `Warning`.
var Warning = Log.subclass().name('Warning')
	.constructor(function() {
		this.level = 'Warning';
		this.display = 'show';
		this.entries = {};
	});

// The `ErrorLog` class is a logger that prefixes all messages by `Error`.
var ErrorLog = Log.subclass().name('Error')
	.constructor(function() {
		this.level = 'Error';
		this.display = 'show';
		this.entries = {};
	});

// The `Fatal` class is a logger that prefixes all messages by `Fatal` and then exits.
var Fatal = Log.subclass().name('Error')
	.constructor(function() {
		this.level = 'Fatal';
		this.display = 'show';
		this.entries = {};
	});

module.exports = Log;
