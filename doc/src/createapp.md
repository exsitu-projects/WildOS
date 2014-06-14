Creating an Application for WildOS
========

Note: In this document, we use `MyApp` as the name of the app you are creating.
We strongly advise that you look at the source code of existing applications to understand how they work.

A WildOS application typically provides a way to display some content and/or interact with some content.
Applications are often distributed, with some code running in the WildOS server and some code running in one or more clients.
This distribution is dynamic, because clients can come and go at any time.
To simplify the work of the developer, [object sharing](sharing.html) is often used to share state between server and clients.

### File system layout ###
WildOS applications must be stored in the `WildOS/server/apps` directory (or the `WildOS/apps` directory, but this has not been tested).
Each application must conform to the format of a node module, i.e. it must be either:

- A single file `MyApp.js`;
- A directory `MyApp` with at least a file called `index.js`;
- A directory `MyApp` with a `package.json` file that includes a property `main` holding the name of the main file.

Whichever way you decide to implement the package, we call this file (`MyApp.js`, `MyApp/index.js` or the file specified in the `main` property of the `MyApp/package.json`) the app's *main file*. 

If the application has client-side code running in a web browser, this code must be in the `content` directory under the application's directory. 

If the application has client-side code for rendering on a tiled display, this code must be in the `WidOS/renderer/apps` directory (or the `WildOS/apps` directory, but this has not been tested). Like server-side code, the format must conform to a node package with the same name as the application.

Other kinds of clients may have different requirements for implementing the client-side part of the application.

### Application class and instance ###
On the server, the app's main file must export a single object: the class implementing the app, which must be a subclass of `App` and have the same name as the app. The absolute minimum code for an application is therefore:

```
    var App = require('../../lib/App');         // Get the App class to inherit from it
    var MyApp = App.subclass().name('MyApp');   // Create the app's class. The name must be that of the app.
    module.exports = MyApp;                     // Export the app's class
```

### Application lifecycle ###
When your application is loaded into WildOS, an application instance is created by creating an instance of the exported class (`MyApp.create()`), and it's `start` method is called. 
You can initialize your application either in the constructor or in this method. 
In many cases you need information about the platform to complete initialization. 
To this end, WildOS also calls the `initPlatform` method with the platform as argument.
Since the platform is needed to access almost anything in WildOS, most applications will store a reference to the class in the class:

```
    MyApp.methods({
        ...
    	initPlatform: function(platform) {
    	    this.platform = platform;
        },
        ...
    })
```

Before unloading an application, WildOS calls its `stop` method, so you can perform any necessary cleanup.

### Application controller UI ###

Many apps want to have some user interface in the main WildOS window to control them.
This is possible by injecting code in the platform control window as follows:

```
    // typically done in initPlatform:
    platform.injectJSFile('file://'+this.__dirname+'/ui.js');
```

The injected code is in the file `ui.js`, in the same directory as the application's main file.
Note that `injectJSFile` can take two additional optional arguments:

- an id to set on the `<script>` tag created by `injectJSFile`. 
  This is useful to delete the element when the app is unloaded (see below).
- a callback to be called when the script is finished executing.
  This is useful if you need to access variables or DOM elements created by the script.

The platform also provides methods to inject CSS code and HTML code into the platform UI, similar to `injectJSFile`.

Since the platform UI is part of the same process as the server, it has direct access to its objects (this is the beauty of node-webkit).
In particular, the injected code can directly access the `platform` global variable.
From there, it can get acccess to the application object as follows:

```
   var app = platform.apps.getApp('MyApp');
```

The platform UI is organized in three top-level divs, with respective ids `top`, `platform` and `bottom`.
Application typically create divs under these sections, with an id derived from the application name (to avoid name clashes).
The id is used to remove the div when the application is unloaded.
Some devices create divs inside the `platform` div, in particular the tiled display device creates a div with id `wall`.
The platform UI uses jQuery so your code can use it and does not need to load it.

The application UI control code that is injected into the platform UI typically features two functions, `startMyApp` and `stopMyApp`:

```
    function startMyApp() {
    	...
    	// create a div for the app
    	$('#top').append('<div id="MyApp">My app's stuff: </div>'););
    	...
	}

	function stopMyApp() {
		// remove what we created
		$('#top').remove();
	}

	startMyApp()
```

`startMyApp` creates the UI and is called by the script itself.

`stopMyApp` deletes the UI and is called from the application's `stop` method as follows:

```
    MyApp.methods({
        ...
        stop: function() {
       	    ...
       	    if (this.platform.window)
				this.platform.window.window.stopMyApp();
        }
        ...
    })
```

(`this.platform.window` is the node-webkit window object for the window holding the platform UI,
`this.platform.window.window` is the browser window object where the injected code is loaded,
which is why the `stopMyApp` function is defined).

### Sharing objects with clients ###

The documentation on [object sharing](sharing.html) explains how to set up sharing and how to use, in particular by wrapping object fields in order to react to updates. Since applications almost always share state with clients, the `App` class defines a class method to simplify the process:

