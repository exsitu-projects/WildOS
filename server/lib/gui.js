
// Node modules
var fs = require('fs');

// Shared modules
var log = require('Log').logger('gui');
var Path = require('path');

var UIdisabled = false;

function getGUI() {
	if (UIdisabled)
		return null;
	return nw;
}

function disable() {
	UIdisabled = true;
}

// Menus
var menuBar = null;
var platformMenu = null;
var appsMenu = null;

// Menu bar
function getMenuBar() {
	return menuBar;
}

function createMenuBar(win) {
	if (menuBar)
		return menuBar;

	log.enter(null, 'createMenuBar');

	if (UIdisabled || menuBar) {
		log.exit(null, 'createMenuBar');
		return menuBar;
	}

	log.message('creating menus');
	menuBar = new nw.Menu({ type: 'menubar' });
	if (process.platform === 'darwin' && menuBar.createMacBuiltin) {	// only available since node-webkit v0.10.1
		log.message('creating Mac builin menus');
		menuBar.createMacBuiltin("WildOS server");
	}

	platformMenu = new nw.Menu();
	menuBar.insert(new nw.MenuItem({
		label: 'Platform',
		submenu: platformMenu,
	}), process.platform === 'darwin' ? 2 : 0);	// only Mac OS has predefined menus

	appsMenu = new nw.Menu();
	menuBar.insert(new nw.MenuItem({
		label: 'Applications',
		submenu: appsMenu,
	}), process.platform === 'darwin' ? 3 : 0);	// only Mac OS has predefined menus

	log.message('setting menu bar');
	win.menu = menuBar;

	log.exit(null, 'createMenuBar');
	return menuBar;
}

// Platform menu
function getPlatformMenu() {
	return platformMenu;
}

function createPlatformMenu(platform) {
	log.enter(null, 'createPlatformMenu');

	if (UIdisabled) {
		log.exit(null, 'createPlatformMenu');
		return null;
	}

	log.message('getPlatformMenu:', 'creating menu');
	var name = platform.name || 'devices';

	// Start/Stop/Restart/Shutdown platform
	platformMenu.append(new nw.MenuItem({
		label: 'Start '+ name,
		click: function() { platform.start(); },
	}));
	platformMenu.append(new nw.MenuItem({
		label: 'Stop '+ name,
		click: function() { platform.stop(); },
	}));
	platformMenu.append(new nw.MenuItem({
		label: 'Restart '+ name,
		click: function() { platform.restart(); },
	}));
	platformMenu.append(new nw.MenuItem({
		label: 'Shutdown '+ name,
		click: function() { platform.shutdown(); },
	}));

	// Preferences
	var preferencePanel = null;
	platformMenu.append(new nw.MenuItem({
		type: 'separator',
	}));
	platformMenu.append(new nw.MenuItem({
		label: 'Preferences ',
		click: function() { 
			if (preferencePanel)
				preferencePanel.show();
			else {
				nw.Window.open('../content/preferences.html', {
					width: 400,
					height: 800,
				}, function (win) {
					preferencePanel = win;
					win.on('close', function() {
						preferencePanel.close(true);
						preferencePanel = null;
					});
				});
			}
		},
	}));

	log.exit(null, 'createPlatformMenu');
	return platformMenu;
}

// Apps menu
function getAppsMenu() {
	return appsMenu;
}

function createAppsMenu(appClass) {
	log.enter(null, 'createAppsMenu');
	if (UIdisabled) {
		log.exit(null, 'createAppsMenu');
		return null;
	}

	if (! appClass) {
		log.message('apps not loaded yet');
		log.exit(null, 'createAppsMenu');
		return null;
	}

	// Create Platform menu in UI
	log.message('creating menu');

	// Create a menu item for the Apps menu
	function makeItem(menu, appName) {
		menu.append(new nw.MenuItem({
			label: appName,
			type: 'checkbox',
			checked: appClass.instances[appName],
			click: function() { 
				if (appClass.instances[appName])
					appClass.unloadApp(appName);
				else
					appClass.loadApp(appName);
			}
		}));
	}

	var apps = appClass.availableApps();
	for (var i = 0; i < apps.length; i++)
		makeItem(appsMenu, apps[i]);
	
	log.exit(null, 'createAppsMenu');
	return appsMenu;
}

