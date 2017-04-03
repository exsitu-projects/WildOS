Configuring WildOS
========

To adapt WildOS to your platform, you need to configure two things:

- The `walldo` script, which lets you run commands on all the clients at once. This is useful to install and manage WildOS clients;
- The platform configuration file, which describes the devices available to WildOS.

### Configuring `walldo` ###

This step is optional, but strongly recommended unless you have an alternative way of easily running commands on all the machines in your display cluster.

The script `walldo` (in directory `tools`) is a utility that runs commands on a set of client machines. Type `tools/walldo -h` to see a description.

Before using `walldo`, you need to configure it for your local setup. The recommended way to do this is to create a hidden directory `~/.walldo` and to create a configuration file in this directory. The configuration should contain at least the following lines:

	allHosts=(the list of client hostnames, separated by spaces and between parentheses)
	anyHost=a glob expression that matches all the host names
	DOMAIN=the domain name to add to each hostname
	SU=the user name to sudo to when using the sudo command

For our WILD wall, which has 16 machines called `a1 ... d4`, the configuration looks like this:

	allHosts=(a1 a2 a3 a4 b1 b2 b3 b4 c1 c2 c3 c4 d1 d2 d3 d4)
	anyHost=[a-d][1-4]
	DOMAIN=.wild.lri.fr
	SU=wild

Once the configuration file is created, the `WALL` environment variable must be set to its name for `walldo` to use it. If your config file is `~/.walldo/MyWall`, then you should set:

	% WALL=MyWall export WALL

An alternative to creating the configuration file is to edit the `walldo` script directly, but this is not recommended as the changes will be lost when you install a future version. If you insist on doing this, the changes are to be done at the beginning of the file (follow the comments).

A simple change you may want to do to the script even if you have created the configuration file is to change the default value when `$WALL` is not defined, at the very beginning of the script (the default value is `WILD`).

### Creating a platform configuration file ###

The `WildOS/configs` directory contains JSON files describing the set of devices making up a platform running WildOS.
The `$WALL` environment variable is used to fetch the corresponding configuration file under the name `WildOS/configs/$WALL.json`.

The best way to create a configuration file is to copy an existing one and edit it.
This section walks through the `WILD.json` file to describe its content. Another useful file to look at is `local.json`.

The configuration file is a hierarchy of objects, each describing a part of the platform.
Each object has a mandatory property: `type`. The root object must be of type `platform`.

The `WILD.json` configuration file defines a platform called `WILD room`:

- The `serverPort` property defines the network port number the server will be listening to (defaults to 8080);
- The `UI` property defines the position and size of the window created by the server to control the platform (`frame` property) and the zoom factor to apply to the miniature display of the wall in the control window;
- The `wall` property defines the tiled display (see below);
- The `controllers` property enables the use of web-based devices (tablets and smartphones, typically).

The `wall` property defines the geometry of the tiled display:

- The `tileSize` property defines the number of pixels of each tile (all tiles are assumed to be of the same size);
- The `bezelSize` property defines the number of pixels "hidden" behind the bezels. If you specify 0, the bezels will be ignored;
- The `numTiles` property defines the number of rows and columns of the tiled display (we assume a rectangular layout);
- The `tiles` property defines which machine runs which tile (see below);
- The `renderer` property can be set to `perTile` or `perHost`. The former means that one rendering client is launched for each tile, while the latter means that one rendering client is launched for each host (if the host runs multiple tiles, the client will create one window per tile). Currently, we use mostly `perTile` (in fact, `perHost` has not been tested recently);
- The `domain` property is optional, it is the domain name to add to the host names listed in the `tiles` array;
- The `env` property is optional. It lists per-instance values that can be used in the `start`, `stop` and `restart` properties below. If defined, it must be an object whose properties are the instance names and the values are a string (see example below);
- The `start` and `stop` properties are the shell commands to start / kill all the clients. Before execution, the following string substitutions take place: 
	- `%HOST%` is replaced by the client host name, 
	- `%PORT%` is replaced by the port number of the server, 
	- `%INSTANCE%` is replaced by the instance name to run on the client, 
	- `%ENV%` is replaced by the content of the `env` property for the instance, 
	- `%DEBUG%` is replaced by the debugging option of the server + the option `--remote-debugging-port=9222` to enable remote debugging of the clients (connect to `http://<client>:922` on a Chrome browser to access the debugging tools of the client),
	- `%LOG%` is replaced by the logging file option of the server,
	- `%VERSION%` is replaced by the version string of the renderer (as specified in the
npm package),
	- Process environment variables, e.g. `$PATH`, are replaced by their value,
	- The `%` and `$` signs can be protected by a backslash (which is specified as two backslashes in a JSON file);
- The optional `restart` property is a shell command to kill then start all the clients. If absent, it is replaced by calling `stop` then `start`;
- The optional `startDelay` property specifies a delay in milliseconds to separate the launch of each client. This can be useful when there are many clients and they do not reliable connect to the server.

The `tiles` property of the wall is a two-dimensional array (an array of lines, each line being an array of tiles). Each element of this two-dimensional array represents a tile and is itself an array with two or three elements:

- the name of the host running that tile,
- the name of the instance within that host, e.g. `L` or `R` if a host runs two clients to manage side-by-side tiles.
- the name of the window, e.g. `0` or `1`, if a client opens multiple windows.

Consider a setup where each host of the wall display manages two screens. In the example below, the wall display has 8 screens (2 rows of four), managed by 4 hosts. Each host runs two horizontally adjacent screens. The hosts are called `a1`, `a2` for the top row and `b1` and `b2` for the bottom row.

You may want to run two clients, per host each managing one screen. In fact, this may be required if the host is running Linux and the two screens are different displays in the sense of XFree. Alternatively, if the XFree configuration has a single display spanning the two screens, you may want to run a single client with two windows. (You could also run a single client and a single window per client spanning the two screens, but then you would not be able to specify the size of the bezel between the screens).

The first setup corresponds to this configuration:

```
	"numTiles": {"columns": 2, "rows": 2},
	"tiles": [
		[["a1", "Left"], ["a1", "Right"], ["b1", "Left"], ["b1", "Right"]],
		[["a2", "Left"], ["a2", "Right"], ["b2", "Left"], ["b2", "Right"]],
	],
	"env": {
		"Left": "DISPLAY=:0.0",
		"Right": "DISPLAY=:0.1"
	},

```

Note the use of the `env` property to specify environment variables to pass to each client, here the XFree `DISPLAY` name.

The second setup corresponds to this configuration:

```
	"numTiles": {"columns": 2, "rows": 2},
	"tiles": [
		[["a1", "Main", 0], ["a1", "Main", 1], ["b1", "Main", 0], ["b1", "Main", 1],
		 ["a2", "Main", 0], ["a2", "Main", 1], ["b2", "Main", 0], ["b2", "Main", 1]]
	],
	"env": {
		"Main": "DISPLAY=:0.0",
	},
```

It is even possible to have multiple clients per host, and multiple windows per client. Some tiled displays have multiple physical screens chained together and connected with a single DVI cable to the computer so that they are seen as a single display by the host. In order to account for the bezels of these screens, you would need to use multiple windows. If a host is running two or more such chained displays, you may need several instances. An example can be found in the `WILDER.json` config file.

Note that the `local.json` configuration file includes a property `layout` in the description of its tile display.
This property is used to map the names of the tiles to the position of their corresponding window on the screen.
When this property is not present, which is the normal case, each tile is run full-screen.

