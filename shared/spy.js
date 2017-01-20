/*

Spy: get notifications when objects change

### What this does

This module implements a functionality to the now defunct Object.observe.

observeObject(o, cb) will arrange to have cb called whenever a property of o changes value.
If o is an array, it will also call cb when elements are inserted/deleted from the array.

unobserveObject(o, cb) removes the callback cb from o.
unobserveObject(o) removes all callbacks on o.

The callbacks are called asynchronously, with two arguments:
	- the object being observed
	- a list of change records, each of which is a literal object with the following properties:
		- a type, currently 'set' or 'splice'
		- for 'set', a 'properties' property that holds the properties that have changed and their new values
		- for 'splice', three properties:
			- start: the index of the first element that was added/removed
			- deleteCount: the number of elements that were deleted
			- elements: the elements that were inserted

Note that properties that are added to the object after calling observeObject are NOT tracked.
However, you can call observeProperty(obj, prop) to add prop to the set of observed properties.

Properties that are deleted from an object should not cause propblems.
However it is cleaner to call unobserveProperty(obj, prop) before deleting a property.

### How it works

Each object that is observed has symbol properties added to it:
	[observers]	a list (i.e. an array) of callbacks to be called when the object changes
	[suspended]	an integer used to enable/disable notification

When observing an object, its properties are replaced by a getter/setter.
The getter does nothing special, the setter sets the value and notifies the change.
For arrays, we also override the array functions that modify the array and
notify the insertion and deletion of indices in the array.
We call this process 'wrapping'.

When we wrap a property that was already a get/set property or an array method that was
already locally defined in the object, we record the previous value as a symbol property of
the new setter / method wrapper.
	[wrapped]	function that was wrapped
This is so that we can restore the previous setter / method wrapper when unobserving the object.

When unobserving an object, we unwrap its properties and (for arrays) its array methods, 
unless the properties and/or array methods have been wrapped in the mean time. 
In that case we leave our wrappers in place but disable them by storing the property names 
in a symbol property:
	[disabled] list of property names/methods that are unobserved but whose wrappers are still active

Asynchronous notification is done by recording pending notifications in another symbol property of the object:
	[changes]	an array of the changes made to the object
All changes to an object are batched so that each callback is called exactly once per notification.

*/

/* jshint esnext:true */ // will become esversion: 6

var log = require('./Log').logger('Spy');

// ========== Notifications ==========

// Private property to store the suspension state (> 0 means suspended).
// When suspended, object changes are not notified.
var suspended = Symbol('suspended');

// Call f as soon as possible (inspired by npm asap module)
function asap(f) {
	// setTimeout(f, 0);
	setImmediate(f);
}

// Increase the suspension level
function suspendNotifications(obj) {
	obj[suspended]++;
}

// Decrease the suspension level
function resumeNotifications(obj) {
	obj[suspended]--;
}

// Return true if the object is currently suspended
function isSuspended(obj) {
	return obj[suspended] > 0;
}

// Private property storing the list of changes to an object in the object itself.
// Each element has at least a 'type' property.
var changes = Symbol('changes');

// Notify the changes of obj to its observers.
// This function is called asynchronously.
// It calls the observers with the object and the set of changes,
// and resets the set of changes.
//
function notifyChanges(obj) {
	// check that we still have changes and observers to notify
	// this may not be the case if the last observer was removed while changes were pending,
	// or if a notification was forced while there were changes
	if (! obj[changes] || ! obj[observers])
		return;
	// call the observers
	let objChanges = obj[changes];
	obj[changes] = [];	// reset the changes here in case the callbacks add new changes
	obj[observers].forEach(function(cb) {
		cb(obj, objChanges);
	});
}

// Record a change to obj.
// This function is called when a change to the object is detected.
// (Currently, this happens in the property setters and the array function wrappers).
// It stores the change in the object and triggers an asynchronous call 
// to notifyChanges if this is the first change to the object.
// Subsequent changes will be notified together with the first one, when notifyChanges gets called.
function changed(obj, change) {
	var objChanges = obj[changes];

	// First change to this object: add change and schedule notification
	if (objChanges.length === 0) {
		objChanges = obj[changes] = [change];
		asap(function() {
			notifyChanges(obj);
		});
		return;
	}

	// Subsequent changes: record change, coalescing it when possible
	// We only coalesce successive 'set' changes
	// (We could try to be clever about 'splice' changes, but we're not...)
	switch(change.type) {
		case 'set':
			let last = objChanges.length -1;
			if (objChanges[last].type === 'set')	// coalesce current change with last
				Object.assign(objChanges[last].properties, change.properties);
			else 
				objChanges.push(change);
			break;

		default:
			objChanges.push(change);
			break;
	}
}

