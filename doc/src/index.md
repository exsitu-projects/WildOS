Title: Overview

WildOS - [%Title]
========

This documentation describes the architecture of WildOS and how to create applications and devices.

### About node-webkit ###

WildOS is programmed entirely in Javascript using [node-webkit](https://github.com/rogerwang/node-webkit). Node-webkit is an open-source project developed at Intel to support the development of desktop applications using web technologies. Concretely, it is a merge of [node.js](http://nodejs.org), which is popular to write back-end software, including web servers, and [Chromium](http://www.chromium.org/), the core part of the Chrome web browser. 

On the one hand, the node.js part of node-webkit gives access to an efficient reactive engine and a large collection of modules, including for accessing the file system and other operating system resources that web browsers do not have access to. On the other hand, Chromium provides an efficient and cutting-edge rendering engine of web content without all the security overhead of a complete web browser. Finally, by "welding" together node.js and Chromium in a single process, we avoid the typical overhead of web applications where the server and client are on different machines or in different processes and communicate over HTTP network connections. In fact, even though node-webkit runs node.js code and Chromium code in separate virtual machines, each has direct access to the other. In practice, objects and functions created on one side can be used on the other with no overhead (see however the [node-webkit documentation](https://github.com/rogerwang/node-webkit/wiki/Transfer-objects-between-window-and-node) for a few pitfalls). One immediate benefit is that one can use `require` to import any node.js module in Javascript code running inside a Chromium web page (many web developers would love to do that in their web applications!).

### Architecture ###

WildOS is made of one central server and zero or more clients typically running on other computers. Clients communicate with the server through websockets, which are full-dupleix sockets running in the Web environment. Other protocols could be added to WildOS if needed, such as OSC running on UDP.

The WildOS server manages a set of **devices** and a set of **applications**. The set of devices constitutes the **platform** on which the applications run. Some devices are distributed: part of them are run by a client process connected to the server. For example, to display content on a large cluster-driven wall display, rendering clients are run on the cluster computers. In the server they are represented by a device called a ``Surface``.

Similarly, applications are distributed between the server, where the core functionality of the application takes place, and clients, which include those running the devices described above. The choice of running application code in the devices may seem counter-intuitive, or even terrible. Traditionally, device drivers run low-level code and provide an API that applications can use. In our case, devices can be high-level and for architectural as well as performance reasons, running application code in the device may provide a better division of labor. For example, deciding how to distribute the work to display a complex content on a tiled wall display is not trivial, and developers will want the flexibility of controlling what runs where. In practice, this does make application development more complex. Only time will tell whether this was a good idea or not. Maybe some new abstractions will emerge from this experiment and lead to new ways of developing applications for distributed systems.

One abstraction that is heavily used in WildOS, and was inspired by our previous work on the [Substance framework](https://www.lri.fr/perso/~mbl/WILD/publications/index.html#substance-chi11), is the notion of distributed objects, or more accurately **shared objects**. Concretely the WildOS server manages a set of objects, whose state can be replicated on the clients. Clients can easily attach behaviors to the change of state of their shared objects. WildOS also supports remote procedure calls and automatic notification of clients when the server calls methods of shared objects. However the emphasis is on sharing state and adding local behavior, as in Substance's *data-oriented programming*, so using RPC and notification should be limited to cases where it is necessary or simpler.

Finally, since WildOS is a distributed system, we try to make it resilient: if the server crashes, or if a client crash, the rest of the system should "behave" and continue to work the best it can, or at least start working again when the crashed part is back. In practice, if a client crash, the server continues without it and will be happy to take it onboard when it's back. If the server crashes, clients wait for it to come back by trying to connect to it at regular intervals. Following the same philosophy, WildOS devices and applications can be started, stopped and restarted at any time, again without causing major difficulty.

### Object Model ###

Javascript is not an object-oriented programming language. Unlike languages such as Java, C++ or Objective-C, Javascript does *not* support classes. Rather than the class-instance paradigm of traditional object-oriented languages, Javascript is based on the notion of **prototype**. Each object has a collection of **properties**, each property can hold a primitive value (such as an integer), a reference to an object, or a function (which is, in fact, a particular type of object). Each object also has a **prototype**: a special link to another object so that when referencing property `p` of object `o`, as in `o.p`, if the property does not exist in `o`, it is looked up in its prototype, and so on up the prototype chain (which eventually stops at the `Object` prototype). So unlike object-oriented languages where classes hold methods and objects hold state and a link to their class to look up their methods, a prototype-based language such as Javascript only has objects, each of which can have state as well as methods (i.e., functions)[^Self].

[^Self]:For more information on prototype-based languages, see the seminal work on the [Self programming language](http://selflanguage.org/).

While this provides tremendous flexibility, most programmers are used to the traditional object-oriented model where classes are clearly distinct from objects and where classes can inherit from each other. There are many object-oriented frameworks for Javascript (and indeed a future version of the language will feature [native classes](http://wiki.ecmascript.org/doku.php?id=strawman:maximally_minimal_classes) - in fact the word `class` is already a reserved keyword). WildOS uses [Classy](https://github.com/mblinsitu/Classy), a framework that I have developed because none of the ones I looked at provided the feature set I needed.

In short, Classy lets you define **classes** with a set of **fields** (we purposefully do not call them properties to differentiate them from Javascript properties, even though they are in fact Javascript properties) and a set of **methods**. Classes can also have **class fields** and **class methods**. Classes can **inherit** from other classes. Classes can also have one or more **constructors**. When a class inherits from another class, its constructors and methods can "call to super", i.e. can call the same constructor or method in the parent class with the construct `this._super(args)`.

In addition to this basic, fairly standard object-oriented model, Classy features more funky capabilities: field wrappers, method wrappers and mixins. **Field wrappers** let you capture any access to a field so as to affect the way it is read/written, and/or generate side effect. **Method wrappers** are similar for method calls, letting you add code executed when a method is called. Finally, **mixins** add capabilities (fields, methods and wrappers) to an existing class without creating a new class that inherits from it. Mixins are more powerful than multiple inheritance (which Classy does *not* feature). 

WildOS uses Classy and its advanced features extensively. One use is for logging, to automatically trace method calls and access to fields. Another one is for sharing objects between server and clients.

See the [Classy Documentation](https://github.com/mblinsitu/Classy) for more details on the framework.  
See the [Logging in WildOS](logging.html) page for details about logging.

### Shared Objects Model ###

The `ObjectSharer` class is designed to monitor a collection of objects of a set of classes, to notify this activity by sending events (typically to one or more remote clients), and to listen to such events (typically on a client) to synchronize local copies of the objects. `ObjectSharer` adds a mixin to the monitored class to achieve this behavior, so any class can be monitored without it doing anything special. An `ObjectSharer` can manage all the objects of a given class or just a subset ofthem. It can monitor and synchronize all of the objects' fields or a subset of them, and all of its method calls or just a subset of them. This gives great flexibility to adjust the amount of sharing.

In order to communicate the changes between server and clients, WildOS uses networking objects: a `SharingClient` object on the server for each connected client, and a `SharingServer` object on each client. Both use web sockets to communicate. Each such networking object holds a set of object sharers describing which classes and objects are shared and how. Distributed programming in WildOS therefore amounts mostly to creating classes, registering them with object sharers and attaching these object sharers to networking objects. Once this "piping" is established, object states synchronize automagically between server and clients, even when they go down and come back up.

See [Creating Devices for WildOS](createdev.html) for more details.

### Platform and Devices ###

WildOS loads a description of the platform it is running on from a JSON configuration file. This file describes the set of devices that constitute the platform. Each such device can contain more devices. For example, a `Surface` device represents a tiled display, and contains one device per tile. Devices can be added and removed dynamically, and can become active or inactive. For example, a tile of the wall display can be inactive when the client running it is down.

Some devices communicate with clients. For example, a tiled wall display is typically run by a display cluster where each computer runs one or more tiles of the display. Devices can use the shared objects model to share state between server and clients. For example, the description of the tiles loaded from the platform configuration file can be shared with the clients running the tiles.

Devices have access to the platform user interface controller, which runs on the server and lets the user control and monitor the state of the system. Typically, devices will load additional HTML/CSS/Javascript into the controller's user interface to display the configuration and status of the device, such as a miniature representation of the wall display.

Devices can run application code when an applications is started (see below). This makes it possible to run a distributed application between the server and the clients running the devices. For example, an application that needs to display content on the tile display can run the rendering part in the clients that manage the tiles.

See [Sharing Objects with WildOS](sharing.html) for more details.

### Applications ###

Applications are loaded dynamically when the server starts up (if specified on the command line) or later when loaded by the user through the platform controller. Each application is the single instance of its class (a.k.a. a singleton class). Most applications have their core running in the server and their input and display run in clients associated to the platform's devices. 

Applications will typically use the shared object model to share their state between the server and these clients. This makes it easy, among other things, to create multi-user applications: each user holds a device running a client, and their states are synchronized. Since the architecture is centralized, solving conflicts, e.g. when two users want to modify the same object. is easy: clients do not change state locally, they use remote procedure calls or separate objects to notify the server, which arbitrates the conflict.

Since an application can be loaded and unloaded at any time, it must clean up after itself when unloaded. This is actually quite tricky because Javascript does not let you "kill" objects: all references to them must be removed for them to be eventually garbage-collected. A future version of Classy will support object destructors and tracking of class instances to facilitate this process. (Object destructors will not actually destroy objects, but will make essentially mark them as such and disable them, so that references to them can be more easily tracked and removed).

See [Creating an Application for WildOS](createapp.html) for more details.

### Directory Structure ###

The WildOS distribution is organized as follows:

* `configs/` - Platform configuration files
    * `content` - Optional platform-specific HTML5 content
* `doc/` - Documentation
    * `assets/` - CSS, Javascript and font files for rendering the documentation
    * `img/` - Images included in the documentation
    * `src/` - Source files of the document (in Markdown format)
* `Makefile` - Type `make` to see the relevant targets
* `ReadMe.html` - Instructions to install and run WildOS (HTML)
* `ReadMe.md` - Instructions to install and run WildOS (MarkDown)
* `renderer/` - Rendering client for tiled displays
    * `apps/` - Application code for the renderer
    * `content/` - HTML5 content for the renderer
    * `lib/` - Renderer source files
    * `node_modules/` - Node.js modules for the renderer (created by `npm`)
    * `package.json` - Node-webkit manifest file for the renderer
    * `restart` - Script to kill and restart the renderer(s) on the current machine
    * `slides/` - Folder created only on the client machines for the SlideShow application
* `server/` - WildOS server
    * `apps/` - WildOS applications
        * `Browser/` - Display and pan/zoom any web page on the tiled display
        * `Cursors/` - Control multiple cursors on the tiled display
        * `SlideShow/` - Show large images on the tiled display
    * `content/` - HTML5 content for the server
    * `devices/` - WildOS devices
        * `Surface/` - Device to manage a tiled display
        * `WebControllers.js` - Device to manage web-based clients
    * `lib/` - Source code of the server
    * `node_modules/` - Node.js modules for the server (created by `npm`)
    * `package.json` - Node-webkit manifest file for the server
    * `WildOS.js` - Main file of the server
* `shared/` - Source files used by both the server and clients 
* `slides/` - Slide library (large images cut into tiles, created by the separate `tilecutter` application) 
* `TODO.txt` - Things to do
* `tools/` - Various useful scripts and tools
* `wall-rsync` - Filter used by `walldo rsync` to only copy the renderer to client machines

