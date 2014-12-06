
// --- Use our logger if availabel, otherwise the console

var log;
try {
	// Use our logger if available
	log = require('./Log').logger('HTML');
} catch (e) {
	// Otherwise use console
	log = {
		message: console.info,
		warn: {
			message: console.warn,
		},
		error: {
			message: console.error,
		},
	};
}

// --- what is supported ---

// lazy evaluated and cached results
var support = {
	promise: function(window) {
		if (support.promise === undefined) 
			support.promise = 'Promise' in window;
		return support.promise;
	},
	template: function(window) { 
		if (support._template === undefined) 
			support._template = 'content' in window.document.createElement('template');
		return support._template;
	},
	shadowDOM:function(window) { 
		if (support._shadowDOM === undefined) 
			support._shadowDOM = 'createShadowRoot' in window.document.createElement('div');
		return support._shadowDOM;
	},
	customElements:function(window) { 
		if (support._customElements === undefined) 
			support._customElements = 'registerElement' in window.document;
		return support._customElements;
	},
	HTMLimport: function(window) { 
		if (support._HTMLimport === undefined) 
			support._HTMLimport = 'import' in window.document.createElement('link');
		return support._HTMLimport;
	},
};

// ======== CREATING ELEMENTS ======== 

// --- Helper functions ---

// Return the DOM name of an attribute
function normalizeAttrName(attr) {
	if (attr == 'class')
		return 'className';	// DOM name for 'class' attributes
	return attr;
}

// Turn a dash-separated string into a camel-case one
function camelify(s) {
	return s.replace(/-([a-z])/g, function(m, letter) { return letter.toUpperCase();});
}

// Capitalize the first letter of a string
function capitalize(s) {
	return s.substring(0, 1).toUpperCase() + s.substring(1);
}

// Return the string representation of the value of an attribute.
// For arrays, the returned value is a space-separated list of values.
// For functions and literal objects, the value is returned untouched.
// Functions are used for listeners, while literal objects are used for styles.
function attrValue(attr, value) {
	switch (typeof value) {
		case 'string':
			return value;

		case 'number':
		case 'boolean':
			return value.toString();

		case 'function':
			// Return untouched - caller will deal with it
			return value;

		case 'object':
			if (value === null)
				return '';
			// Turn arrays into space-separated lists
			if (Array.isArray(value))
				return value.join(' ');
			// Other objects are returned as is - caller will deal with them
			return value;

		case 'undefined':
			return 'undefined';
	}

	return '';
}

// Convert a literal object into a set of attributes, e.g.
// { margin: { top: 0, bottom: '2px'}} becomes {marginTop: 0, marginBottom: '2px'}
function parseStyleAttr(attr, prefix, obj) {
	for (var prop in obj) {
		var val = obj[prop];
		var attrName = prefix + (prefix ? capitalize(prop) : prop);

		if (typeof val == 'function')
			val = val.call(null);

		switch (typeof val) {
			case 'string':
				attr[attrName] = val;
				break;

			case 'object':
				parseStyleAttr(attr, attrName, val);
				break;

			default: 
				attr[attrName] = ''+val;	// convert to string
				break;
		}
	}
}

// Set the style attributes of an element.
// Value can be a string or a literal object.
function setStyleAttr(elem, style) {
	// For string values, use setAttribute
	if (typeof style == 'string') {
		log.message('setStyleAttr - string', style);
		elem.setAttribute('style', style);
		return;
	}

	// For literal objects, turn them into a record, then assign them directly
	var attrSet = {};
	parseStyleAttr(attrSet, '', style);
	log.message('setStyleAttr - object', attrSet);
	for (var prop in attrSet)
		elem.style[prop] = attrSet[prop];
}

