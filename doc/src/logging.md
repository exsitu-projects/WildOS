Logging in WildOS
========

The `Log` module provides facilities to log information to the output console or to a node-webkit window.
In particular, it takes advantage of the Classy's wrapping to systematically log method calls and field value changes.

The most common way to access logging is to import the shared logger at the beginning of your scripts:

```
	var log = require('Log').shared();
```

You are free to create different loggers by instantiating the `Log` class returned by the module,
but in general using the shared logger should be sufficient.

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

### Spying ###

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
This provides a log of output and affects performance slightly.
Fitering facilities will be provided soon to alleviate these problems (see below).

### Log levels ###

All the above methods log info-level messages.
To log warnings, errors and fatal errors, use the same methods but apply them respectively to `log.warn`, `log.error`, or `log.fatal`.
For example:

```
    log.warn.message('You have been warned');
    log.fatal.message('Bailing out');
```

Warning and error messages are prefixed by `Warning` and `Error` respectively.
In addition, fatal errors cause the program to quit immediately.

### Filtering logs ###

Filtering capabilities are not yet available.
The plan is to support a configuration file that defines what is logged and how.
In particular, the HTML output can hide logging output so it is only shown upon demand.