/*

Add events for App register / unregister.
Map these + AppStarted / Stopped to changing the Apps menu

Should put 'program' object from WildOS in separate 'options.js',
and NOT have platform.program to give access to it: simply require 'options'.

All communication with UI should be such that it can be done over sockets.
*/

// Check/uncheck app in apps menu
function checkAppsMenuItem(appName, checked) {
	if (! getAppsMenu())
		return;	// no GUI

	var items = appsMenu.items;
	for (var i = 0; i < items.length; i++) {
		var item = items[i];
		if (item.label == appName) {
			item.checked = checked;
			return;
		}
	}
	// not found
}

// Create a window with the UI for the platform.
// The UI, if any, is described by a property `UI` in the config file.
// This property holds at least a `frame` propery (size of the window holding the UI)
// and an optional `url` property, to be loaded in the new window.
// *** We could also inject JS/CSS/HTML in the default UI
function makePlatformUI(platform) {
	log.enter(null, 'makePlatformUI');

	var done = function() {};
	var promise = new Promise(function(fulfill, reject) {
		done = fulfill;
	});

	if (UIdisabled) {
		done();
		log.exit(null, 'makePlatformUI');
		return promise;
	}

	var UI = platform.config.UI;
	if (! UI || ! UI.frame) {
		log.message(UI ? 'no UI frame' : 'no config UI');
		done();
		log.exit(null, 'makePlatformUI');
		return promise;
	}

	var url = '../content/platform.html';	// URL is relative to the lib folder
	if (UI.url)	// interpret it relative to the config file folder
		url = 'file://'+Path.resolve(platform.dirname(), UI.url);

	log.message('opening', url);

	// backward compatibility: rename frame fields: left -> x, top -> y
	if (UI.frame) {
		if (UI.frame.left) {
			UI.frame.x = UI.frame.left;
			delete UI.frame.left;
		}
		if (UI.frame.top) {
			UI.frame.y = UI.frame.top;
			delete UI.frame.top;
		}
	}

	nw.Window.open(url, UI.frame, function(win) {
		log.message('platform window created', win);
		platform.window = win;
		createMenuBar(win);

		win.on('close', function() {
			global.platform.stop();
			nw.App.quit();
		});

		win.window.onload = done;
	});

	log.exit(null, 'makePlatformUI');
	return promise;
}

function getUIWindow() {
	if (!global.platform.window)
		return null;
	return global.platform.window.window;
}

// show main window, show platform window's dev tools
function showLogWindow() {
	var win = global.platform.logWindow;
	if (win)
		win.show();
}

function showDevTools() {
	var win = global.platform.window;
	if (win)
		win.showDevTools();
}

// Inject a script file (by creating and adding a <script> tag) into the platform UI.
// `id` is an optional id to assign to the created element (e.g., to remove it later).
// `cb` is an optional callback called when the inserted JS has executed.
function injectJSText(text, id, cb) {
	// parse arguments for the case where id is omitted
	if (typeof id === 'function') { cb = id; id = null; }

	var win = getUIWindow();
	if (!win) {
		// no UI - call cb and return
		if (cb)
			cb();
		return false;
	}

	var script = win.document.createElement('script');
	if (id)
		script.id = id;
	script.type = 'text/javascript';
	script.innerHTML = text;
	if (cb)
		script.onload = cb;

	win.document.body.appendChild(script);
	return true;
}

// Inject a script (by creating and adding a <script> tag) into the platform UI.
// `id` is an optional id to assign to the created element (e.g., to remove it later).
// `cb` is an optional callback called when the inserted JS has executed.
function injectJSFile(path, id, cb) {
	// parse arguments for the case where id is omitted
	if (typeof id === 'function') { cb = id; id = null; }

	var win = getUIWindow();
	if (!win) {
		// no UI - call cb and return
		if (cb)
			cb();
		return false;
	}

	var script = win.document.createElement('script');
	if (id)
		script.id = id;
	script.type = 'text/javascript';
	script.src = path;	// path is relative to the server/content directory
	if (cb)
		script.onload = cb;

	win.document.body.appendChild(script);
	return true;
}

