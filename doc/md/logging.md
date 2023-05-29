Logging in WildOS
========

This page describes how to access logged data when running WildOS and how to add logging information in your code.

## Viewing logs ##

For logging to be available, WildOS must be run in debug mode, i.e. with argument `-d|--debug [0|1|2]`.

- `-d 0` or omitting the option is the default: no logging occurs;
- `-d 1` or simply `-d` enables logging but the window showing the log is hidden; To open it click the `Log window` button in the platform control window;
- `-d 2` enables logging and opens the log window.

When running in debug mode, a configuration file is used to define what to log and how.
By default, the configuration file in `logdefault.js`, but a different file can be specified with the `-l|--log <file>` argument. See the section below to create your own configuration file.

The log entries in the log window are colored according to the class or file that issued them and to their type:
the class or file determine the background color, while the type determines the text color (black for Info, orange for Warning, red for Error, brown for Fatal).
Log messages that are nested are surrounded by a box. Clicking such entries open/closes the box to make it easier to browse the log.

In addition to accessing the log window of the server application, it is possible to view the logs of the rendering clients.
Right click on a tile in the visualization of the tiled display and select `Show remote log` in the menu.
This will open a window with the remote log and clear the remote log. Subsequent calls to the menu (or clicking the `Append remote log` at the end of the window) retrieve the remote log and append it to the window.
Note that for performance reasons, the remote log is not updated in real time.

### Configuring loggers ###

The log configuration file is a Javascript module that must export a single literal object with two properties:

- `display` specifies the default logging mode: `show` to show log entries, `closed` to show log entries but in closed state, `skip` to suppress log entries;
- `domains` specifies the logging mode at the level of each domain and each entry of a domain.
A domain is a class, or in some cases a file name; an entry is a method, function or event name.

The example below illustrates the various possibilities:

```
	module.exports = {
		display: 'closed',		// by default, log in 'closed' modes (uses less space)
		domains: {
			MyClass: 'skip',	// do not log MyClass
			MyOtherClass: {		// log MyOtherClass with some special cases
				display: 'show',	// log in 'open' mode
				entries: {			// except these entries:
					myMethod: 'skip',	// skip myMethod
					_object: 'closed',	// special entry for log.newObject
					_message: 'closed',	// special entry for log.message
					...
				}
			}
			...
		}
	}
```

At present, the colors associated with each domain cannot be easily modified:
you need to edit the CSS in the files `server/content/server.html` for the server log, `server/content/log.html` and `renderer/content/renderer.html` for the renderer log.
This may be improved in a future version.

## Programming with loggers ###

The `Log` module provides facilities to log information to the output console or to a node-webkit window.
In particular, it takes advantage of Classy's wrapping to systematically log method calls.

Adding loggers to your own code is very simple.
In most cases, all you need to do is to create a logger for your class, and tell it to trace the methods of your class.
If needed, you can sprinkle your code with additional traces where needed.

### Creating a logger ###

The most common way to access logging is to create a logger at the beginning of each of your scripts:

```
	var log = require('Log').logger('myDomain');
```

`'myDomain'` is typically the name of the class defined in the file, but it can be anything.
It is used by the logging configuration (see below) to control which messages are logged.

You are free to create as many loggers as you want by instantiating the `Log` class returned by the module,
but in general using one logger per file, or per class, should be sufficient.
You can also use a shared logger, with no attached domain:

```
	var log = require('Log').shared();
```

### Using a logger ###
Most logging methods take a variable number of arguments holding arbitrary values.
These are printed according to their type: 

- numbers and strings are printed as expected;
- Classy objects are printed simply by printing their name. 
  If they don't have a name, they are automatically assigned a unique name composed
  of the name of their class and a number;
- Arrays and non-classy objects are printed using node.js' `util.insect`.

WildOS redirects logging output as soon as possible to an HTML window.
(Until the window is created, output goes to standard output).
In the HTML output each message is a div and can be closed (i.e., reduced to its first line) or opened by clicking it.

### Simple messages ###

`log.message(...)` is the simplest way to log any message and set of values.

`log.newObject(obj, ...)` logs the name of a newly created object. It is normally used in constructors.

`log.method(obj, method, ...)` logs the receiving object method name and extra arguments. It is normally used within methods.

`log.event(obj, e, ...)` logs the object handling the event, the event name and extra arguments. It is normally used in an event handler.

### Enter/Exit message ###

The following methods should be bracketed to provide proper indentation (and, on the HTML output, nesting):

`log.enter(obj, method, ...)` / `log.exit(obj, method, ...)`, used when entering / exiting the method.
The object and method arguments are not required at exit. 
If present they are checked against those specified at entry and if they do not match an additional message is issued to show the mismatch.

`log.eventEnter(obj, event, ...)` / `log.eventExit(obj, event, ...)`, similar to the above for event handlers.

### Spying methods ###

Adding logging instructions by hand is cumbersome, especially to systematically log enter/exit of methods.
The logger supports `spying` of methods of Classy objects so that all calls to the specified methods are logged.
This is achieved with the following call:

```
    log.spyMethods(MyClass);
```

wraps the methods of the class so that they automatically issue `log.enter` and `log.exit` messages.

If you want to log only some methods or all methods except a few, you can also use:

```
    log.spySomeMethods(MyClass, [list of method names to spy]);
    log.spyMethodsExcept(MyClass, [list of method names to not spy]);
```

All WildOS classes are currently spied to facilitate debugging.
This provides a log of output but may affect performance slightly.
Configuration facilities (see below) can help alleviate these problems, since spying the methods of a class for which logging is disabled does not incur any overhead.

### Log levels ###

All the above methods log messages of type 'Info'.
To log warnings, errors and fatal errors, use the same methods but apply them respectively to `log.warn`, `log.error`, or `log.fatal`.
For example:

```
    log.warn.message('You have been warned');
    log.fatal.message('Bailing out');
```

Warning and error messages are prefixed by `Warning` and `Error` respectively.
In addition, fatal errors cause the program to quit immediately.