// ========== Observing objects ==========
//
// To observe objects, we store the list of observers (i.e., callback functions) 
// in a symbol property of the object called observers.
// We also transform the observed object's properties into setter/getters in order to track the changes.
// The symbol properties 'wrapped' and 'disabled' are used to restore the state when unobserving an object.

// Private property to store the observer callbacks.
var observers = Symbol('observers');
// Private property to store the previous setter of active properties.
var wrapped = Symbol('wrapped');
// Private property to store (in a Set) the names of properties that could not be unwrapped.
var disabled = Symbol('disabled');


// Add cb as observer for object obj.
// Return false if this is the first observer for this object, true otherwise
function addObserver(obj, cb) {
	var callbacks = obj[observers];

	if (! callbacks) {
		obj[observers] = [cb];
		return false;
	}

	callbacks.push(cb);
	return true;
}

// Remove an observer on obj.
// Return true if there are no more observer for this object, false otherwise
function removeObserver(obj, cb) {
	var callbacks = obj[observers];
	if (!callbacks)
		return false;

	var i = callbacks.indexOf(cb);
	if (i >= 0)
		callbacks.splice(i, 1);

	return callbacks.length === 0;
}

// Add an observer with a tag
function addTaggedObserver(obj, cb, cbtag) {
	cb[tag] = cbtag;
	return addObserver(obj, cb);
}

// Remove an observer on obj, identified by a tag.
// Return true if there are no more observer for this object, false otherwise
function removeTaggedObserver(obj, cbtag) {
	var callbacks = obj[observers];
	if (!callbacks || !cbtag)
		return false;

	var i;
	if (typeof cbtag === 'object')
		// find a callback whose tag is an object with properties matching cbtag
		i = obj.findIndex(function(cb) {
			if (! cb[tag] || typeof cb[tag] !== object)
				return false;
			for (var prop in cbtag)
				if (cbtag[prop] !== cb[tag][prop])
					return false;
		});
	else 
		// find a callback whose tag is cbtag
		i = obj.findIndex(function(cb) {
			return (cbtag === cb[tag]);
		});

	if (i >= 0)
		callbacks.splice(i, 1);

	return callbacks.length === 0;
}

// Record a property change.
// This is called by the property setters created when observing an object.
// The change record contains on object with the property that was changed and its new value.
function propertyChanged(obj, prop, v) {
	if (isSuspended(obj))
		return;
	
	var change = {};
	change[prop] = v;
	changed(obj, {
		type: 'set',
		properties: change
	});
}

function disableProperty(obj, prop) {
	if (!obj[disabled])
		obj[disabled] = new Set();
	obj[disabled].add(prop);
}

function enableProperty(obj, prop) {
	if (!obj[disabled])
		return;
	obj[disabled].delete(prop);
	if (obj[disabled].size === 0)
		delete obj[disabled];
}

function isPropertyDisabled(obj, prop) {
	return obj[disabled] && obj[disabled].has(prop);
}

// Replace property prop by a getter/setter that calls propertyChanged 
// when the value of a property is changed.
// If prop already had a getter/setter, they are called by the new wrapper, 
// and stored in the 'wrapped' symbol property so that they can be restored later.
function observeProperty(obj, prop) {
	// if the property wrapper was disabled, simply re-enable it
	if (isPropertyDisabled(obj, prop)) {
		enableProperty(obj, prop);
		return;
	}

	// return the new descriptor for a value property
	function makeValueDescriptor(prop, value) {
		log.message('makeValueDescriptor', prop);
		var shadow = value;	// local variable holding the value
		var desc = {
			get: function() {
				return shadow;
			},
			set: function propSetter(v) {
				log.message('set regular prop', prop, 'to', v);
				if (isPropertyDisabled(this, prop))
					return;
				if (shadow === v)
					return;
				// unobserveValueObject(this, prop, shadow);
				shadow = v;
				// observeValueObject(this, prop, v);
				propertyChanged(obj, prop, v);
			},
			enumerable: true,
			configurable: true,
		};
		desc.set[wrapped] = 'none';	// will be useful when unobserving the property
		return desc;
	}

	// return the new descriptor for a get-set property
	function makeGetSetDescriptor(prop, oldGetter, oldSetter) {
		log.message('makeGetSetDescriptor', prop);
		var desc = {
			get: oldGetter,
			set: function(v) {
				log.message('set get/set prop', prop, 'to', v);
				if (isPropertyDisabled(this, prop)) {
					oldSetter(v);
					return;
				}
				// unobserveValueObject(this, prop, this[prop]);
				oldSetter(v);
				/**/propertyChanged(obj, prop, v /* or obj[prop]?? */);
				// observeValueObject(this, prop, v);
			},
			enumerable: true,
			configurable: true,
		};
		desc.set[wrapped] = oldSetter;	// will be useful when unobserving the property
		return desc;
	}

	// if property value is a value object, observe it
	// observeValueObject(obj, prop, obj[prop]);

	// replace the property descriptor
	var desc = Object.getOwnPropertyDescriptor(obj, prop);
	if (desc.value !== undefined) // simple property
		Object.defineProperty(obj, prop, makeValueDescriptor(prop, obj[prop]));
	else // get-set property
		Object.defineProperty(obj, prop, makeGetSetDescriptor(prop, desc.get, desc.set));

}

