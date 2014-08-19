Running WildOS
========

Once everything is [installed](installing.html) properly, you should be able to run WildOS.

WildOS consists of multiple processes: a server and a set of clients. The order in which they are run (and stopped and restarted) should not matter. For example, you can stop the server, restart it, and the clients will automatically reconnect to it. However, if things go really wrong, it's better to kill everything, start the server, and then the clients.


### Running the server and rendering clients ###

Make sure that you have set the `WALL` environment variable to the appropriate value, and that the `WildOS/tools` directory is in the `PATH`:

	% WALL=MyWall export WALL
	% PATH=`pwd`/tools:$PATH

The simplest way to run the WildOS server and rendering clients is to run the following command on the server machine:

	% wildos

This will run the server, kill any rendering clients and restart them. 
When quitting the server (with the Quit menu item or keyboard equivalent), the rendering clients will be killed.

The server will create two windows: one with lots of traces, the other depicting the wall display with the buttons `Restart` and `Shutdown` at the top. As the clients come up, the tiles in the server window become transparent (i.e. they turn form pink to blue), denoting that the server has established the connection. When a clients disappears, the corresponding tile turns pink again.

The `Restart` button kills any running clients and then restarts them.
The `Shutdown` button sends a message to the clients to quit them gracefully. If this does not work, you can use the `Stop` command in the `Platform` menu to kill them.

The `Applications` menu lists the available applications. Select an application to load it, or to unloaded it if it is already loaded (a checkmark shows which applications are loaded). Select the `Browser` application. A text entry field should appear in the main window and if you enter a URL, it should show up in the miniature wall as well as in the client windows. You can also run `wildos` so that the `Browser` application (and/or other ones) start automatically.


### The `wildos` command ###

The general format of the `wildos` command is as follows:

```
	% wildos [start] [-n|--no-clients] [-w|--wall config] [-c|--config path] [-p|--port number] [-d|--debug [0|1|2]] [-l|--log file] [app ...]
	% wildos stop
```

The first form runs the server and takes the following arguments:

* `-n|--no-clients` prevents the clients from being automatically started/stopped with the server;
* `-w|--wall <config>` specifies a different config file, overriding the `$WALL` setting;
* `-c|--config <path>` specified a colon-separated list of directories where to look up the config file;
* `-p|--port <number>` specifies a different port number than the one specified in the config file for the server to listen to;
* `-d|--debug [0|1|2|3]` specifies debugging level: 0 (no logging), 1 (logging window hidden), 2 (logging window open), 3 (logging redirected to the console);
* `-l|--log file` specifies the log configuration file (defaults to `logdefault.js`);
* `app ...` is an optional list of apps. The available apps, such as `Browser` are described later in this document.

The second form stops the rendering clients (but not the server).

For example :

	% wildos -w local -p 8088 Browser

uses the `local` config file to run server and clients on the local machine, uses port 8088 and loads the `Browser` app.


### Preference panel ###

When running `wildos` without any arguments, the settings recorded in the Preferences of the application are used. These settings are accessible through the `Preferences` item of the `Platform` menu in the platform UI window. They let you specify the same options as the `wildos` command-line arguments described above, except that they persist from one run to the next.

![Preference panel of WildOS](img/preference-panel.png)


### Running the web clients ###

The server application displays in the top-right corner a QRcode of the URL for web clients to connect to the server. Simply flash this code or enter the URL in your browser (smartphone, tablet or any computer with a recent Web browser). The URL is:

	http://<server>:<portnumber>/controller.html  

This should open an empty page (except for the title "WILD controller") then, assuming the Browser application is still running, it should display a text entry field to change the URL displayed in the browser of the tiled display:

![Screendump of the browser web controller](img/browser-controller.png)


### Shutting down ###

To quit the server, select the `Quit` command in its menu or use the usual quit keyboard shortcut (command-Q on Mac OS X). Unless the server was run with the `-n` flag, this will also kill the clients.

You can also click the `Shutdown` button or select the `Shutdown` command in the `Platform` menu to stop the rendering clients. Note that this will only work if they are still responding. If they are not, try the `Stop` command in the `Platform` menu, or kill them "by hand" with the following command:

	% wildos stop

(If you are running local clients, you can kill them in the usual way, e.g. by selecting their `Quit` command).

### Running renderers by hand ###

Normally, the renderers are started and stopped by the server, based on the commands specified in the config file.

If you need to run the renderers by hand, run node-webkit on the client machine with the , e.g.:

```
	% nw ~/WildOS/renderer <instancename>
```

The only required option is the name of the instance, as specified in the platform config file.
The full list of options is as follows:

* `-s, --server <name[:port]>` specifies the server and, optionally, port number to connect to (defaults to $SSH_CLIENT and the port number specified by `--port`);
* `-l, --local` runs the renderer locally: server is on localhost;
* `-p, --port <number>` specifies the port number on the server (defaults to 8080);
* `-h, --hostname <name>` 'Host name to send to server (defaults to the hostname returned by node.js);
* `-i, --instance <name>` 'Instance name (required);
* `-d, --debug [level]` 'Enable debugging (same as for the server above);
* `--log file` 'Log config file;

Note that additional options are processed by node-webkit.
Of particular interest is the option `--remote-debugging-port=9222` (you can use a different port number), which lets you debug the client from a remote machine by connecting to the URL `http://<client>:9222` from a Chrome browser.
