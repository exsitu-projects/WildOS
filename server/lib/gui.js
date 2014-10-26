
// Node modules
var fs = require('fs');

// Shared modules
var log = require('Log').logger('gui');
var Path = require('path');

var gui;
function getGUI() {
	if (gui !== undefined)
		return gui;

	gui = null;
	try {
		log.message('getGUI:', 'require nw.gui');
		gui = window.require('nw.gui');
		log.message('getGUI:', 'require succeeded');
		return gui;
	} catch(e) {
		log.message('getGUI:', 'require failed');
		return null;
	}
}

function disable() {
	gui = null;
}

var menuBar;
function getMenuBar() {
	if (menuBar !== undefined)
		return menuBar;

	log.message('getMenuBar:', 'creating menus');
	var win = gui.Window.get();
	menuBar = win.menu;
	if (!menuBar) {
		menuBar = new gui.Menu({ type: 'menubar' });
		if (menuBar.createMacBuiltin)	// only available since node-webkit v0.10.1
			menuBar.createMacBuiltin("WildOS server");
		win.menu = menuBar;
	}

	return menuBar;
}

// Create the platform menu
var platformMenu;
function getPlatformMenu(platform) {
	if (platformMenu !== undefined)
		return platformMenu;

	var gui = getGUI();
	if (!gui) {
		log.message('getPlatformMenu:', 'no GUI');
		platformMenu = null;
		return null;
	}

	log.message('getPlatformMenu:', 'creating menu');
	platformMenu = new gui.Menu();
	var name = platform.name || 'devices';

	// Start/Stop/Restart/Shutdown platform
	platformMenu.append(new gui.MenuItem({
		label: 'Start '+ name,
		click: function() { platform.start(); },
	}));
	platformMenu.append(new gui.MenuItem({
		label: 'Stop '+ name,
		click: function() { platform.stop(); },
	}));
	platformMenu.append(new gui.MenuItem({
		label: 'Restart '+ name,
		click: function() { platform.restart(); },
	}));
	platformMenu.append(new gui.MenuItem({
		label: 'Shutdown '+ name,
		click: function() { platform.shutdown(); },
	}));

	// Preferences
	var preferencePanel = null;
	platformMenu.append(new gui.MenuItem({
		type: 'separator',
	}));
	platformMenu.append(new gui.MenuItem({
		label: 'Preferences ',
		click: function() { 
			if (preferencePanel)
				preferencePanel.show();
			else {
				preferencePanel = gui.Window.open('../content/preferences.html', {
					width: 400,
					height: 800,
					toolbar: platform.program.showToolbar,
				});
				preferencePanel.on('close', function() {
					preferencePanel.close(true);
					preferencePanel = null;
				});
			}
		},
	}));

	getMenuBar().insert(new gui.MenuItem({
		label: 'Platform',
		submenu: platformMenu,
	}), process.platform === 'darwin' ? 2 : 0);	// only Mac OS has predefined menus

	return platformMenu;
}



// Create the Apps menu
var appsMenu;
function getAppsMenu(appClass) {
	if (appsMenu !== undefined)
		return appsMenu;

	// Create Platform menu in UI
	var gui = getGUI();
	if (!gui) {
		log.message('getAppsMenu:', 'no GUI');
		appsMenu = null;
		return null;
	}

	if (! appClass)
		return;

	log.message('getAppsMenu:', 'creating menu');

	// Create a menu item for the Apps menu
	function makeItem(menu, appName) {
		menu.append(new gui.MenuItem({
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

	appsMenu = new gui.Menu();
	var apps = appClass.availableApps();
	for (var i = 0; i < apps.length; i++)
		makeItem(appsMenu, apps[i]);
	
	getMenuBar().insert(new gui.MenuItem({
		label: 'Applications',
		submenu: appsMenu,
	}), process.platform === 'darwin' ? 3 : 0);	// only Mac OS has predefined menus

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
/*
makePlatformUI: function() {
	if (! this.config.UI)
		return;
	var UI = this.config.UI;
	var win = null;
	
	if (UI.frame) {
		var gui = process.mainModule.exports.gui;
		var url = '../content/platform.html';	// URL is relative to the lib folder
		if (UI.url)	// interpret it relative to the config file folder
			url = 'file://'+Path.resolve(this.dirname(), UI.url);
		log.method(this, 'makeUI', '- url', url);
		UI.frame.toolbar = this.program.showToolbar;
		win = gui.Window.open(url, UI.frame);
		this.window = win;
	}

	return win;
}
*/
var platformWindow = null;
function makePlatformUI(platform, showToolbar) {
	log.message('makePlatformUI');
	platformWindow = null;
	
	var UI = platform.config.UI;
	if (! UI) {
		log.message('makePlatformUI: no UI');
		return null;
	}

	if (UI.frame) {
		var gui = getGUI();
		if (!gui) {
			log.message('makePlatformUI: no GUI');
			return null;
		}

		var url = '../content/platform.html';	// URL is relative to the lib folder
		if (UI.url)	// interpret it relative to the config file folder
			url = 'file://'+Path.resolve(platform.dirname(), UI.url);

		log.message('makePlatformUI: opening', url);

		UI.frame.toolbar = showToolbar;
		platformWindow = gui.Window.open(url, UI.frame);
	}

	return platformWindow;
}

// Return the window holding the platform UI.
/*getUIWindow: function() {
	if (!this.window)
		return null;
	return this.window.window;
},
*/
function getUIWindow() {
	if (!platformWindow)
		return null;
	return platformWindow.window;
}

// show main window, show platform window's dev tools
function showTraceWindow() {
	var gui = getGUI();
	if (gui)
		var win = gui.Window.get().show();
}

function showDevTools() {
 	var gui = getGUI();
 	if (! gui)
 		return;

	var win = gui.Window.get();
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

	getPlatformMenu: getPlatformMenu,
	getAppsMenu: getAppsMenu,
	checkAppsMenuItem: checkAppsMenuItem,

	makePlatformUI: makePlatformUI,
	getUIWindow: getUIWindow,

	showTraceWindow: showTraceWindow,
	showDevTools: showDevTools,

	injectJSText: injectJSText,
	injectJSFile: injectJSFile,
	injectCSSText: injectCSSText,
	injectCSSFile: injectCSSFile,
	injectHTMLText: injectHTMLText,
	injectHTMLFile: injectHTMLFile,

};