// Reset the property descriptor so as to stop observing the property.
// If our getter/setter was wrapped by another one, we disable it.
// This is not ideal, but better than throwing an exception.
function unobserveProperty(obj, prop) {
	var desc = Object.getOwnPropertyDescriptor(obj, prop);
	if (!desc.set)	// no setter: it can't be one of our properties, so we just ignore it
		return;

	var prevSet = desc.set[wrapped];
	if (!prevSet) {
		// this is not our setter: mark it as disabled.
		disableProperty(obj, prop);
		return;
	}

	// reset the previous property descriptor
	if (prevSet === 'none')
		Object.defineProperty(obj, prop, {
			value: obj[prop],
			enumerable: true,
			configurable: true,
			writable: true,
		});
	else
		Object.defineProperty(obj, prop, {
			get: desc.get,
			set: prevSet,
			enumerable: true,
			configurable: true,
			writable: true,
		});

	// if property value is a value object, observe it
	// unobserveValueObject(obj, prop, obj[prop]);
}

// Observer obj: call cb (asynchronously) whenever one or more properties of obj are modified.
// cb is called with obj and an array of changes.
// Each change object has a property 'type', and additional properties according to the type.
// Currently, we have 2 types:
//	'set', when one or more properties are changed. 
//		Their names and values are in the 'properties' object of the change record;
//	'splice', when elements are inserted and/or deleted in an array.
//		The change record has three additional properties: start, numDeleted, elements, 
//		similar to the arguments of the Array.splice method.
// This function adds cb to the observers of the object, wraps the properties of the object
// in order to observe them, and wraps the array functions if obj is an array.
// *** Should have options for the list of props to include or exclude
function observeObject(obj, cb) {
	// not an object: do nothing
	if (! obj || typeof obj !== 'object') {
		console.log('observeObject: not an object');
		return null;
	}

	log.message('ObserveObject', obj);
	// add observer, return if the object was already observed
	// *** should set obj[observers] = [] here, otherwise an object without props will
	// *** crash when we delete obj[observers] in unobserveobject
	if (addObserver(obj, cb))
		return cb;

	// wrap existing properties to observe them
	// *** what about object-level props that are methods???
	for (var prop in obj)
		observeProperty(obj, prop);

	// if it's an array, wrap some methods
	if (Array.isArray(obj))
		wrapArrayMethods(obj);

	// init the notification state
	obj[suspended] = 0;
	obj[changes] = [];

	// return the callback, as it is needed in unobserveObject
	return cb;
}

// Stop observing obj: stop calling cb when a property of obj is modified.
// This function undoes what observeObject did: remove cb from the observers,
// unwrap properties and array functions if needed.
function unobserveObject(obj, cb) {
	if (! obj && typeof obj !== 'object') {
		console.log('unobserveObject: not an object');
		return;
	}

	if (cb) {
		// remove the observer, return if there are others
		if (! removeObserver(obj, cb))
			return;
	}

	// if it's an array, unwrap the methods we had wrapped
	if (Array.isArray(obj))
		unwrapArrayMethods(obj);

	// reset the original properties
	for (var prop in obj)
		unobserveProperty(obj, prop);

	// remove the properties that record the observers
	delete obj[suspended];
	delete obj[observers];
	delete obj[changes];
}

// ========== Observing arrays ==========
//
// Arrays are observed/unobserved like regular objects (with observe/unobserveObject).
// In addition, we need to wrap the array functions, like push, pop or splice, that change the array.

// Start observing count elements from arr[start].
// This is called by the array function wrappers.
function observeArrayElements(arr, start, count, cb) {
	// replace each array element
	for (var i = start; i < start+count; i++)
		observeProperty(arr, i, cb);
}

// Stop observing count elements from arr[start]
// This is called from the array function wrappers.
// Note that since these elements are about to be removed, we could probably optimize this.
function unobserveArrayElements(arr, start, count) {
	for (var i = start; i < start+count; i++)
		unobserveProperty(arr, i);
}

// Record a splice operation on an array.
// This is called by the array function wrappers.
// The change record holds the same arguments as the splice function (start, deleteCount, insertedElements).
function arraySpliced(arr, start, deleteCount, elements) {
	if (isSuspended(arr))
		return;

	changed(arr, {
		type: 'splice',
		start: start, 
		deleteCount: deleteCount, 
		elements: elements
	});
}

