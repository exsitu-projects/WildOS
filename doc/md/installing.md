Installing WildOS
========

WildOS runs on Mac OS X and Linux (currently tested under Ubuntu).
It should also run on Windows since it uses only portable technologies but this has not been tested.

Before installing WildOS
--------
First you need to have [node.js](http://nodejs.org) and [node-webkit](https://github.com/rogerwang/node-webkit) (also known as `nwjs`) installed both on the machine where you will be running the WildOS server and on the machines where you will be running clients, such as the display cluster. (You do not need to install anything on those machines where the WildOS clients will run in a regular browser, such as tablets and smartphones). 

### Installing node.js and npm ###

If `node.js` is already installed on your machine, make sure that it is a recent version (at least 0.10.28) by typing

	% node --version

If node.js is not installed or the version is too old, follow the instructions on the [node.js](http://nodejs.org) web site.

`npm`, the node package manager, must also be installed. Depending on your platform, it is installed together with node.js or must be installed separately.

### Installing node-webkit ###

To install `node-webkit`, go to the [node-webkit](https://github.com/rogerwang/node-webkit) web site and download the version for your OS. Do **not** install node-webkit with the npm package 'nodewebkit' as this does not work well. 

WildOS requires version 0.9.2 or later of node-webkit.

On Linux, node-webkit is an executable called `nw` and should be accessible in the `PATH`.
The simplest way to install is to create a symbolic link to `nw` in `/usr/local/bin`.

On Mac OS X, node-webkit is an application and should be copied to the standard `Applications` folder.
If it is installed elsewhere, edit the `tools/nw` script so that `NWAPP` points to it. 
This `nw` script is designed to be used on the command line in the same way as on Linux.

Installing the WildOS server
--------
After you have checked out WildOS from the [GitHub repository](https://github.com/exsitu-projects/WildOS) or the [BitBucket repository](https://bitbucket.org/mblinsitu/wildos), you need to finalize the installation as follows:

	% cd WildOS/server
	% npm install  

This will create a `node_modules` directory in the `WildOS/server` directory and install the node modules needed by WildOS there. (Make sure you are in the `server` directory).

It is a good idea to add the `WildOS/tools/` directory to your PATH so that commands such as `wildos`, `walldo` and (on Mac OS X) `nw`, are directly accessible from the command line. 
The rest of this documentation assumes this has been done:
	
	% cd WildOS/tools
	% PATH=`pwd`:$PATH

### Testing the server ###
To test the server run the following command:

	% wildos -n -w local Browser

The server will create two windows: one with lots of traces, the other depicting the wall display with the buttons `Restart` and `Shutdown` at the top, similar to the image below. 
Enter a URL in the text box: It should load 

![Screendump of the browser application when no rendering clients are running](../img/browser-noclients.png)

If the server does not work correctly, look at error messages in the terminal and in the window with all the traces: errors are displayed in orange or red.
If you are on Mac OS X, try also the following command (from the `WildOS` directory):

	% nw -X server [same options as wildos]

The `-X` argument runs node-webkit as a Unix command instead of a Mac OS application so that error messages are displayed on standard output instead of being hidden.

### Testing the server with local clients ###
To test the server with rendering clients running on the same machine, first finish installing the clients:

	% cd WildOS/renderer
	% npm install

then run the following command (i.e. the same as before without the `-n` argument):

	% wildos -w local Browser

This will run the server as before, plus four rendering clients. Each rendering client has a window with a light green background displaying numerous traces, and a content window in the top-left corner of the screen.

The content windows should display the URL specified in the server window, tiled in a consistent way so that the page appears to cross the windows. Moreover, the tiles in the server window should become transparent, to show that the server has establised connections with the clients, as in the picture below.

![Screendump of the browser application when the rendering clients are running](../img/browser.png)

If things don't work try again to look at error messages in the terminal and in the windows with the traces.

You can also run the server without the clients, as in the previous section, and then run one client by hand:

	% cd WildOS/renderer
	% nw . -l -i TL

(The last argument corresponds to the name of the tile and can be `TL`, `TR`, `BL` or `BR`).

On Mac OS X, add the `-X` option as before to see the potential errors in the terminal:

	% nw -X . -l -i TL

A possible issue is that the port number used by the server (8080 in this case) is already in use.
In this case, you can either:

* edit the `serverPort` property in `WildOS/config/local.json`
* or (preferably), specify a different port on the command line by adding the argument `-p <number>` to the above commands, e.g.:

```
	linux% wildos -w local -p 8901
	macos% nw -X . -l -p 9801 -i TL
```

Configuring the platform
--------

Before you can make a real test where clients are running on remote machines, you need to read the [configuration](configuring.md) page to configure WildOS for your platform.

Installing the rendering clients
--------

At present, WildOS features a rendering client for tiled displays and a web client for tablets and smartphones. Only the former (the rendering client) needs to be installed on the machine(s) running your tiled display.

Assuming that the configuration of your display cluster is properly described in the `configs` directory (see previous section), all you need to do to install the clients for the platform `MyWall` is:

	% WALL=MyWall export WALL  
	% make install  

If you need to log in as a different user on the remote machines, make sure to either set the `LOGNAME` environment variable to that user or to edit the Makefile and change the `walldo` command on the second line (see the example at the top of the script itself). 

### Installing the rendering clients by hand ###
Alternatively, you can install the clients by hand by following these steps:

* Create the `WildOS` directory on the destination machines (preferably under the home directory of the target user);
* Recursively copy the `renderer`, `shared` and, optionally, `slides` directories to the destination machines under `WildOS`;
* Install the node.js packages by running `npm install` in the `WildOS/renderer` directory in each destination machine.

### Testing the rendering clients ###
To test the remote clients, proceed as before.
First, try to run the server in the simplest way:

	% wildos Browser

This should display the server windows on the server machine, and a full-screen window on each tile run by a client machine. Entering a URL in the server window should display it both in the server window and on the clients. You can pan and zoom the web page in the server window with the mouse: drag to move the page within the tiled display, use the mousewheel to zoom it in and out.

In case of problems, troubleshoot as follows.

Run the server without launching the clients:

	% wildos -n Browser

then start the clients by clicking the `Restart` button in the server window, or log in a client machine and run a rendering client by hand as follows:
	
	(client) % nw . -s <server>:<portnumber> -i <instancename>

where `server` is the name of the server machine, `portnumber` the port number the server is running on and `instancename` the name of the renderer instance as specified in the configuration file, such as 'Left' or 'Right' for a configuration where each machine runs two tiles.

Running WildOS
--------

Once installation is complete, you can refer to the following pages to run WildOS routinely:

- [Running WildOS](running.md)
- [WildOS Applications](applications.md)

Installing updates
--------

### Updating an existing install ###
If you update WildOS, e.g. with `svn update` or from the git repository, you need to update the clients with `make update`.

### Extras ###
If you want to re-generate the documentation (which you shouldn't need to do unless you have edited it), you will also need to install [MultiMarkdown](http://fletcherpenney.net/multimarkdown/), a tool to compile Markdown files into HTML.

Then simply run

	% make docs

to generate `ReadMe.html` as well as the content of the `doc` directory.
