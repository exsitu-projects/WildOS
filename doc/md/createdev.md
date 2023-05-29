Creating Devices for WildOS
========

WildOS manages a tree of devices that describe the capabilities of the platform. 
The platform itself is the root of the device tree and is initialized from a json file.
Devices can be created and deleted dynamically, and a device can become available or unavailable at any time.
Other devices as well as applications can be notified of these changes.

Platform configuration file
-------

When WildOS starts, it loads a *plaform configuration file* and creates the devices described in this file.
The name of the file is defined by the `$WALL` environment variable (defaults to `'WILD'`).
The `.json` suffix is added to the name and the resulting file, e.g. `WILD.json`, is looked up in the `../configs` and `../../configs` directories relative to the server.

The platform configuration file must contain the following properties:

- `"type": "Platform"`, to tell WildOS that this is a platform description;
- `"name": "<platform name>"`, to give the platforme a name (used in )

The platform configuration file may also contain the following properties:

- `"inherit": "<other platform"`, to inherit the descripion in `<other platform>.json`: all properties in that file are copied in the current configuration;
- `"basedOn": "<other platform"`, to reuse the descripion in `<other platform>.json`: only those properties that are defined in the device are merged with those of the other platform;
- `"UI": "{ ... }"`, to describe the user interface of the platform, in particular the property `frame` describes the position and size of the window holding the user interface (see `WILD.json` as an example).

Finally the configuration file contains the devices that make up the platform.
Each device is a property whose value is itself an object with a similar structure: the required `type` and `name` properties, the optional `inherit`, `basedOn` and `UI` properties, and any subdevices. 
Devices can (and usually do) have device-specific properties, e.g. a device describing a tiled display will have properties describing the number of tiles, their size and organization, etc.

For a device to be successfully loaded, its `type` must correspond to a node.js module in the `../devices` folder.
More precisely, if the type is `MyDev`, there must be a file `../devices/MyDev.js` or a folder `../devices/MyDev/` containing at least either an `index.js` file or a `package.json` file describing the organization of the module.
This lets WildOS load the devices dynamically as needed by the platform.

The best way to understand configuration files is to look at the existing files in the distribution, and to create your own devices and add their configuration in the platform configuration file.


Loading devices and the device life cycle
--------

When a device described in the platform configuration file is loaded by WildOS, the device's configuration is created by combining the properties of that device in that file with those of any configuration it is based on or inherits from. This configuration (a literal object), is passed to the device constructor which, by default, stores it in the device's `config` property.
(Devices can also be passed a set of options, but this is currently unused.)

Devices can also be created dynamically, typically by other devices. In this case, the code creating the device is responsible for defining its configuration. Apart from that, devices created from the platform configuration file or dynamically are exactly the same.

The life cycle of a device is as follows:

- The device is first created and the platform emits the message `deviceCreated` for that device;
- The parent device adds this device to its list of children, which calls the device's `added` method
- Whenever the device decides that it can be used, it calls `deviceAvailable`, which emits an event by the same name;
- Similarly, when it becomes unavailable, it calls `deviceUnavailable`, which emits an event by the same name; Note that a device can become unavailable and available multiple times;
- When the device is removed from its parent and before it gets deleted, the method `removed` of the device is called; By default this method calls `deviceDeleted` to emit a message by the same name.

The events (`deviceCreated`, `deviceAvailable`, `deviceUnavailable`, `deviceDeleted`) are useful to track the changes to the device tree, for example to watch for a particular device to become available. The root of the device tree, i.e. the platform, is the emitter of all device-related events. To listen to these events, use the methods `onDeviceCreated`, `onDeviceAvailable`, etc. of any device.


Creating a new device class
--------

To create a new device class, say `MyDev`, you inherit from class `Device` or from an existing subclass. You typically redefine the constructor and the `added` method, which gets called when the device is actually added to its parent:

```
var MyDev = Device.subclass().name('MyDev')
	.fields({
		// device-specific fields
	})
	.constructor(function(config, options, events) {
		this._super(config, options, events);
		if (options)
			this.set(options);

		// Other initializations
		// ...

		// Notify of creation
		this.deviceCreated();
	})
	.methods({
		// Called when the device is added to the tree.
		added: function() {
			// Additional initialization 
			// ...

			// Notify availability
			this.deviceAvailable();
		},
	});
```

You can also redefine the method `removed`, which is called before the device is removed from the device tree, to clean up.
If you do redefine it, make sure to eventually call `this._super.removed()` or `this.deviceDeleted()` to signal that it is indeed removed. (In some cases, cleaning up the device is done asynchronously and therefore the notification must be sent when the asynchronous call completes).


Device-specific user interface
--------

Device drivers often need a user interface to control them and/or monitor them.
This can be done in one of two ways: a dedicated window on the server, or an embedded UI in the platform control window.
The latter is preferred in order to minimize the number of windows, but the former can be useful in special cases.

