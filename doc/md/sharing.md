Sharing Objects in WildOS
========

WildOS provides the ability to share objects between server and clients to facilitate de programming of distributed applications and devices.
Object sharing uses the Classy object model and in particular the definition of mixins and wrappers to modify a class after it has been created.
Object sharing supports a reactive style of programming, at least on the client side, by making it easy to react to changes in the state of a shared object.

Relevant Classy concepts
--------

A full description of the Classy object model is available on the [Classy website](https://github.com/mblinsitu/Classy].
Here we only introduce the concepts necessary to the rest of this document.

A **class** defines a set of **fields** and **methods** and can inherit from another class, as in classical object-oriented languages (Java, C++).
Instances share the methods and have their own copy of the fields (which are implemented as Javascript properties).

Unlike traditional object-oriented languages, it is possible to **wrap** a field or a method:
Wrapping a field adds callbacks when the field is read or written;
Wrapping a method adds callbacks before and after the method is called.
Together, this makes it possible to monitor an object and trigger side effects when its state changes or its methods are called.
Field wrappers and method wrappers can be specified in **mixins**.
Adding a mixin to a class wraps its fields and methods as specified by the wrapper.

Sharing objects concept
--------

Sharing objects with WildOS is achieved by first registering one or more classes with an `ObjectSharer` and then attaching the object sharer to one or more sharing clients (on the server) or to a sharing server (on each client). 

An object sharer does three things:

- Monitor the classes it manages and emit events (in the sense of node.js) when new objects are created;
- Monitor the instances of the classes it manages and emit events (in the sense of node.js) when the value of a field changes or when a method is called;
- Listen to events (in the sense of node.js) from other object sharers to create instances, change field values or call methods of the object.

A sharing client / sharing server object does two things:

- Monitor the network connection between client and server so that the link between object sharers is maintained across shutdowns;
- Relay events between the object sharers at each end of the connection so that the objects at both end are kept in a consistent state.

Object sharers
--------

An object sharer can manage one or more classes. For each class, you can specify which fields and which methods are monitored.
These can be specified as a list of field / method names in an array,
or the special values `'own'` and `'all'`. 
The former shares only the fields or methods defined locally in the class, 
while the latter also shares the fields and methods defined in the superclasses.

### Masters and slaves ###

An object sharer can act as a **master** or a **slave** for the classes it manages.
A master monitors the state changes and broadcasts them to the slaves, which update their local copies.
State changes performed by the slaves are *not* sent to the master, instead the slaves should use remote procedure calls.

This asymmetry greatly simplifies the management of conflicts (when different clients change the object's state in inconsistent ways)
because the remote procedure call serializes the changes to the master object.
Of course, this is at the expense of efficiency, although slaves can use optimistic updates:
they can change the state locally and issue the remote procedure call. 
If the master makes a different change, they will be notified of the new value.

To use an object sharer, create an instance of `ObjectSharer` and call `master` or `slave` to add classes to it.
For each class, you can specify which fields are shared.
For a master, you can also specify which methods can be called through remote procedure call,
and which local method calls should be notified to the clients and when.
For a slave, you can specify which methods can be called remotely by the master.
The notification of method calls on the master will execute the corresponding method on the slave if it is defined.

When a slave calls a method of the master, it can specify a callback function to be called when the result is received. The callback is called with the result as parameter, and `this` bound to the object that issued the call.
Note that at the moment a master cannot collect the results of the methods it calls on the slaves.

Here is a simple master that shares its fields `x` and `y` (specified by the special string `'own'`, which shares all the fields declared locally in the class) and allows the method `moveBy` to be called remotely.
When its `playSound` method is called, the slaves are notified of the call after it is executed locally.

```
    var Sprite = OO.newClass().name('Sprite')
        .fields({ x: 0, y: 0 })
        .methods({
            moveBy: function(dx, dy) {
            	this.x += dx; this.y += dy;
        	},
        	playSound: function(sound) {
        		// play the sound on the server
        		// (or do nothing if only the clients take care of it)
        	},
        });

    var sharer = ObjectSharer.create().master(Sprite, 'own', ['moveBy'], ['playSound'], 'after');
```

Here is a slave for that class:

```
    var Sprite = OO.newClass().name('Sprite')
        .fields({ x: 0, y: 0 })
        .methods({
            moveBy: function(dx, dy) {
            	// the body is empty because the call will be forwarded to the master.
        	},
        	playSound_after: function(sound) {
        		// play the sound
        		...
        	},
        });

    var sharer = ObjectSharer.create().slave(Sprite, 'own', ['moveBy']);
```

The slave shares the same fields and designates `moveBy` as a method to be called remotely.
Note that remote calls are performed asynchronously, so the returned value computed by the master, if any, is not forwarded to the slave.

The `playSound_after` method will be called when the `playSound` method is called on the master.
Note the addition of `_after` to the name, which serves two purposes: to distinguish between the before and after notifications,
and to make it clear that this method is called remotely.

### Types of shared values ###

In order to exchange values and method arguments between masters and slaves, those values must be serialized in some way so that they are valid across the network. Currently, WildOS supports the following value types:

- numbers (integer and floating point);
- strings;
- Classy objects shared by the sharer;
- arrays of these;
- other objects.

Numers are turned into strings. Shared classy objects are serialized using a unique internal object id that is added to the object as property `oid`. Arrays are serialized by the sequence of their serialized objects (recursively). Other objects are serialized by serializing each of their properties (recursively). On the receiving end, shared objects are mapped to the local copy, arrays are recreated as `Array` objects, and objects are created as literal objects (i.e. their prototype is `Object`).

Note however that currently, if a shared field holds an array or an object, changes to the content of the array or to the properties of the object are *not* tracked and therefore are not broadcast to the slaves.
For example, if you have the following class:

```
    var A = OO.newClass().fields({
        color: {r: 0, g: 0, b: 1},
        tags: [],
    })
```

and the fields `color` and `tags` are shared, the following changes will *not* be tracked and the clients will not see them:

```
    var a = A.create();
    a.color.r = 1;
    a.tags.push('cool');
```

The current workaround is to explicitly notify the sharer after updating the array or object:

```
    sharer.notifySet(a, 'color', a.color);
    sharer.notifySet(a, 'tags', a.tags);
```

A future version of WildOS may implement proper tracking of arrays and non-shared objects, but a complete and efficient implementation would require that the `Object.observe` Javascript feature be supported by node-webkit.

### Object lifecycle ###

An object sharer shares all the instances of the classes it manages *that are created after the class was added to the sharer*.
In other words, you need to add the class to the sharer before any instance is created.

Javascript uses garbage collection to reclaim unused objects, but there is no way to know when an object is reclaimed.
In addition, since sharers keep references to the objects they manage, the garbage collector would never reclaim them anyway.

In order to 'kill' an object, i.e. to tell the sharer that you do not need it anymore on the master side, the sharer adds a method `die` to the class.
So when you do not need object `o` anymore, simply call `o.die()`.
This will notify the slaves, which will also remove the object from their sharer.

On the slave side, there is no `die` method, the slave should issue a remote procedure call to the master and let the master kill the object.

An object that has been killed still exists, but its `oid` property is removed and it is therefore not considered anymore as a shared object.
If the sharer held the last reference to the object, it will eventually be garbage collected by the Javascript runtime.


Sharing server and Sharing clients
--------

The `ObjectSharer` class uses node.js events to notify changes and react to them. As such, it is insufficient to share objects across processes and machines. In order to send these events over the network, WildOS defines the class `SharingClient`, for use on the server, and `SharingServer`, for use on the clients.

Both classes manage one or more object sharers and relay the events sent by the sharers to the other end of the connection and the events they receive from the other end to the relevant sharer. Both classes can also limit the set of objects being shared across the connection to a subset of the instances of the classes they manage. This can be useful on the server, for example, when there are multiple clients and each client should only see a subset of the objects. (This is used in the `Surface` device to manage a tiled display: the server creates a tile object for each tile of the display, but only shares the relevant tiles with each client managing a part of the display).

Note that both `SharingClient` and `SharingServer` manage the state of the connection so that if the connection goes down, the client tries to reconnect at regular intervals (5 seconds) and the server waits for client connections. This means that the system should be reasonably resilient when the server or a client is shutdown and restarted.

### On the server ###

On the server, WildOS notifies the devices and applications when a client connects / disconnects by calling the methods `clientConnected` and `clientDisconnected` of the relevant device objects and of each application object. Your device or application class will typically redefine these methods to create a `SharingClient` and add the relevant sharer(s) to it:

```
    ...
    clientConnected: function(socket, server) {
    	// We assume that the sharer is in this.sharer
    	if (this.sharer)
	    	server.registerClient(socket, SharingClient.create(socket).addSharer(this.sharer));
	}
	...
```

In fact this is the default behavior for applications and therefore you have nothing to do if you are only sharing the application object. If you are sharing additional classes, you need to add these classes to the application sharer, and they will be picked up automatically by the sharing client.

### On a rendering client ###

The rendering client creates a single instance of `SharingServer` (or, rather, creates a subclass and instantiates it).
When an application is loaded, the application object creates a sharer and automatically adds it to the sharing server.
As above, you do not need to do anything special if you are just sharing the application object. 
Simply declare how you are sharing the class with `MyApp.shareState(...)`.

If you are sharing other classes, you need to add these to the application sharer with `MyApp.sharer.slave(...)`
and they will automatically be shared with the server.

### On a web-based client ###

The situation on a web-based client is similar to that of the rendering client:
The `App` class creates a sharer for each app and automatically adds it to the sharing server.
All you need to do is declare what you want to share (with `MyApp.shareState(...)`), 
and add other shared classes if any (with `MyApp.sharer.slave(...)`).