// Set an attribute on an element.
// If the value is undefined, the attribute is not set,
// but if null it is.
// *** Should special attributes treated cumulatively, 
// *** e.g. if 'class' is specified multiple times? 
function setAttr(elem, attr, value) {
	if (value === undefined)
		return;

	// Get proper attribute name
	attr = normalizeAttrName(attr);

	// Handle data-attributes;
	var m = attr.match(/^data-(.+)$/);
	if (m) {
		// Data attribute: convert camel case and store in dataset
		attr = camelify(m[1]);
		log.message('setAttr - data attribute', attr, '=', value);
		elem.dataset[attr] = value;
		return;
	}

	// Turn value into string when possible
	value = attrValue(attr, value);

	// Special attribute: style
	if (attr == 'style') {
		setStyleAttr(elem, value);
		return;
	}

	// Event handlers need special treatment
	var event = null;
	m = attr.match('^on(.*)$');
	if (m)
		event = m[1];

	// Normal case
	switch (typeof value) {
		case 'string':
			log.message('setAttr', attr, '=', value);
			if (event)	// setAttribute turns the value into a function
				elem.setAttribute(attr, value);
			else
				elem[attr] = value;
			break;

		case 'function':
			if (event) {
				// Set listener if it's an event name (starts with 'on')
				log.message('setAttr - event listener', attr);
				elem.addEventListener(event, value);
			} else {
				// Call the function to get the value
				setAttr(elem, attr, value.call(null));
			} 
			break;

		case 'object':
			// ignored
			log.warn.message('setAttr', 'ignored object attr', attr, '=', value);
			break;
	}
}

// Set the attributes in the literal object `attrSet`
// on the element `elem`.
function setAttrSet(elem, attrSet) {
	for(var prop in attrSet)
		setAttr(elem, prop, attrSet[prop]);
}