```
    MyApp.shareState(/*fields: */ 'own', /*allow remote calls: */ null, /* notify: */ null)
```

creates a sharer, stored in `MyApp.sharer` and sets it up as master.
The arguments specify which fields to share (defaults to `own`), which methods can be called remotely (defaults to none), and which method calls should be notified to the clients (defaults to none). This is all you need to do to enable sharing.

If your application defines other classes that also share their state with the clients, you can simply add them to this sharer (i.e., you do not need to create a different sharer):

```
    MyApp.sharer.master(MyOtherClass, /*fields: */ 'own', /*allow remote calls: */ null, /* notify: */ null)
```

### Client-side code for rendering on a tile display ###

If your application renders content on the tiled display, you probably need to write client code for the renderer.
The layout and setup is very similar as for the server: the client module must define and export a class called `MyApp` that inherits from `App`.
(Although the names are the same as on the server, the implentations differ).
When the application is loaded, an instance of the class is created and its `start` method is called.
When the application is unloaded, it's method `stop` is called.

The rendering client has no notion of platform, instead it manages a set of rendering *tiles*, which are full-screen HTML windows.
To monitor the tiles, you can redefine the app methods `tileReady` and `tileGone`, which are called with a tile object each time a tile becomes available or unavailable.

The tile object holds information such as the size (`width`, `height`) and position within the tiled display (`originX`, `originY`).
This is often needed to create a mosaic of images that together represent a larger image.

The tile also holds, in the `window` property, the node-webkit window object for the tile.
This gives you access to the content of the rendering window:

```
	MyApp.methods({
		tileReady: function(tile) {
			tile.window                       // the node-webkit window
			tile.window.window                // the HTML window
			tile.window.window.document       // the HTML document in the tile
			tile.window.window.location.href  // the URL of the HTML document in the tile
		}
	})
```

Some applications will load their own content in the tiles by changing the tile window's URL.
Other applications will instead inject code into the existing content of the tile.
In both cases, your application probably needs to know when the window is reloaded:
in the first case, you want to know when the content is actually done loading before proceeding,
in the second case, you need to re-inject your code when another application loads a different page.

This can be done by setting a handler as follows:

```
	MyApp.methods({
		tileReady: function(tile) {
			var self = this;
			tile.window.on('loaded', function() {
				// do what is needed once the window is done loading
				// use self instead of this to access the app object
				self.initContent(tile);
			});
		}
	})
```

Unlike the `Platform` class of the server, the `Tile` class does not (yet) provide function to inject Javascript, CSS or HTML code into the page.
Since the page may not have jQuery loaded, you need to use native DOM functions to inject code (of course, you can start by injecting jquery.js).
Here is an example of how to create a div:

```
	MyApp.methods({
		initContent: function(tile) {
			var doc = tile.window.window.document;
			var el = doc.createElement('div');
			// set element's attributes and content
			doc.body.appendChild(el);
		}
	})
```

In order for you application to use the client-side rendering code, it must be installed on the rendering client machines.
An easy way to do this is to run

```
   make sync
```

in the `server` directory. This will use `walldo` and `rsync` to synchronize the WildOS files on the rendering clients with the server.
Once the clients are updated, you should stop and restart them by clicking the `restart` button in the platform control interface,
or by running `make start` in the `server` directory.

### Client-side code for web controllers ###
Web-based clients are often used to provide a mobile interface for an application, accessible through a smartphone or tablet.
We call these web controllers.
The `WebControllers` device manages an arbitrary number of such clients. Each client is notified of applications being loaded and unloaded, and loads/unloads a controller interface for this application, if the application has defined it.

To support a web controller, you must create a file `content/controller.html` under you application directory (on the server).
The web server bundled with the WildOS server creates a route to serve files in the app's `content` subdirectory at the URL `MyApp`. The above file will therefore be accessible by a web client as `http://<server-address>:8080/MyApp/controller.html`.

This file is not actually loaded directly into the web controller. 
Instead, the web controller loads the page `http://<server-address>:8080/controller.html`, which provides a shell to dynamically load and unload the web controllers of the active applications. This shell also defines a simplified version of the `App` class, to you can define your app class and share its state with the server as for the rendering client.

You app's `controller.html` file is therefore typically a snippet of HTML code that defines the controlling interface, and a script that defines your app's class. Similar to the server and rendering client, the methods `start` and `stop` are called when the app is loaded / unloaded. However, unlike the server and rendering client, the script should also instantiate the class:

```
    var MyApp = App.subclass().name('MyApp')
        .methods({
        	...
        })
        .shareState('own');

    var myApp = MyApp.create();
```

When your application is loaded, the `WebControllers` device manager notifies all the web controllers, which then injects the app's `controller.html` file (if it exists) into a new div in the web interface. When the app is unloaded, the div is removed, with all its content. Therefore you usually do not have to do anything special in the app's `stop` method.