In order to add a device UI to the platform UI, use the following platform methods:

```
// Inject Javascript text or file
platform.injectJSText(text, id, cb);
platform.injectJSFile(path, id, cb);

// Inject CSS text or file
platform.injectCSSText(text, id, cb);
platform.injectCSSFile(path, id, cb);

// Inject HTML text or file
platform.injectHTMLText(text, elementId, how);
platform.injectHTMLFile(path, elementId, how);
```

The parameters are: 

- The `text` or the `path` to the file to be injected; note that the path is relative to the `server/devices/MyDev/content` folder, i.e. a device-specific folder that you must create;
- For Javascript and CSS injection, the `id` (in the sense of the DOM) of the element to be created; make sure to use a unique id, e.g. by prefixing it with the name of the device, so that you can easily remove the element when the device is removed;
- For Javascript and CSS injection, an optional callback `cb` to be called once the element is fully loaded; this is especially useful for Javascript injection if you need to perform other actions after the code has been executed;
- For HTML injection, `elementId` specifies in which element to inject the HTML tree and `how` specifies where: 
  - `replace` to replace the existing content of the element (if it exists)
  - `beforebegin` to insert before the element
  - `afterbegin` to insert at the beginning of the element
  - `beforeend` to insert at the end of the element (default)
  - `afterend` to insert after the element
  Note that `elementId` defaults to `platform`, i.e. the part of the platform UI that is designed to be extended.
  Note also that HTML code inserted this way will not run any embedded scripts. Use `injectJSText/File` for that.

If you need to create a separate window to host the user interface of your device, use a method like this and call it from the constructor or the `added` method:

```
	createUI: function() {
		var gui = process.mainModule.exports.gui;
		var url = '../devices/MyDev/content/mydevUI.html';	// URL is relative to the server/lib folder
		// See node-webkit documentation for available options
		var win = gui.Window.open(url, {
			width: 800,
			height: 600,
			toolbar: false,		
		});
		return win;
	},
```


Remote devices
--------

In many cases, your device works hand in hand with a client process running on the same or a different machine.
You can manage the connection with the client in one of two ways:

- Using web sockets, in which case you can use the websockets server built into WildOS;
- Using another protocol, such as OSC, in which case you are on your own to manage the connection.

We only cover the first case here, since the second one does not rely on any specific support from WildOS.

### Server side

To use a web socket connection to the WildOS server, your client must follow a simple protocol when connecting:

- The server sends the client a 'helloClient' message with the following server information: the name of the platformm (property `platform`) and the list of apps currently running in the server (property `apps`);
- The client responds with a 'helloServer' message with the following client information: the type of client (property `client`), which must be `"device"`, and the class of the device (property `device`);
- The server looks up if the platform has a device of this class; if it finds one, it calls the device's `clientConnected` method and sends the client the message `deviceReady`, otherwise it sends the client the message `quit`;
- The client sends the message `clientReady`, at which point applications are notified that there is a new client, and the client and server can communicate with their own protocol.

To summarize, the server side of the device only need to implement the method `clientConnected`:

```
	clientConnected: function(socket, server, clientInfo) {
		// Communicate with the client using `socket`, created by `server`.
		// Use information transmitted by the client in `clientInfo`
	},
```

If multiple clients may connect to the server for the same device, you will probably want to dynamically create children devices for each connected client. For example :

```
	clientConnected: function(socket, server, clientInfo) {
		this.addDevice(MyRemoteDev.create(socket, server, clientInfo));
	},
```

Also, you will probably want to share some state between the client and server, using the [sharing](sharing.md) facilities of WildOS.For example, you can create a sharer in the constructor of the device and set it up as a master of the device class. This way, the state of the device will be shared with the connected clients.

### Client side

WildOS provides a set of classes that are very similar to those of the server to create clients implementing devices communicating with the server using web sockets. These classes are currently in the folder `renderer/lib` and must be copied to your client code:

- `SocketIOServer.js` - A websocket connection to a WildOS server
- `ObjectSharer.js` - The client side of the object sharing protocol
- `SharingServer.js` - A subclass of `SocketIOServer` that supports object sharing
- `App.js` - The client side of an application (useful only if applications can run code in the client)

To implement a client, you typically create a subclass of `SharingServer` (or `SocketIOServer` if you do not need object sharing). 
In the `created` method, which is called when the connection is established, you implement the protocol described above:

- Wait for `helloClient` from the server;
- Send `helloServer` with client information, in particular the type of client (`device`) and the type of device (its class name);
- Wait for `deviceReady` to start operating;
- If you support applications, watch for `startApp` and `stopApp`.

While the above description is targeted at clients implemented with node-webkit, it is also possible to create a device client within a regular web browser. For this to work, your client code must use the `wildos.js` script in `server/content`. This script contains all the necessary classes (including those described above in this section) to write client code that communicates with the server over websockets and that can share state with the server. The `WebSockets` device shows an example of how to use it.