// Inject a stylesheet (by creating and adding a <style> tag) into the platform UI.
// `id` is an optional id to assign to the created element (e.g., to remove it later).
// `cb` is an optional callback called when the inserted CSS is ready.
function injectCSSText(text, id, cb) {
	// parse arguments for the case where id is omitted
	if (typeof id === 'function') { cb = id; id = null; }

	var win = getUIWindow();
	if (!win) {
		// no UI - call cb and return
		if (cb)
			cb();
		return false;
	}

	if (id)
		script.id = id;
	var style = win.document.createElement('style');
	style.type = 'text/css';
	style.innerHTML = text;
	if (cb)
		style.onload = cb;

	win.document.head.appendChild(style);
	return true;
}

// Inject a stylesheet file (by creating and adding a <link> tag) into the platform UI.
// `id` is an optional id to assign to the created element (e.g., to remove it later).
// `cb` is an optional callback called when the inserted CSS is ready.
function injectCSSFile(path, id, cb) {
	// parse arguments for the case where id is omitted
	if (typeof id === 'function') { cb = id; id = null; }

	var win = getUIWindow();
	if (!win) {
		// no UI - call cb and return
		if (cb)
			cb();
		return false;
	}

	var style = win.document.createElement('link');
	if (id)
		script.id = id;
	style.rel = 'stylesheet';
	style.type = 'text/css';
	style.href = path;	// path is relative to the server/content directory
	if (cb)
		style.onload = cb;

	win.document.head.appendChild(style);
	return true;
}

// Inject a piece of HTML inside/around an element of the platform UI.
// `elementId` defaults to `platform`, the section of the platform UI that can be extended.
// `how` can be `replace`, or one of the modes accepted by `insertAdjacentHTML`:
// `beforebegin` (before element), `afterbegin` (at beginning of element), 
// `beforeend` (at end of element - the default), or `afterend` (after element).
// Note that the inserted HTML is not executed, i.e. embedded scripts are not executed.
// Use injectJSFile/Text for this.
// *** Note: this one has no callback because we don't know on what element to set it.
// *** We should turn the HTML into a tree ourselves, and then do as above.
// *** It also does not have an id since it can be put in the script itslef
function injectHTMLText(html, elementId, how) {
	var win = getUIWindow();
	if (!win)
		return false;

	if (! elementId)
		elementId = 'platform';
	if (! how)
		how = 'beforend';

	var element = win.document.getElementById(elementId);
	if (! element) {
		log.warn.message('injectHTML: could not find element', elementId);
		return false;
	}

	if (how == 'replace')
		element.innerHTML = html;
	else
		element.insertAdjacentHTML(how, html);

	return true;
}

// Insert an HTML file inside/around an element of the platform UI.
// See `injectHTMLText` above for arguments.
function injectHTMLFile(path, elementId, how) {
	if (!getUIWindow())
		return false;

	// path is relative to server/content 
	path = __dirname + '/../content/' + path;
	var html = fs.readFileSync(path, {encoding: 'utf8'});
	if (!html) {
		log.warn.message('injectHTML: could not read file', path);
		return false;
	}
	return injectHTMLText(html, elementId, how);
}

module.exports = {
	getGUI: getGUI,
	disable: disable,

	createPlatformMenu: createPlatformMenu,
	createAppsMenu: createAppsMenu,
	getPlatformMenu: getPlatformMenu,
	getAppsMenu: getAppsMenu,
	checkAppsMenuItem: checkAppsMenuItem,

	makePlatformUI: makePlatformUI,
	getUIWindow: getUIWindow,

	showLogWindow: showLogWindow,
	showDevTools: showDevTools,

	injectJSText: injectJSText,
	injectJSFile: injectJSFile,
	injectCSSText: injectCSSText,
	injectCSSFile: injectCSSFile,
	injectHTMLText: injectHTMLText,
	injectHTMLFile: injectHTMLFile,

};
