Title: Overview

WildOS - Read Me
========

WildOS is middleware to support applications running in an interactive room featuring various interaction resources, such as our [WILD room](http://www.lri.fr/~mbl/WILD): a tiled wall display, a motion tracking system, tablets and smartphones, etc.

The conceptual model of WildOS is that a *platform*, such as the WILD room, is described as a set of *devices* and can run one or more *applications*.

WildOS consists of a server running on a machine that has network access to all the machines involved in the platform, and a set of clients running on the various interaction resources, such as a display cluster or a tablet. Once WildOS is running, applications can be started and stopped and devices can be added to / removed from the platform.

WildOS relies on Web technologies, most notably [Javascript](http://en.wikipedia.org/wiki/JavaScript) and [node.js](http://nodejs.org), as well as [node-webkit](https://github.com/rogerwang/node-webkit) and [HTML5](http://en.wikipedia.org/wiki/HTML5). This makes it inherently portable (it is currently tested on Mac OS X and Linux). While applications can be developed only with these Web technologies, it is also possible to bridge to existing applications developed in other environments if they provide sufficient access to be remote controlled.

WildOS is still in a very preliminary stage, so expect bugs, crashes and weird behaviors!


### Installing and running WildOS ###

To install and run WildOS, read the following documentation pages:

- [Installing WildOS](doc/md/installing.md)
- [Configuring WildOS](doc/md/configuring.md)
- [Running WildOS](doc/md/running.md)
- [WildOS Applications](doc/md/applications.md)

### Developping for WildOS ###

WildOS is in active development. We need users to give us feedback, contribute code, and create their own applications.

The `doc` directory contains [documentation](doc/md/index.md) describing the general architecture of the system and how to create new devices and new applications.
The source code is also fairly commented.

So read the documentation, read the code and hack away!

### Credits ###

WildOS is developed by [Michel Beaudouin-Lafon](http://www.lri.fr/~mbl) and inspired by lots of previous work, most notably the [Substance](https://www.lri.fr/perso/~mbl/WILD/publications/index.html#substance-chi11) framework.