// Parse a string of attributes and return a literal object describing them.
// The attributes can be of the form attr=value, attr="value", attr='value'.
// Several attributes can be listed, separated by at least one space.
function parseStringAttr(attr) {
	log.message('parseStringAttr', attr);
	attrSet = {};
	while (attr) {
		// match a=val, a="val with space", a='val with space'
		m = attr.match(/^\s*([^\s=]+)\s*=\s*(([^'"][^ '"]*)|"([^"]*)"|'([^']*)')/);
		if (!m)
			break;
		// m[1] is attribute name, m[3/4/5] is the match for the value depending on the 3 variants
		attrSet[m[1]] = m[3] || m[4] || m[5];

		attr = attr.substring(m[0].length);
	}
	return attrSet;
}

// Parse a set of attributes, described as a literal object,
// or a string,
// or a function returning one of the above.
// Return a literal object describing the attributes.
function parseAttr(attrSet) {
	log.message('parseAttr', attrSet);
	switch (typeof attrSet) {
		case 'string':
			return parseStringAttr(attrSet);

		case 'function':
			return parseAttr(attrSet.call(null));

		case 'object':
			return attrSet;

		default:
			log.message('  unknown type', typeof attrSet);
			break;
	}
	return {};
}

// Insert content into `elem`.
// `content` is an array of elements, where each element can be 
//		a string (text or HTML content),
// 		an array [tag, attributes..., content...],
// 		a DOM element,
// 		a function returning one of the above.
function processContent(win, elem, content) {
	log.message('processContent', elem.tagName, content);

	if (elem.tagName == 'TEMPLATE') {
		// Template tags have a document fragment as single child
		log.message('processContent: template tag - adding to content');
		elem = elem.content;
	}

	switch (typeof content) {
		case 'string':
			log.message('  inserting text node', content);
			if (content.match(/^</))	// it may be HTML
				elem.insertAdjacentHTML('beforeend', content);
			else
				elem.insertBefore(win.document.createTextNode(content), null);
			break;

		case 'function':
			processContent(win, elem, content.call(null));
			break;

		case 'object':
			if (content instanceof win.Node)
				elem.insertBefore(content, null);
			else if (Array.isArray(content))
				elem.insertBefore(processElement(win, content), null);
			else
				log.warn.message('processContent: unknow content type', content.constructor.toString());
			break;

		default:
			log.message('processContent: unknow type', typeof content);
			break;
	}
}

// Parse the attributes and content in the `args` array.
// Attributes are literal objects (typically specified directly 
// or with the `attr` and `data` functions);
// Content are strings (text or HTML)
// 	or arrays specifying elements (['p', {id: 'me'}, 'hello']),
//	or DOM elements.
// If an arg is a function, it is called and the result is processed according to its type. 
// Note that there attributes and content can be interspersed.
function processArgs(win, elem, args) {
	log.message('processArgs', args);
	for (var i = 0; i < args.length; i++) {
		var arg = args[i];

		if (typeof arg == 'function')
			arg = arg.call(null);

		if (typeof arg == 'string' || arg instanceof win.Element || Array.isArray(arg))
			break;

		setAttrSet(elem, parseAttr(arg));
	}

	for (; i < args.length; i++) 
		processContent(win, elem, args[i]);
}

// A tag can be a simple tag name,
// a string with tag name and some attributes
// or an existing element object,
// or a function returning one of the above.
function processTag(win, tag) {
	log.message('processTag', tag);
	switch (typeof tag) {
		case 'string':
			// recognized syntax: tag, <tag>,
			// tag attr=value ..., <tag attr=value ...>
			var m = tag.match(/^<?([^\s>]*)\s*(.*)>?$/);
			if (!m)
				return null;
			// tag is m[1], attributes is m[2]
			tag = m[1];
			var elem = win.document.createElement(tag);
			setAttrSet(elem, parseStringAttr(m[2]));

			// Special case: the <template> tag has a document-fragment as child
			// and elements are added to this child
			if (tag == 'TEMPLATE') {
				log.message('processTag: template tag: creating document fragment');
				elem.insertBefore(win.document.createDocumentFragment(), null);
			}
						
			return elem;

		case 'function':
			return processTag(win, tag.call(null));

		case 'object':
			if (tag instanceof win.Element)
				return tag;
			break;
	}

	return null;
}

// Turn an element specification of the form [tag, attr..., content...] into a DOM element
function processElement(win, element) {
	if (! win)
		return null;
	// Create element
	var elem = processTag(win, element[0]);

	// Add attributes and content
	var args = element.slice(1);
	processArgs(win, elem, args);

	// Coalesce adjacent nodes
	elem.normalize();

	return elem;
}

// --- External functions ---

// Create an attribute object, to be used, e.g.
//	`HTML.element(win, 'div', HTML.attr('id=mydiv class=foo'))`, 
// equivalent to `HTML.element(win, 'div', {id: 'mydiv', class='foo'})`. 
function attr(attrSet) {
	return parseAttr(attrSet);
}

// Create data attributes, i.e. prefixing
// attribute names with `data-`
function data(attrSet) {
	var attributes = parseAttr(attrSet);
	var dataset = {};
	for (var name in attributes)
		dataset['data-'+name] = attributes[name];
	return dataset;
}

// Create a text node
function text(win, t) {
	return win.createTextNode(t);
}

// Set style attributes of an element.
// `id` is passed to `findElement` to specify the element to be affected
function setStyle(win, id, attrSet) {
	var elem = findElement(win, id);
	if (elem)
		setStyleAttr(elem, attrSet);
	else
		log.warn.message('setStyle: element not found', id);
}

// Set attributes of an element
// `id` is passed to `findElement` to specify the element to be affected
function setAttributes(win, id, attrSet) {
	var elem = findElement(win, id);
	if (elem)
		setAttrSet(elem, attrSet);
	else
		log.warn.message('setAttributes: element not found', id);
}

// Create HTML elements from a descriptor
//
function element(win, tag, attr /* ... */, content /* ... */) {
	//log.message('element', Array.prototype.slice.call(arguments, 1));

	return processElement(win, Array.prototype.slice.call(arguments, 1));
}

function elements(win /*, content ... */) {
	args = Array.prototype.slice.call(arguments, 1); // remove win
	var result = [];
	var container = win.document.createDocumentFragment();

	args.forEach(function(element) {
		processContent(win, container, element);
	});

	var element;
	while ((element = container.firstChild)) {
		result.push(element);
		container.removeChild(element);
	}
	return result;
}

// Shortcuts to create script elements

// *** could optimize by using processElement and setting all attributes through literal objects

function JSText(win, text, attr) {
	return element(win, 'script type=text/javascript', attr, text);
}

function JS_URL(win, url, attr) {
	return element(win, 'script type=text/javascript', {src: url}, attr);
}

// Shortcuts to create CSS elements

function CSSText(win, text, attr) {
	return element(win, 'style type=text/css', attr, text);
}

function CSS_URL(win, url, attr) {
	// Note that a <style> element with src="url" does not work! (at least in Chrome)
	return element(win, 'link rel=stylesheet', {href: url}, attr);
}

function CSSImport(win, url, attr) {
	// This is needed instead of a <link> element in order to import style inside a component
	return element(win, 'style type=text/css', attr, '@import url("'+url+'")');
}


// Shortcuts to create HTML elements

// Returns a document fragment, unless there is a single element in the text.
// When multiple elements are created, `attr` are set on the first element.
function HTMLText(win, text, attr) {
	if (!win)
		return null;

	// Parse text into a document
	var parser = new win.DOMParser();
	var doc = parser.parseFromString(text, 'text/html');
	if (!doc) {
		log.warn.message('HTMLText: could not parse text into HTML');
		return null;
	}

	// Put the document body into a document fragment
	var root = win.document.createDocumentFragment();
	var node = doc.body;
	while (node.firstChild) 
		root.insertBefore(node.firstChild, null);

	if (attr && root.firstElementChild)
		setAttrSet(root.firstElementChild, attr);

log.message('HTMLText', 'inner=', root.innerHTML, 'outer=', root.outerHTML, 'first=', root.firstElementChild, 'last=', root.lastElementChild);
	if (root.firstChild == root.lastChild)
		return root.firstChild;

	return root;
}

// Returns a promise, which is resolved when the URL is loaded.
// The promise is called with the imported elements:
// a document fragment if there are more than one elements, 
// or the single element otherwise.
function HTML_URL(win, url, attr) {
//log.message('HTML_URL', url);
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	
	// Create the promise object
	var result = null;
	var resolve = function() {};
	var fail = function() {};
	var promise = {
		then: function(ok, err) { resolve = ok; fail = err; }
	};

	// Setup the request
	var xhr = new window.XMLHttpRequest();
//log.message('HTML_URL', 'created request');
	xhr.onload = function() {
// *** VERY WEIRD: if I remove 'xhr' in the trace below, node-webkit quits.
// *** Not clear if it's in error or not, and/or whether it's due to the Mocha testing stuff.
//log.message('HTML_URL', 'loaded', xhr);

		// We go through the elements in the body
		var xml = xhr.responseXML;
		if (!xml) {
			fail(new Error('XMLHttpRequest failed'));
			return;
		}

		var body = xml.body;
//log.message('HTML_URL', 'body=', body);
		result = win.document.createDocumentFragment();

		// Nodes are removed as they are transferred to the document,
		// hence the loop on firstChild:
		while(body.firstChild)
			result.insertBefore(body.firstChild, null);

		// Set attributes on first inserted node
		if (attr && result.firstChild)
			setAttrSet(result.firstChild, parseAttr(attr));

		if (result.firstChild == result.lastChild)
			result = result.firstChild;

//log.message('HTML_URL', 'done - resolving promise', body);
		resolve(result);
	};
	xhr.onerror = function() {
//log.message('HTML_URL', 'error');
		fail();
	};

	// Send the request
	xhr.open('get', url);
	xhr.responseType = 'document';
	xhr.send();
//log.message('HTML_URL', 'sent request');

	// return the promise
	return promise;
}

function HTMLImport(win, url, attr) {
	if (!support.HTMLimport(win)) {
		log.warn.message('HTMLImport: browser does not support HTML import');
		return null;
	}

	// This only works on Chrome at the moment
	return element(win, 'link rel=import', {href: url}, attr);
}

// ======== INSERTING ELEMENTS ========

// Find an element specified par `ref`, which can be:
//	a string, identifying the element with that id,
//	a function, whose value is used to find the element
//	a DOM element
//	a jQuery collection, whose first element is used
function findElement(win, ref) {
	switch(typeof ref) {
		case 'string':
			// Find an element with that id
			return win.document.getElementById(ref);

		case 'function':
			// Find whatever the function returns
			return findElement(ref.call(null));

		case 'object':
			// DOM element
			if (ref instanceof win.Node)
				return ref;

			// jQuery collection
			if (window.jQuery && ref.constructor == window.jQuery) {
				var elements = ref.toArray();
				if (elements.length > 0)
					return elements[0];	// return first one
				log.warn.message('findElement:', 'empty jQuery collection');
				return null;
			}

			// Wild guess that if it looks like a Node, it may be a node...
			// (see http://stackoverflow.com/questions/4754088/how-to-check-if-object-is-a-dom-element)
			// This is needed when loading content from an external URL (addHTML_URL).
			// *** A better test would be welcome!!! 
			if (ref.nodeName && ref.nodeType)
				return ref;

			log.warn.message('findElement:', 'unknown object type', ref.constructor.toString());
			return null;
	}

	log.warn.message('findElement:', 'unknown type', typeof ref);
	return null;
}

// Add content to an HTML document.
//
// `win` is the target window,
// `content` is either a DOM element, an HTML string, 
// or an array specifying a DOM tree as parsed by `element` above
// `how`: 'replace', 'content', before', 'begin', 'end' (default), 'after';
// `ref`: element relative to which the insertion is done. 
//		  Can be a DOM element, the id of an element, or a jQuery collection.
//		  It defaults to the document body
//
// Returns either a single element or an object with properties 'first' and 'last'
// referring to the first and last elements that were added.
// If insertion failed, returns null.
//
function add(win, content, how, ref) {
	log.message('add', 
		content instanceof win.Node ? content.outerHTML: content, 
		how, 
		ref instanceof win.Node ? ref.outerHTML : ref
	);

	if (!win)
		return null;

	// Handle missing arguments
	if (! how)
		how = 'end';
	if (! ref)
		ref = win.document.body;

	// Find reference element
	var oref = ref;	// for warning message only
	ref = findElement(win, ref);
	if (!ref) {
		log.warn.message('add: could not find ref', oref);
		return null;
	}
	if (ref.tagName == 'TEMPLATE') {
		// *** NOT TESTED ***
		log.message('add: ref is a template: adding to template content');
		ref = ref.content;
	}

	// Insert content
	var parent = ref.parentElement;
	var range;
	var result = null;
	if (! content || typeof content == 'string') {
		// Inserting a string.
		// It's a bit messy because more than one node may be inserted.

		result = {
			first: ref,
			last: ref,
		};

		switch (how) {
			case 'replace':
				if (parent) {
					result.first = ref.previousSibling;
					result.last = ref.nextSibling;

					if (content)
						ref.insertAdjacentHTML('beforebegin', content);
					parent.removeChild(ref);

					result.first = result.first ? result.first.nextSibling : parent.firstChild;
					result.last = result.last ? result.last.previousSibling : parent.lastChild;
				}
				break;
			case 'content':
				ref.innerHTML = content || '';
				result.first = ref.firstChild;
				result.last = ref.lastChild;
				break;
			case 'before':
				if (content) {
					result.first = ref.previousSibling;

					ref.insertAdjacentHTML('beforebegin', content);

					result.first = result.first ? result.first.previousSibling : parent.firstChild;
					result.last = ref.previousSibling;
				}
				break;
			case 'begin':
				if (content) {
					result.last = ref.firstChild;

					ref.insertAdjacentHTML('afterbegin', content);

					result.first = ref.firstChild;
					result.last = result.last ? result.last.previousSibling : parent.lastChild;
				}
				break;
			case 'end':
				if (content) {
					result.first = ref.lastChild;
					ref.insertAdjacentHTML('beforeend', content);

					result.first = result.first ? result.first.previousSibling : parent.firstChild;
					result.last = ref.lastChild;
				}
				break;
			case 'after':
				if (content) {
					result.last = ref.nextSibling;

					ref.insertAdjacentHTML('afterend', content);

					result.first = ref.nextSibling;
					result.last = result.last ? result.last.previousSibling : parent.lastChild;
				}
				break;
			default:
				log.warn.message('add: unknown mode:', how);
				return null;
		}

		if (result.first == result.last) {
			log.message('add: result.first == result.last, returning', result.first ? result.first.outerHTML : 'null');
			return result.first;
		}

	} else {
		if (Array.isArray(content)) {
			// A DOM specification to be parsed by `element`
			var args = content.slice();
			args.splice(0, 0, win);
			content = element.apply(null, args);
			if (!content) {
				log.warn.message('add: malformed array element');
				return null;
			}
		} else if (! content instanceof win.Node) {
			log.warn.message('add: content is not an element');
			return null;
		}

		// Inserting a DOM element
		result = content;

		switch (how) {
			case 'replace':
				if (parent) {
					parent.insertBefore(content, ref);
					parent.removeChild(ref);
				} else {
					log.warn.message('add: no parent for replace mode');
					return null;
				}
				break;
			case 'content':
				while (ref.firstChild)
					ref.removeChild(ref.firstChild);
				ref.insertBefore(content, null);
				break;
			case 'before':
				if (parent)
					parent.insertBefore(content, ref);
				else {
					log.warn.message('add: no parent for replace mode');
					return null;
				}
				break;
			case 'begin':
				ref.insertBefore(content, ref.firstChild);
				break;
			case 'end':
				ref.insertBefore(content, null);
				break;
			case 'after':
				if (parent)
					parent.insertBefore(content, ref.nextSibling);
				else {
					log.warn.message('add: no parent for replace mode');
					return null;
				}
				break;
		}		
	}

	return result;
}

// Shortcuts to remove/replace content

function remove(win, ref) {
	return add(win, null, 'replace', ref);
}

function replace(win, ref, newContent) {
	return add(win, newContent, 'content', ref);
}


// Helper function to detect missing `attr` option
function notAnAttr(attr) {
	if (typeof attr != 'string')
		return false;
	// The argument following `attr` is `how`, so we test against the legitimate values for `how`.
	if (['replace', 'content', 'before', 'begin', 'end', 'after'].indexOf(attr) >= 0)
		return true;
	return false;
}

// Inject a script into a page, specified as a string, a file or a URL.
//
// `attr` is an optional set of attributes for the inserted script.
// It can be a string, a literal object, or a function returning these.

function addJSText(win, text, attr, how, ref) {
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	return add(win, JSText(win, text, attr), how, ref);
}

// For this one, you can define the `onload` and `onerror`
// attributes to be notified when the script is actually loaded (or not).
function addJS_URL(win, url, attr, how, ref) {
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	return add(win, JS_URL(win, url, attr), how, ref);
}

// Inject a CSS stylesheet into a page, specified as a string, a file or a URL.
// When specified by a URL, the style can be linked (<link> tag) or imported
// (<style> with an @import clause). The latter is needed when importing
// a style inside a web component.
//
// `attr` is an optional set of attributes for the inserted style element.
// It can be a string, a literal object, or a function returning these.

function addCSSText(win, text, attr, how, ref) {
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	return add(win, CSSText(win, text, attr), how, ref);
}

// For this one, you can define the `onload` and `onerror`
// attributes to be notified when the style is actually loaded (or not).
function addCSS_URL (win, url, attr, how, ref) {
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	return add(win, CSS_URL(win, url, attr), how, ref);
}

// As or addCSS_URL, you can define the `onload` and `onerror`
// attributes to be notified when the script is actually loaded (or not).
function addCSSImport (win, url, attr, how, ref) {
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	return add(win, CSSImport(win, url, attr), how, ref);
}

// Inject a piece of HTML into a page, specified as a string, a file or a URL.
//
// `attr` is an optional set of attributes that are set on the first HTML element.
// It can be a string, a literal object, or a function returning these.

function addHTMLText(win, text, attr, how, ref) {
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}

	var result = add(win, text, how, ref);
	if (result === null)
		return null;

	// Set attributes on the first inserted element only
	if (result.first)
		result = result.first;
	if (attr)
		setAttrSet(result, parseAttr(attr));

	return result;
}

// This one returns a promise since loading is asynchronous
// and there is no preexisting element onto which to set a handler.
// *** unless we extract onload and onerror handlers from attr for this purpose.
// *** need a timeout or the request never fails when URL missing (??)
function addHTML_URL(win, url, attr, how, ref) {
//log.message('addHTML_URL', url);
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	
	// Create the promise object
	var result = null;
	var resolve = function() {};
	var fail = function() {};
	var promise = {
		then: function(ok, err) { resolve = ok; fail = err; }
	};

	// Setup the request
	var xhr = new window.XMLHttpRequest();
//log.message('addHTML_URL', 'created request');
	xhr.onload = function() {
// Insert HTML document as text: (requires commenting out "xhr.responseType = 'document'" below)
//		result = addHTMLText(win, xhr.responseText, attr, how, ref);

// *** VERY WEIRD: if I remove 'xhr' in the trace below, node-webkit quits.
// *** Not clear if it's in error or not, and/or whether it's due to the Mocha testing stuff.
//log.message('addHTML_URL', 'onload', xhr);

		// We go through the elements in the body
		var xml = xhr.responseXML;
		if (!xml) {
			fail(new Error('XMLHttpRequest failed'));
			return;
		}

		var body = xml.body;
//log.message('addHTML_URL', 'body=');//, body);
		result = {
			first: null,
			last: null,
		};
//log.message('addHTML_URL', 'firstChild=', body.firstChild);
		result.first = result.last = add(win, body.firstChild, how, ref);
		// Nodes are removed as they are transferred to the document,
		// hence the loop on firstChild:
		while(body.firstChild)
			result.last = add(win, body.firstChild, 'after', result.last);

		// Set attributes on first inserted node
		if (attr && result.first)	// *** should get the first Element, not the first Node (could be a text node)
			setAttrSet(result.first, parseAttr(attr));

		if (result.first == result.last)
			result = result.first;

//log.message('addHTML_URL', 'done - resolving promise', body);
		resolve(result);
	};
	xhr.onerror = function() {
//log.message('addHTML_URL', 'onerror');
		fail();
	};

	// Send the request
	xhr.open('get', url);
	xhr.responseType = 'document';
	xhr.send();
//log.message('addHTML_URL', 'sent request');

	// return the promise
	return promise;
}

// You can define the `onload` and `onerror`
// attributes to be notified when the URL is actually loaded (or not).
function addHTMLImport (win, url, attr, how, ref) {
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	return add(win, HTMLImport(win, url, attr), how, ref);
}

// Add a shadow DOM under `host`.
// `host` must be an id or a DOM element.
// `content` can be an id or a DOM tree. 
// 	If it identifies a template, a copy of the template content is used.
// A copy of content is created if content has a parent.
// The functions returns this copy, or the content itself if no copy was made.
function addShadow(win, host, content) {
	log.message('addShadow');

	if (!support.shadowDOM(win)) {
		log.warn.message('addShadow: browser does not support ShadowDOM');
		return null;
	}

	if (!win)
		return null;

	host = findElement(win, host);
	if (!host) {
		log.warn.message('addShadow: could not find host element');
		return null;
	}
	log.message('  host is', host.outerHTML);

	// *** should consider `content` to be varargs ?
	if (Array.isArray(content)) {
		content = processElement(win, content);
		log.message('  content array', content.outerHTML);
	} else {
		content = findElement(win, content);
		log.message('  content element', content.outerHTML);
	}

	if (! content) {
		log.warn.message('addShadow: could not find or create content');
		return null;
	}

	var root = host.createShadowRoot();
	var copy = content;
	if (content.tagName == 'TEMPLATE') {
		copy = win.document.importNode(content.content, true);
		log.message('  importing template in shadowRoot');
	} else if (content.parentNode !== null) {
		copy = content.cloneNode(true);
		log.message('  copying content in shadowRoot');
	} else {
		log.message('  inserting content in shadowRoot');
	}

	if (copy)
    	root.appendChild(copy);
    else
    	log.message('  copy is empty');

	return copy;
}

// Register a new element
// *** TODO *** (and to add to the exports)
function registerElement(win, elName, attr, classyClass) {
	if (!support.shadowDOM(win)) {
		log.warn.message('registerElement: browser does not support user-defined HTML elements');
		return null;
	}

	if (!win)
		return null;

	var elProto = Object.create(HTMLElement.prototype, {
		createdCallback: function() { /* create Classy object with attributes values + field wrappers */ },
			/* alternatively : don't create object but let the application bind to an object */
		attachedCallback: function() { /* call object's attach */ },
		detachedCallback: function() { /* call object's dettach */ },
		attributeChangedCallback: function(attName, oldVal, newVal) { /* mirror in object */},
	});

	var elType = win.document.registerElement(name, {
		prototype: elProto,
	});

	return elType;
}

// ==== EXPORTS ====

var HTML = {
	attr: attr,
	data: data,

	setAttributes: setAttributes,
	setStyle: setStyle,

	element: element,
	elements: elements,

	JSText: JSText,
//	JSFile: JSFile,
	JS_URL: JS_URL,

	CSSText: CSSText,
//	CSSFile: CSSFile,
	CSS_URL: CSS_URL,
	CSSImport: CSSImport,

	HTMLText: HTMLText,
//	HTMLFile: HTMLFile,
	HTML_URL: HTML_URL,
	HTMLImport: HTMLImport,

	findElement: findElement,

	add: add,
	remove: remove,
	replace: replace,

	addJSText: addJSText,
//	addJSFile: addJSFile,
	addJS_URL: addJS_URL,

	addCSSText: addCSSText,
//	addCSSFile: addCSSFile,
	addCSS_URL: addCSS_URL,
	addCSSImport: addCSSImport,

	addHTMLText: addHTMLText,
//	addHTMLFile: addHTMLFile,
	addHTML_URL: addHTML_URL,
	addHTMLImport: addHTMLImport,

//	addFile: addFile,
//	addDir: addDir,

	addShadow: addShadow,
};

// node-compatible export
if (typeof exports !== 'undefined')
	module.exports = HTML;

// ==== FUNCTIONS THAT RELY ON ACCESS TO FILE SYSTEM ====

var fs = null;
var Path = null;

try {
	fs = require('fs');
	Path = require('path');
} catch(e) {
	// Omit subsequent functions
}

if (fs && Path) {

// Return the content of a file, or null if an error occurs.
// *** Should use a search path
function getFile(path) {
//	path = Path.join(__dirname , '../content', path);

	try {
		return fs.readFileSync(path, 'utf8');
	} catch(e) {
		return null;
	}	
}

// make sync/async versions of these - with a promise 

// --- Create JS/CSS/HTML elements with content from a file ---
 
function JSFile(win, path, attr) {
	var text = getFile(path);
	if (text)
		return JSText(win, text, attr);
	log.warn.message('JSFile: could not load file', path);
	return null;
}

function CSSFile(win, path, attr) {
	var text = getFile(path);
	if (text)
		return CSSText(win, text, attr);
	log.warn.message('CSSFile: could not load file', path);
	return null;
}

function HTMLFile(win, path, attr) {
	var text = getFile(path);
	if (text)
		return HTMLText(win, text, attr);
	log.warn.message('HTMLFile: could not load file', path);
	return null;
}

// --- Add JS/CSS/HTML elements with content from a file ---

function addJSFile(win, path, attr, how, ref) {
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	var text = JSFile(win, path, attr);
	if (text)
		return add(win, text, how, ref);
	return null;
}

function addCSSFile (win, path, attr, how, ref) {
	if (notAnAttr(attr)) {	// Handle optional attr
		ref = how; how = attr; attr=null;
	}
	var text = CSSFile(win, path, attr);
	if (text)
		return add(win, text, how, ref);
	return null;
}

function addHTMLFile(win, path, attr, how, ref) {
	var text = getFile(path);
	if (text)
		return addHTMLText(win, text, attr, how, ref);
	log.warn.message('addHTMLFile: could not load file', path);
	return null;
}

// Inject a file, using the extension to guess its type, or the content of a directory.
// *** Maybe have a type to process content of file (templating) ***
// *** Or put that in the options ***
function addFile(win, path, attr, how, ref) {
	try {
		if (fs.statSync(path).isDirectory())
			return addDir(win, path, options, cb, data);	// *** attr are lost!!!
	} catch(e) {
		return null;
	}

	switch (Path.extname(path)) {
		case '.html':
			return addHTMLFile(win, path, attr, how, ref);
		case '.css':
			return addCSSFile(win, path, attr, how, ref);
		case '.js':
			return addJSFile(win, path, attr, how, ref);
		default:
			log.warn.message('addFile: unknown extension', path);
			return null;
	}
}

// Inject the content of a directory (recursively).
// Subdirectories are added before parent directories.
// In each directory, css files are added first, then html files, then js files.
// Subdirectories called 'css', 'html', 'js', are added in that order.
// *** Should recursive lookup be an option? ***
// *** Maybe load a package.json file if it exists and look at its 'files' property? ***
// *** Do the options make sense? or should package.json specify the options? ***
function addDir(win, path, how, ref) {
	// Keep track of files and dirs
	var dirs = [];
	var dir = {
		css: null,
		html: null,
		js: null
	};
	var files = {
		css: [],
		html: [],
		js: [],
	};

	try {
		fs.readdirSync(path).forEach(function(file) {
			var fullPath = Path.join(path, file);
			var ext = Path.extname(path).replace(/^./,'');
			var isdir = fs.statSync(path).isDirectory();
			if (isdir) {
				if (file in dir)	// css, html, js directories 
					dir[file] = fullPath;
				else
					dirs.push(fullPath);
			} else 
				if (ext in files)
					files[ext].push(fullPath);
		});
	} catch(e) {
		return null;
	}

	// Load content
	var result = {
		first: null,
		last: null,
	};

	function processResult(res) {
		if (!res)
			return;

		if (!result.first)
			result.first = res.first;
		result.last = res.last;

		how = 'after';
		ref = res.last;
	}

	// *** Need to manage how/ref to be consistent
	// use how/ref for first, then how='after' and ref=inserted content
	// -> need appendHTML to return the inserted element

	// Subdirectories
	dirs.forEach(function(dir) {
		processResult(addDir(win, dir, how, ref));
	});

	// CSS directory and files
	if (dir.css)
		processResult(addDir(win, dir.css, how, ref));
	files.css.forEach(function(file) {
		processResult(addCSSFile(win, file, how, ref));
	});

	// HTMLM directory and files
	if (dir.html)
		processResult(addDir(win, dir.html, how, ref));
	files.html.forEach(function(file) {
		processResult(addHTMLFile(win, file, how, ref));
	});

	// JS directory and files
	if (dir.js)
		processResult(addDir(win, dir.js, how, ref));
	files.js.forEach(function(file) {
		processResult(addJSFile(win, file, how, ref));
	});

	return res;
}

// --- export file-specific functions ---

HTML.JSFile = JSFile;
HTML.CSSFile = CSSFile;
HTML.HTMLFile = HTMLFile;

HTML.addJSFile = addJSFile;
HTML.addCSSFile = addCSSFile;
HTML.addHTMLFile = addHTMLFile;

HTML.addFile = addFile;
HTML.addDir = addDir;

}