// Wrappers for array functions that change the size of the array.
// They unobserve the elements that are about to disappear, observe the ones being inserted,
// and notify the changes as a 'splice'.
// Note that the array methods copyWithin, fill, reverse and sort assign array elements in place 
// and therefore generate the correct sequence of notifications without having to wrap them.
var arrayWrappers = {
	pop: function() {
		if (this.length === 0)
			return undefined;

		if (isPropertyDisabled(this, 'pop'))
			return Array.prototype.pop.call(this);

		unobserveArrayElements(this, this.length -1, 1);
		var ret = Array.prototype.pop.call(this);
		arraySpliced(this, this.length, 1);
		return ret;
	},
	push: function(...elements) {
		if (isPropertyDisabled(this, 'pop')) {
			Array.prototype.push.apply(this, elements);
			return this.length;
		}

		var len = this.length;
		Array.prototype.push.apply(this, elements);
		observeArrayElements(this, len, elements.length);
		arraySpliced(this, len, 0, elements);
		return this.length;
	},
	shift: function() {
		if (this.length === 0)
			return undefined;

		if (isPropertyDisabled(this, 'shift'))
			return Array.prototype.shift.call(this);

		unobserveArrayElements(this, this.length-1, 1);	// note that it's the last element that will disappear
		suspendNotifications(this);
		var ret = Array.prototype.shift.call(this);
		resumeNotifications(this);
		arraySpliced(this, 0, 1);
		return ret;
	},
	unshift: function(...elements) {
		if (isPropertyDisabled(this, 'unshift')) {
			Array.prototype.unshift.apply(this, elements);
			return this.length;
		}

		var len = this.length;
		suspendNotifications(this);
		Array.prototype.unshift.apply(this, elements);
		resumeNotifications(this);
		observeArrayElements(this, len, elements.length);	// the new elements are added at the end
		arraySpliced(this, 0, 0, elements);
		return this.length;
	},
	splice: function(start, deleteCount, ...elements) {
		var len = this.length;
		if (! deleteCount) 
			deleteCount = len - start;
		if (! elements)
			elements = [];

		if (isPropertyDisabled(this, 'splice'))
			return Array.prototype.splice.call(this, start, deleteCount, ...elements);

		var count = deleteCount - elements.length;	// number of elements removed
		if (count > 0)
			unobserveArrayElements(this, len - count, count);
		suspendNotifications(this);
		var deleted = Array.prototype.splice.call(this, start, deleteCount, ...elements);
		resumeNotifications(this);
		if (count < 0) // -count is the number of added elements
			observeArrayElements(this, len, -count);	// the new elements are added at the end
		arraySpliced(this, start, deleteCount, elements);
		return deleted;
	},
	// *** we need to redefine length because it can be set directly
	// get length() {
	//		...
	// },
	// set length(v) {
	//		...
	// },
};

// Wrap an array method that is already defined in the object.
// This is an internal method called by wrapArrayMethods.
// If the local definition is not a function, we do nothing.
// That's OK because we assume the user of the object knows what they are doing...
function wrapArrayMethod(arr, method) {
	var prevMethod = arr[method];
	// do not wrap non-functions
	if (typeof pref !== 'function')
		return;
	// wrap the previous definition and tag it so we can unwrap
	var newMethod = function(...args) {
		prevMethod(...args);
		return arrayWrappers[method](...args);
	};
	newMethod[wrapped] = prevMethod;
	arr[method] = newMethod;
}

// Replace the array methods with local methods that notify splices,
// or wrap them if they are already defined at the object level.
// This is an internal method called by observeObject.
function wrapArrayMethods(arr) {
	for (var method in arrayWrappers) {
		if (isPropertyDisabled(arr, method))
			enableProperty(arr, method);
		else {
			if (arr.hasOwnProperty(method)) {
				wrapArrayMethod(arr, method);
			} else {
				// same as arr[method] = arrayWrappers[method]
				// but we make the method property non-enumerable
				Object.defineProperty(arr, prop, {
					value: arrayWrappers[method],
					enumerable: false,
					configurable: true,
					writable: true,
				});
			}
		}
	}
}

// Restore the standard (or pre-existing) array methods.
// This is an internal method called by unobserveObject.
function unwrapArrayMethods(arr) {
	for (var method in arrayWrappers)
		if (arr[method] === arrayWrappers[method])	// simple definition at the object level:
			delete arr[method];						// 	-> simply remove it
		else if(arr[method][wrapped])				// wrapped pre-existing definition at the object level
			arr[method] = arr[method][wrapped];		//	-> restore previous definition
		else 										// other cases, e.g. our method was wrapped by someone else
			disableProperty(obj, method);			//	-> mark method as disabled
}

// ========== Module exports ==========

module.exports = {
	observeProperty,
	unobserveProperty,
	observeObject,
	unobserveObject,
}
