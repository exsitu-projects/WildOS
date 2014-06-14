/*
	Classy, (yet another) object-oriented framework for Javascript.
	(c) 2011, Michel Beaudouin-Lafon, mbl@lri.fr
	
	A taste of how it's used:
	
	// define a Shape class with two properties (x and y), a default constructor and some methods
	var Shape = Classy.newClass();
	Shape.fields({x: 0, y: 0});
	Shape.constructor(function(x, y) {
		this.x = x; this.y = y;
	});
	Shape.methods({
		moveby: function (dx, dy) { this.x += dx; this.y += dy; },
		moveto: function (x, y) { this.x = x; this.y = y; },
	});
	
	// create a shape, call a method and print its properties
	var s = Shape.create(5, 5);
	s.moveby(10, 15);
	print(s.x,',',s.y);
	
	// create a Circle subclass, with a new field, two constructors and some methods.
	// note that we can use a chain of calls instead of a sequence as above.
	var Circle = Shape.subclass()
		.fields({radius: 1})			// this could also be written .field('radius', 1)
		.constructor(function (x, y, r) {
			this._super(x, y);	// call to super, i.e. the Shape constructor
			this.radius = r;
		})
		.constructor('withradius', function(r) {	// this is a named constructor
			this.radius = r;	// no need to call super, x and y will be inited to 0
		})
		.methods({
			area: function() { return this.radius * this.radius * 3.14; },
			// as with constructors, we can call this._super(...) in a method
		});
	
	// create a circle with the named constructor and play with it
	var c = Circle.withradius(12).moveby(10, 15);
	print (c.area());
	
// [begin activefield]
	// add an active field for the diameter
	// this uses the Javascript syntax for getter/setter for properties
	Circle.fields({
		get diameter() {return this.radius * 2},
		set diameter(val) {this.radius = val / 2},
	});
	var c2 = Circle.create();
	c2.diameter = 20;
	print (c2.radius);	// 10
// [end activefield]

// [begin mixin]	
	// create a wrapper to trace a method call
	function traceWrapper() {
		log('calling ')
		return this._inner();	// calls the wrapped method
	}
	// add the wrapper to a couple methods
	Shape.wrap('moveby', traceWrapper);
	Circle.wrap('area', traceWrapper);
	c.area();
	// remove the wrapper
	Circle.unwrap('area', traceWrapper);
	
	// define a mixin for redisplaying a shape when it is changed
	function redisplayWrapper() {
		this._inner.apply(this, arguments);		// call original function with same arguments
		this.redisplay();						// call the mixin method
	}
	
	var displayMixin = {
		constructor: function() { this.redisplay(); },	// constructor called for each new object
		fields: {},										// additional fields (none here)
		methods: {										// additional methods
			redisplay: function() { ... redisplay shape ...}
		},
		wrappers: { 									// wrappers for existing methods
			moveto: redisplayWrapper, 
			moveby: redisplayWrapper
		}
	};
	// add the mixin to a class
	Shape.mixin(displayMixin);
	var c = Circle.create();
	c.moveby(10, 12); // calls redisplay
// [end mixin]

// [begin wrapfield]
	// wrap the radius field so that the circle gets redisplayed when assigning its radius
	Shape.wrapFields({
		set radius(r) { this._set(r); this.redisplay(); }	// this._set() and this._get(val) invoke the original setter/getter
	});
	// note: this can also be specified in a mixin in the 'fieldWrappers' property
// [end wrapfield]

	What's different about Classy compared to other frameworks:
	
	- Classes are objects, _not_ constructors in the Javascript sense.
	  This means that we can't use "new MyClass(...)" to create an object.
	  Instead, a class is instantiated using "MyClass.create(...)".
	  While the syntax is a matter of taste, this means that we have a real metaclass (the class's prototype)
	  and that we can easily add fields, methods, constructors and subclasses to the class using
	  method chaining: Classy.newClass().fields(...).constructors(...).methods(...);
	  These can be called in any order, as many times as you want.
	  Note however that if you add fields after having created objects, the existing objects
	  will not get these fields.
	
	- Object properties ('fields') can be automatically initialized with their default values
	  in every new object. Default values can be defined by a function, which will be called 
	  when initialising the object.
// [begin activefield]
	  Fields can be defined as "active" by specifying a getter and/or setter function.
	  This supports dynamically computed fields, or fields with side effects.
// [end activefield]
	  Declaring fields makes constructors easier to write, sometimes even unecessary.
	  Note that the default constructor (create) can take a literal object with property values
	  that are copied to the object. These properties are copied as is (no special treatment
	  of properties whose value is a function or which have setters and/or getters)
	
	- You are not stuck with a single constructor and complex parsing of its arguments
	  when you want different possible sets of parameters for your constructor.
	  Not only can you overload the default constructor (create) with your own,
	  you can also create other constructors with different names, each with their own parameters.
	  Because of the call to _super (see below), constructor chaining is much more convenient as well.
	
	- Constructors and methods can call-to-super, i.e. call the constructor or method that they
	  are overriding in a base class.
	  Call-to-super is simple: just use 'this._super(...)' in a constructor or method.
	  In my opinion, this is cleaner that, e.g., prototype.js use of $super or David Flanagan's
	  use of arguments.callee in his DefineClass method from his book.
	
// [begin mixin]	
	- Wrappers and mixins allow to modify a class. This goes beyond redefining or adding methods.
	  A wrapper redefines a method in a class in such a way that the original method can be called
	  using 'this._inner(...)'. This is similar to a call to super but within a class.
	  Wrappers can be stacked (a wrapper can be added to a method that already has a wrapper)
	  and removed dynamically.
	  A mixin is similar to a class that is 'merged' into an existing class: it can define fields
	  to be added to (future) objects of the class, new methods and wrappers, and a default constructor.
	  (One current limitation is that changes to a mixin after it is added to a class do not affect the class.)
	  Mixins provide some of the effects of multiple inheritance without many of the drawbacks.
	  Note that fields added by a mixin override fields with the same name in the orignal class, if they exist.
	  This can be useful, for example to change the default value, but it can also be dangerous 
	  if the collision was unexpected.
// [end mixin]
	
// [begin wrapfield]
	- A field of an existing object or class can be wrapped with a getter and/or setter.
	  This makes it possible to add side effects to every access (get or set) to a field.
	  Such field wrappers can be defined as part of a mixin, using the fieldWrappers property.
	  Like method wrappers, field wrappers do not apply to objects that already exist before 
	  the wrapper is defined.
	  Also, a given field can be wrapped only once per class or per mixin, but if several mixins
	  wrap the same field, the wrappers will be nested.
	- Wrappers can also be added on a per-object basis, with the methods wrapField, wrapFields, 
	  unwrapField and unwrapFields, defined for every object.
	- Note that o.unwrapField(s) is the only way to remove field wrappers from an existing object.
	  If a mixin is removed that has wrapped fields, existing objects are unaffected.
// [end wrapfield]

	I am not claiming this is a better framework than what's already out there.
	It's just different, with a different set of tradeoffs. And it was a good exercise
	for playing (and sometimes fighting with) Javascript's object model!
	
	Comments and suggestions welcome !
 */

//Classy = (function() {
(function(exports){

var Metaclass;

/*
 *	The constructor function for new objects.
 *	An object remembers its class and is inited first with its class (and the class's superclass) fields,
 *	then with the optional 'init' parameter, which is expected to be a literal object.
 */
function object(myClass, init) {
	this.__class = myClass;
	myClass.__init(this);

	// if there is a parameter, it is expected to be a list of field/values
	if (init)
		copyFields(init, this);
}

/*
 *	Create and return a copy of a value.
 *	Literal values are returned as is.
 *	Objects are recursively copied _except_ if they are:
 *		- a Classy object or class
 *		- an immutable object, recognized because it has a property '__immutable' that evaluates to true
 *	The deep copy takes proper care of shared objects and cycles.
 *	objectmap is an optional mapping of objects to their copies
 */
function copyValue(obj, /*opt*/ objectmap) {
	// simple case: objects that are simple values or objects that are immutable
    if (obj === null || typeof(obj) != 'object' || obj.__class || obj.__metaclass || obj.__immutable)
        return obj;
	
	// initialize the object map if undefined
	if (objectmap) {
		// lookup the object in the map and return the recorded copy if any
		var i = objectmap.objects.indexOf(obj);
		if (i >= 0)
			return objectmap.copies[i];
	}
	
    var newobj = new obj.constructor();	// this assumes the constructor does not need parameters
	if (objectmap) {
		// remember object mapping for cycles and shared subobjects
		objectmap.objects.push(obj);
		objectmap.copies.push(newobj);
	}
	
	// recursive copy
    for (var key in obj)
       newobj[key] = copyValue(obj[key], objectmap);
	return newobj;
}

/*
 *	copy a list of (non-active) fields into an object
 */
function copyFields(fields, obj) {
	var objectmap = { objects: [], copies: []};
	for (var f in fields) {
		var value = fields[f];
		if (typeof(value) == "function")
			obj[f] = value.apply(obj);	// dynamic value: call the function
		else
			obj[f] = copyValue(value, objectmap);	// smart copy of the value
	}
}

// [begin activefield]
/*
 *	If field is an active field of obj (i.e., field has a getter and/or setter),
 *	copy that field to target and return true, otherwise do nothing and return false.
 */
function copyActiveField(obj, field, target) {
	var d = Object.getOwnPropertyDescriptor(obj, field);
	if (d.get || d.set)
		Object.defineProperty(target, field, d);
	return (d.get || d.set);
	/*
	if (getter)
		target.__defineGetter__(field, getter);
	if (setter)
		target.__defineSetter__(field, setter);
	return (getter || setter);
*/
}

/*
 *	copy a list of active fields into an object
 */
function copyActiveFields(fields, obj) {
	for (var f in fields)
		copyActiveField(fields, f, obj);
}
// [end activefield]


/*
 *	Implement call to super in constructors.
 *	'constructorWithSuper' wraps the constructor 'fun' in a function that defines
 *	this._super(), as well as calling the mixins' constructors, if any.
 */

function noSuper() {}

function constructorWithSuper(myClass, name, fun) {
	var superclass = myClass.__superclass;
	
	// if there is no call to super, simply call the constructor function and the mixins' constructors
	if (fun.toString().search(/\W_super\W/m) < 0)
// [begin mixin]
		return function() {
			fun.apply(this, arguments);
			for (var m = 0; m < myClass.__mixins.length; m++)
				myClass.__mixins[m].constructor.apply(this);
			return this;
		};
// [end]
/* [begin !mixin]
		return fun;
   [end mixin] */


	// general case
	return function() {
		// create the _super function and store it in this._super.
		// save any previous value so we can restore it at the end
		var savedsuper = this._super;
		this._super = (superclass == Object) ? noSuper : (superclass.__constructors[name] || noSuper);
		try {
			var res = fun.apply(this, arguments);
// [begin mixin]
			for (var m = 0; m < myClass.__mixins.length; m++)
				myClass.__mixins[m].constructor.apply(this);
// [end mixin]
		} finally {
			if (savedsuper) this._super = savedsuper; else delete this._super;
		}
		return this;
	};
}

/*
 *	Implement call to super in a method.
 *	'methodWithSuper' wraps the method 'fun' in a function that defines this._super().
 */
function methodWithSuper(fun, name, superclass) {
	// optimization: no need to wrap if fun does not contain _super
	if (fun.toString().search(/\W_super\W/m) < 0)
		return fun;
	
	return function() {
		// create the _super function and store it in this._super.
		// save any previous value so we can restore it at the end
		var savedsuper = this._super;
		this._super = (superclass == Object) ? noSuper : (superclass.__methods[name] || noSuper);
		try {
			// call the original method
		 	return fun.apply(this, arguments);
		} finally {
			// restore state
			if (savedsuper) this._super = savedsuper; else delete this._super;
		}
	};
}

// [begin mixin]
/*
 *	This is similar to the above but for wrappers, which must also take care of _inner
 *	in a similar way as _super.	
 */
function wrapMixinMethod(fun, name, superclass) {
	// optimization: no need to wrap if fun does not contain _super or _inner
	if (fun.toString().search(/\W_super\W/m) < 0)
		if (fun.toString().search(/\W_inner\W/m) < 0 )
			// simple case where there is no _inner or _super: return the function itself
			return fun;
		else
			// we just need to support _inner
			return function() {
				var savedinner = this._inner;
				this._inner = arguments.callee.__inner;
				try {
					return fun.apply(this, arguments);
				} finally {
					// restore state
					if (savedinner) this._inner = savedinner; else delete this._inner;
				}
			};
	
	// this is the general case where we support both _inner and _super
	return function() {
		// save _super and _inner and set them to the proper values
		var savedsuper = this._super;
		this._super = (superclass == Object) ? noSuper : (superclass.__methods[name] || noSuper);
		var savedinner = this._inner;
		this._inner = arguments.callee.__inner;
		// call the original method
		try {
			return fun.apply(this, arguments);
		} finally {
			// restore _super and _inner
			if (savedsuper) this._super = savedsuper; else delete this._super;
			if (savedinner) this._inner = savedinner; else delete this._inner;
		}
	};
}

/*
 *	Add / remove mixin methods.
 *	Mixins are only allowed to define methods that are not already defined in the class.
 *	(Methods that are already defined are silently skipped).
 */
function defineMixinMethods(myClass, mixin) {
	// do not override methods (use wrappers for that)
	for (var m in mixin.methods)
		if (! myClass.ownMethod(m)) {
			var method = mixin.methods[m];
			myClass.method(m, method);
			// we need to mark that this method was added by the mixin so we can remove it later
			// 'method' either stores the method itself or the method wrapped for super
			// in the first case, we will be able to recognize the function later,
			// in the latter we need to decorate it.
			// note that if we decorated it in both cases, we would have the problem of decorating 
			// a mixin method that is used in several classes.
			var storedMethod = myClass.ownMethod(m);
			if (storedMethod != method)
				storedMethod.__owner = mixin;
		}
}

function undefineMixinMethods(myClass, mixin) {
	for (var m in mixin.methods) {
		var method = mixin.methods[m];
		var storedMethod = myClass.ownMethod(m);
		if (storedMethod && (storedMethod === method || storedMethod.__owner === mixin))
			delete myClass.__methods[m];	// *** note that if the method had wrappers, they are destroyed too
	}
}

/*
 *	Functions used to redefine a method that has wrappers:
 *	'unwrapWrappers' removes wrappers and returns them in an array
 *	if upto is undefined, all wrappers are removed and returned
 *	if upto is defined, all wrappers up to it are removed and all of them but 'upto' itself are returned
 *	'wrapWrapper' adds a list of wrappers returned by 'unwrapWrappers'	
 */
function unwrapWrappers(myClass, name, upto) {
	var fun = myClass.ownMethod(name);
	var wrappers = [];
	while (fun && fun.__inner) {
		var wrapper = myClass.__popWrapper(name);
		// stop if it's the one we're looking for, store it for later rewrapping otherwise
		if (upto && wrapper === upto)
			break;
		wrappers.push(wrapper);
		// walk down the stack of wrappers
		fun = fun.__inner;
	}
	return wrappers;
}

function wrapWrappers(theClass, name, wrappers) {
	for (var i = wrappers.length-1; i >= 0; i--)
		theClass.wrap (name, wrappers[i]);
}
// [end mixin]

// [begin wrapfield]
/*
 *	Wrap an existing field with getter and setter functions.
 *	The 'getter' and 'setter' functions can access the original field with this._get() and this._set(val).
 *	(Note that referring to the original field, say f, as this.f will cause an infinite recursion.)
 *	Multiple wrappers can be nested.
 *	'owner' is an arbitrary value that identifies the wrapper so it can be removed with unwrapField.
 */

function makeGetterSetter(obj, field, getter, setter, owner) {
	// the functions that implement _get and _set for use in the setter and getter
	var getWrapped = function() { return obj[field]; };
	var setWrapped = function(val) { obj[field] = val; };
	
	// the function that wraps the getter so that this._get() is defined
	var realGetter = getter;
	if (getter) {
		realGetter = function() {
			var savedGet = this._get; this._get = getWrapped;
			var savedSet = this._set; this._set = setWrapped;
			try {
				return getter.call(this);
			} finally {
				if (savedGet) this._get = savedGet; else delete this._get;
				if (savedSet) this._set = savedSet; else delete this._set;			
			}
		};
		realGetter.__orig = getter;
		if (owner) realGetter.__owner = owner;
	} else // *** this is to have a default getter in case none is defined. I thought we could do away with this
		realGetter = function() { return obj[field]; }
	
	// the function that wraps the setter so that this._set() is defined
	var realSetter = setter;
	if (setter) {
		realSetter = function(val) {
			var savedGet = this._get; this._get = getWrapped;
			var savedSet = this._set; this._set = setWrapped;
			try {
				setter.call(this, val);
			} finally {
				if (savedGet) this._get = savedGet; else delete this._get;
				if (savedSet) this._set = savedSet; else delete this._set;
			}
		};
		realSetter.__orig = setter;
		if (owner) realSetter.__owner = owner;
	} else // *** this is to have a default setter in case none is defined. I thought we could do away with this
		realSetter = function(val) { obj[field] = val; }
	
	return {
		getter: realGetter,
		setter: realSetter
	};
}

function wrapField(obj, field, getter, setter, owner) {
	// the wrapped field will be renamed $<field>
	var wrappedField = '$'+field;
	var d = Object.getOwnPropertyDescriptor(obj, field);
	var oldGetter = d ? d.get : undefined; //obj.__lookupGetter__(field);
	var oldSetter = d ? d.set : undefined; //obj.__lookupSetter__(field);
	
	// rename the wrapped field into $<field>
	if (obj.hasOwnProperty(wrappedField)) {
		// the field was already wrapped as $<field>, so wrap the original field (which becomes $$<field>, etc.) 
		var origGetter = oldGetter ? oldGetter.__orig : undefined;
		var origSetter = oldSetter ? oldSetter.__orig : undefined;
		var origOwner = oldGetter ? oldGetter.__owner : oldSetter.__owner;
		wrapField(obj, wrappedField, origGetter, origSetter, origOwner);
	} else if (oldGetter || oldSetter) {
		// the field was active: copy the getter and setter
		d = { enumerable: true, configurable: true };
		if (oldGetter)
			d.get = oldGetter;
		if (oldSetter)
			d.set = oldSetter;
		Object.defineProperty(obj, wrappedField, d);
		/*
		if (oldGetter)
			obj.__defineGetter__(wrappedField, oldGetter);
		if (oldSetter)
			obj.__defineSetter__(wrappedField, oldSetter);
		*/
	} else {
		// normal case: copy value
		obj[wrappedField] = obj[field];
	}
	
	// define the getter and setter for the wrapped field
	var wrapped = makeGetterSetter(obj, wrappedField, getter, setter, owner);
	
	// *** it seems that if we define one, we need to define both. I thought we could do away with this
	d = { enumerable: true, configurable: true };
	//if (getter)
		d.get = wrapped.getter;
	//if (setter)
		d.set = wrapped.setter;
	if (getter || setter)
		Object.defineProperty(obj, field, d);
	/*
	if (getter)
		obj.__defineGetter__(field, wrapped.getter);
//	else if (oldGetter)
//		obj.__defineGetter__(field, oldGetter);
	
	if (setter)
		obj.__defineSetter__(field, wrapped.setter);
//	else if (oldSetter)
//		obj.__defineSetter__(field, oldSetter);
	*/
}

function wrapFields(fields, obj, owner) {
	var d;
	for (var field in fields) {
		d = Object.getOwnPropertyDescriptor(fields, field);
		wrapField(obj, field, d.get, d.set/*fields.__lookupGetter__(field), fields.__lookupSetter__(field)*/, owner);
	}
}

/*
 *	unwrap a field
 *	'owner' specifies which wrapper to remove.
 */
function unwrapField(obj, field, owner) {
	var wrappedField = '$' + field;
	var found = !owner;
	
	var d = Object.getOwnPropertyDescriptor(obj, field);
	var getter = d ? d.get : undefined; //obj.__lookupGetter__(field);
	var setter = d ? d.set : undefined; //obj.__lookupSetter__(field);
	
	while (obj.hasOwnProperty(wrappedField)) {
		// retrieve getter and setter from wrapped field
		
		if (! found) {
			if (getter && getter.__owner === owner)
				found = true;
			else if (setter && setter.__owner === owner)
				found = true;
		}
		
		d = Object.getOwnPropertyDescriptor(obj, wrappedField);
		getter = d.get; //obj.__lookupGetter__(wrappedField);
		setter = d.set; //obj.__lookupSetter__(wrappedField);
				
		if (found) {
			delete obj[field];
			// copy wrapped field into current field
			if (getter || setter) {
				var origGetter = getter ? getter.__orig : undefined;
				var origSetter = setter ? setter.__orig : undefined;
				var origOwner = getter ? getter.__owner : (setter ? setter.__owner : undefined);

				var wrapped = makeGetterSetter(obj, wrappedField, origGetter, origSetter, origOwner);
				
				d = { enumerable: true, configurable: true };
				if (getter)
					d.get = wrapped.getter || getter;
				if (setter)
					d.set = wrapped.setter || setter
				Object.defineProperty(obj, field, d);
				/*
				if (getter)
					obj.__defineGetter__(field, wrapped.getter || getter);
				if (setter)
					obj.__defineSetter__(field, wrapped.setter || setter);
				*/
			} else
				obj[field] = obj[wrappedField];
			
			// remove the wrapped field since it is now copied into the current field
			delete obj[wrappedField];
		}
		
		// continue down the chain of wrapped fields
		field = wrappedField;
		wrappedField = '$' + field;
	}
}

/*
 *	unwrap all fields of the object that are wrapped by a given owner.
 */
function unwrapFields(obj, owner) {
	for (var field in obj)
		unwrapField(obj, field, owner);
}

// [end wrapfield]

/**/
		// each base class has a few object methods (in addition to those in Object, of course)
		// set can be used to set multiple field values at once
		// get can be used to get multiple field values at once
		// wrapField can be used to immediately wrap a field of this object
		// unwrapField can be used to remove it. Use a class as 'owner' to remove a field wrapped by a class,
		// and a mixin to remove a field wrapped by the mixin.

var objectMethods = {
			toString: function() { return this.__class ? 'instance of ' + this.__class : '[unknown Classy Object]';},
			className: function() { return this.__class.__name; },
			// classs (with 3ss because 'class' is reserved)
			classs: function() { return this.__class; },
			// Set one or more fields at once. 3 possible syntax:
			//	obj.set('field1', value1, 'field2', value2, ...)
			//	obj.set(['field1', 'field2', ...], [value1, value2, ...])
			//	obj.set({ field1: value, fields2: value2, ...})  - works also with one of our objects (use it's declared fields)
			// Fields that are not defined as such are ignored
			// set always returns the this object
			set: function(field, value /*varargs*/) {
				switch(arguments.length) {
					case 0:
						return this;

					case 1:
						// obj.set({f1: v1, f2: v2, ...})  - sets multiple values
						var obj = field;
						if (obj.__class) {	// this is one of our objects - use its fields
							var fields = obj.__class.listFields();
							for (var i = 0; i < fields.length; i++) {
								var name = fields[i];
								if (this.__class.hasField(name))
									this[name] = obj[name];
							}
						} else {
							for (var name in obj)
								if (this.__class.hasField(name))
									this[name] = obj[name];
						}
						return this;

					case 2:
						// obj.set(["f1", "f2", "f3"], [v1, v2,v3])  - sets multiple values
						if (field instanceof Array && value instanceof Array) {
							for (var i = 0; i < field.length; i++) {
								var name = field[i];
								if (this.__class.hasField(name))
									this[name] = value[i];
							}
							return this;
						}
						// fallthrough to catch the case obj.set('field', value)
					default:
						// obj.set("field", value, ...)
						for (var i = 0; i < arguments.length; i+= 2) {
							var name = arguments[i], value = arguments[i+1];
							if (this.__class.hasField(field))
								this[name] = value;
						}
						return this;
				}
			},
			// get the value of one or more fields. 5 possible syntax:
			//	obj.get()  - returns all the fields and their values in a literal object
			//	obj.get('field')  - returns value
			//	obj.get('field1', 'field2', ...)  - returns a flat field, value, ... list
			//	obj.get(['field1', 'field2', ...])  - returns an array of values
			//	obj.get({ field: v1, field2: v2, ...})  - values of existing fields are ignored, returns an object (works with one of our objects too)
			get: function(field /*varargs*/) {
				switch (arguments.length) {
					case 0:
						//	obj.get()  - returns all the fields
						var fields = this.__class.listFields();
						var obj = {};
						for (var i = 0; i < fields.length; i++) {
							var name = fields[i];
							obj[name] = this[name];
						}
						return obj;

					case 1:
						// obj.get(["f1", "f2", "f3"])  - returns array of values
						if (field instanceof Array) {
							var values = [];
							for (var i = 0; i < field.length; i++) {
								var name = field[i];
								if (this.__class.hasField(name))
									values.push(this[name]);
								else
									values.push(undefined);
							}
							return values;
						}

						// obj.get("field")  - returns single value
						if (typeof field == 'string' || field instanceof String) {
							if (this.__class.hasField(field))
								return this[field];
							return undefined;
						}

						// obj.get({f1: v1, f2: v2, ...})  - values are ignored
						if (typeof field == 'object') {
							var obj = {};
							if (obj.__class) {	// this is one of our objects
								var fields = obj.__class.listFields();
								for (var i = 0; i < fields.length; i++) {
									var name = fields[i];
									if (this.__class.hasField(name))
										obj[name] = this[name];
								}
							} else {
								for (name in field)
									if (this.__class.hasField(name))
										obj[name] = this[name];
							}
							return obj;					
						}
						return null;

					default:
						//	obj.get('field1', 'field2', ...)  - returns a flat field, value list
						var result = [];
						for (var i = 0; i < arguments.length; i++) {
							var name = arguments[i];
							if (this.__class.hasField(name))
								result.push(name, this[name]);
						}
						return result;
				}
			},
// [begin wrapfield]
			wrapField: function(field, getter, setter, /*opt*/ owner) { wrapField(this, field, getter, setter, owner || this); return this; },
			wrapFields: function(fields, /*opt*/ owner) { wrapFields(fields, this, owner || this); },
			unwrapField: function(field, /*opt*/ owner) { unwrapField(this, field, owner || this); return this; },
			unwrapFields: function(/*opt*/ owner) { unwrapFields(this, owner || this); return this; },
// [end wrapfield]
		};

/**/

/*
 *	Create a new class
 */
function newClass(superclass) {
	if (! superclass) 
		superclass = Object;
	
	// the future prototypes in the delegation chains for class methods (including constructors),
	// constructors (in fact, initializers), and methods
	var metaclass, constructors, methods;
	
	// the constructor for the metaclass object
	function classProto() {}
	
	if (superclass === Object) { // it's a new base class
		// the tail of the metaclass delegation chain is the Metaclass object itself.
		classProto.prototype = Metaclass;
		
		// the tail of the constructors delegation chain.
		constructors = {};
		
		/**/
		// the methods defined in every class
		function methodTable() {}
	    methodTable.prototype = objectMethods; 
	    methods = new methodTable(); 
	    /**/
	} else { // it's a new subclass
		// chain the metaclass to the superclass's metaclass
		classProto.prototype = superclass.__metaclass;
		
		// create a constructor table that is chained to the superclass's constructor table
		function ctorTable() {}
		ctorTable.prototype = superclass.__constructors;
		constructors = new ctorTable();
		
		// similarly, create a method table thast is chained to the superclass's method table
		function methodTable() {}
	    methodTable.prototype = superclass.__methods; 
	    methods = new methodTable(); 
	}
	
	// create the metaclass object. It's superclass is the metaclass of the superclass (!)
	metaclass = new classProto();
//	metaclass.superclass = classProto.prototype;
	
	// constructor for the class object itself
	// its prototype is the new metaclass
	// *** we could get rid of the '__' prefix now that all external methods are in other objects (metaclass, constructors, methods) ***
	var cls = function() {
		this.__metaclass = metaclass;
		this.__superclass = superclass;
		this.__constructors = constructors;
		this.__methods = methods;
		this.__fields = {};
		this.__activeFields = {};		// [activefield]
		this.__mixins = [];				// [mixin]
		this.__wrappedFields = {};		// [wrappedfield]
	};
	cls.prototype = metaclass;
	
	// finally, create and return the class itself
	return new cls();
}

/*
 *	Metaclass is the prototype for class objects.
 *	It contains the methods that can be called on a class:
 *		- name and toString, to give the class a name and print a simple text description ("class X")
 *		- __init and __alloc, for object creation, which are private (hence the __ prefix)
 *		- create, the default constructor for objects of this class
 *		- field, activField and fields, to declare fields
 *		- hasField, hasOwnField to test existence of a declared field (active or not)
 *		- constructor and constructors, to declare constructors
 *		- method and methods, to declare methods
 *		- subclass, to create a new subclass
 *		- superclass, to return the superclass
 *		- hasOwnMethod, hasOwnConstructor to test the existence of a method or constructor in that specific class
 *		- hasMethod, hasConstructor to test the existence of a method or constructor along the inheritance chain
 *		- classMethod, classMethods, classField, classFields to add class methods and fields	[metaclass]
 *		- wrap, unwrap, unwrapAll, wrappers, wrapped to manage method wrappers		[mixin]
 *		- wrapField, wrapFields to wrap fields with getter/setter	[wrapfield]
 *		- mixin, unmix, hasMixin to manage mixins									[mixin]
 *
 *	A few points worth noting:
 *		- default values: when creating a new object, the fields described in its class (and its superclasses)
 *		  are copied before the constructor itself is called.
 *		  If a default value is:
 *				- a scalar, a Classy object or class, its value is simply assigned to the object property
 *				- a litteral object or array, a (deep) copy is made and assigned to the object property
 *				- a function, the result of calling the function is assigned to the object property
 *				- an active field, i.e. a field with a getter and/or setter, the getter and/or setter are copied as is
 *		  In case you want a literal object to not be cloned but instead shared by the various instances,
 *		  you can do one of two things:
 *				- mark it as immutable by setting its __immutable property to true
 *				- define the following function:
 *					function shared(obj) { return function() {return obj; }};
 *				  and use it for the default value:
 *					field('color', shared({r: 0, g: 1, b:0.5}));
 *		
 */
Metaclass = {
	// convenience functions to give/get the class a name - helpful when debugging
	name: function(name) {
		this.__name = name;
		return this;
	},
	className: function() {
		return this.__name;
	},

	// short text description: 'class X' if it has a name, 'class #nn' otherwise
	toString: function() {
		return 'class '+ (this.__name || '');
	},

	// same for util.inspect
	inspect: function() {
		return this.toString();
	},
	
	// return the superclass
	superclass: function() {
		return this.__superclass;
	},

	// intialize the properties of a new object from the default values of the field
	__init: function(obj) {
		// walk up the inheritance chain to start at the top
		if (this.__superclass !== Object)
			this.__superclass.__init(obj);
		
		// 'intelligently' copy the default values:
		copyFields(this.__fields, obj);
		copyActiveFields(this.__activeFields, obj);			// [activefield]
		wrapFields(this.__wrappedFields, obj, this);		// [wrapfield];
// [begin mixin]
		for (var m = 0; m < this.__mixins.length; m++) {
			var mixin = this.__mixins[m]; 
			copyFields(mixin.fields, obj);
			wrapFields(mixin.fieldWrappers, obj, mixin);	// [wrapfield];
		}
// [end mixin]
	},
	
	// allocate a new object and initialize its properties
	__alloc: function(init) {
		// set the proper prototype before calling the object constructor
		object.prototype = this.__methods;
		return new object(this, init);
	},
	
	create: function(init) {
		var newobj = this.__alloc(init);
// [begin mixin]
		for (var m = 0; m < this.__mixins.length; m++)
			this.__mixins[m].constructor.apply(newobj);
// [end mixin]
		return newobj;
	},
	
	// define a field with its default value
	field: function(name, value) {
		this.__fields[name] = value;
		return this;
	},
	
	// define an active field with its getter and setter
	activeField: function(name, getter, setter) {
		var d = { enumerable: true, configurable: true };
		if (getter)
			d.get = getter;
		if (setter)
			d.set = setter;
		Object.defineProperty(this.__activeFields, name, d);
		return this;
	},
	
	// define multiple fields at once, using a literal object of the form {x: 0, y: 0}
	// this form also supports active fields, i.e. fields with getter and/or setter, e.g. {get x() {...}, set x(val) {...}, ...}
	fields: function(list) {
		for (var item in list)
			if (! copyActiveField(list, item, this.__activeFields))	// [activefield]
				this.field(item, list[item]);
		return this;
	},
	
	// return true if field defined in this class
	hasOwnField: function(name) {
		return this.__fields.hasOwnProperty(name) || this.__activeFields.hasOwnProperty(name);
	},

	// return true if field defined in this class or a superclass
	hasField: function(name) {
		var cl = this;
		do {
			if (cl.hasOwnField(name))
				return true;
			cl = cl.__superclass;
		} while (cl != Object);
		return false;
	},

	// return array with names of local fields
	listOwnFields: function() {
		var result = [];
		for (var field in this.__fields)
			result.push(field);
		for (field in this.__activeFields)
			result.push(field);
		return result;
	},

	// return array with names of fields in this class and any superclass
	listFields: function() {
		var cl = this;
		var result = [];
		var field;
		do {
			for (field in cl.__fields)
				if (result.indexOf(field) < 0)
					result.push(field);
			for (field in cl.__activeFields)
				if (result.indexOf(field) < 0)
					result.push(field);
			cl = cl.__superclass;
		} while (cl != Object);
		return result;
	},

	// define one constructor. Omit the name or use 'create' for the default constructor
	constructor: function(name, fun) {
		// define the default 'create' constructor if name is omitted
		if (! fun && typeof(name) == 'function') {
			fun = name;
			name = 'create';
		}
		
		// create the initialization function and store it in __constructors
		fun = constructorWithSuper(this, name, fun);		
		this.__constructors[name] = fun;
		
		// create the actual constructor function, which creates the object with __alloc and then calls the initializer
		// note that by storing this constructor in the metaclass, it is visible to this class and all its subclasses
		// through the delegation link established in newClass
		this.__metaclass[name] = function() {
			var obj = this.__alloc();
			fun.apply(obj, arguments);
			return obj;
		};
		return this;
	},
	
	// define multiple constructors at once, using a literal object
	constructors: function(list) {
		for (var item in list)
			this.constructor(item, list[item]);
		return this;
	},
	
	// define (or redefine) one method - *** note that if the method exists and has wrappers, they are all removed
	method: function(name, fun) {
		if (! fun) {	// undefine the method (and all its wrappers)
			delete this.__methods[name];
			return this;
		}
		var wrappers = unwrapWrappers(this, name);	// [mixin]
		fun = methodWithSuper(fun, name, this.__superclass);
		this.__methods[name] = fun;
		wrapWrappers(this, name, wrappers);			// [mixin]
		return this;
	},

	// define multiple methods at once, using a literal object
	methods: function(list) {
		for (var item in list)
			this.method(item, list[item]);
		return this;
	},
	
	// create a subclass of this class
	subclass: function() {
		return newClass(this);
	},
	
	// return the superclass of this class
	superclass: function() {
		return this.__superclass;
	},
	
	// test existence of method and constructor in this class
	hasOwnConstructor: function(name) {
		return name == 'create' || this.__constructors.hasOwnProperty(name);
	},
	hasOwnMethod: function(name) {
		return this.__methods.hasOwnProperty(name);
	},
	
	// get constructor and method bodies
	ownConstructor: function(name) {
		return this.__constructors.hasOwnProperty(name || 'create');
	},
	ownMethod: function(name) {
		return this.__methods.hasOwnProperty(name) ? this.__methods[name] : undefined;
	},
	
	// return array with names of local fields
	listOwnMethods: function() {
/*		var result = [];
		for (var method in this.__methods)
			result.push(method);
		return result;
*/
/**/
		return Object.keys(this.__methods);
/**/
	},

	// return array with names of fields in this class and any superclass
	listMethods: function() {
		var cl = this;
		var result = [];
		var method;
		do {
			for (method in cl.__methods)
				if (result.indexOf(method) < 0)
					result.push(method);
			cl = cl.__superclass;
		} while (cl != Object);
		return result;
	},

	// test existence of method and constructor in this class or one of its superclasses
	hasConstructor: function(name) {
		return name == 'create' || (this.__constructors[name] !== undefined);
	},
	hasMethod: function(name) {
		return this.__methods[name] !== undefined;
	},

	getMethod: function(name) {
		return this.__methods[name];
	},

// [begin metaclass]
	classMethod: function(name, fun) {
		if (! fun) {	// undefine the class method
			delete this.__metaclass[name];
			return this;
		}
		this.__metaclass[name] = fun;
		return this;
	},
	
	classMethods: function(list) {
		for (var item in list)
			this.classMethod(item, list[item]);
		return this;
	},
	
	classField: function(name, value) {
		this.__metaclass[name] = value;
		return this;
	},
	
	classFields: function(list) {
		for (var item in list)
			if (! copyActiveField(list, item, this.__metaclass))	// [activefield]
				this.classField(item, list[item]);
		return this;
	},
// [end metaclass]

// [begin mixin]
	// add a wrapper to method 'name'
	wrap: function(name, fun) {
		// the method being wrapped
		var forig = this.ownMethod(name);
		// define the wrapping method in such a way that this._inner calls the method being wrapped
		var fnew = wrapMixinMethod(fun, name, this.__superclass);
		// store the original method in fnew.__inner so it can be accessed when it is called
		// optimization: this is not necessary when the wrapper does not call _super nor _inner
		// if there was no method being wrapped, create a dummy one that just calls _super and mark it as such
		if (fnew !== fun)
			fnew.__inner = forig || methodWithSuper(function() { this._super.apply(this, arguments); }, name, this.__superclass);
		if (! forig)
			fnew.__wasempty = true;
		fnew.__wrapper = fun; // remember the original wrapper so we can unwrap it
		this.__methods[name] = fnew;

		return this;
	},
	
	// define multiple wrappers at once, using a literal object
	wrappers: function(list) {
		for (var item in list)
			this.wrap(item, list[item]);
		return this;
	},
	
	// test if the method is wrapped by wrapper (if wrapper is not specified, test if method is wrapped)
	wrapped: function(name, wrapper) {
		var fun = this.ownMethod(name);
		if (! wrapper)
			return fun && fun.__inner;
		while (fun && fun.__inner) {
			if (fun.__wrapper === wrapper)
				return true;
			fun = fun.__inner;
		}
		return false;
	},
	
	// internal method to remove the top wrapper
	__popWrapper: function(name) {
		var fun = this.ownMethod(name);
		if (fun.__wasempty)	// this is when we wrap a non-existing method
			delete this.__methods[name];
		else
			this.__methods[name] = fun.__inner;
		return fun.__wrapper;
	},
	
	// remove a wrapper (or the top one if it is not specified)
	unwrap: function(name, wrapper) {
		var fun = this.ownMethod(name);
		if (! wrapper && fun)
			wrapper = fun.__wrapper;
		var rewrap = unwrapWrappers(this, name, wrapper);
		wrapWrappers(this, name, rewrap);
		
		return this;
	},
	
	// unwrap all wrappers from method name
	unwrapAll: function(name) {
		unwrapWrappers(this, name);
		
		return this;
	},
	
// [begin wrapfield]
	// wrap one field
	wrapField: function(field, getter, setter) {
		var d = { enumerable: true, configurable: true };
		if (getter)
			d.get = getter;
		if (setter)
			d.set = setter;
		if (getter || setter)
			Object.defineProperty(this.__wrappedFields, field, d);
		/*
		if (getter)
			this.__wrappedFields.__defineGetter__(field, getter);
		if (setter)
			this.__wrappedFields.__defineSetter__(field, setter);
		*/
		return this;
	},
	
	// wrap one or more fields defined in a property list with "set f() / get f(val)" syntax
	wrapFields: function(list) {
		for (var item in list)
			copyActiveField(list, item, this.__wrappedFields);
		// note: non active fields are ignored silently
		return this;
	},
	
	// test if a field is being wrapped
	wrappedField: function(field) {
		return this.__wrappedFields.hasOwnProperty(field);
	},
	
	// stop wrapping a field (note: this does _not_ remove it from existing objects)
	unwrapField: function(field) {
		delete this.__wrappedFields[field];
		return this;
	},
	
// [end wrapfield]

	// add a mixin
	mixin: function(mixin) {
		this.__mixins.push(mixin);
		defineMixinMethods(this, mixin);
		this.wrappers(mixin.wrappers);
		
		return this;
	},
	
	// remove a mixin - *** wrapped fields are not unwrapped ***
	unmix: function(mixin) {
		var i = this.__mixins.indexOf(mixin);
		if (i < 0)
			return this;
		// remove mixin from array
		this.__mixins.splice(i, 1);	
		// remove wrappers
		for (var m in mixin.wrappers)
			this.unwrap(m, mixin.wrappers[m]);
		// remove methods (only those that were actually added)
		undefineMixinMethods(this, mixin);
		return this;
	},
	
	// test if a mixin is applied to the class
	hasMixin: function(mixin) {
		return this.__mixins.indexOf(mixin) >= 0;
	},
// [end mixin]

};

// end of CLassy definition: return the exported objects
//	return {
/***
exports = module.exports = {
		newClass: newClass,		// this is all we need to use Classy
		metaclass: Metaclass,	// this is for those who want to fiddle with the metaclass, e.g. to add new methods
								// For any Classy class, "A instanceof Classy.metaclass" returns true
		object: object,			// this is the constructor of Classy objects, i.e. "o instanceof Classy.object" returns true
	};
***/
//})();

exports.newClass = newClass;	// this is all we need to use Classy
exports.metaclass = Metaclass;	// this is for those who want to fiddle with the metaclass, e.g. to add new methods
								// For any Classy class, "A instanceof Classy.metaclass" returns true
exports.object = object;		// this is the constructor of Classy objects, i.e. "o instanceof Classy.object" returns true

// hack from http://caolanmcmahon.com/posts/writing_for_node_and_the_browser/
// to have code that works both in server and client (alternative is require.js, but it is a lot more heavy)
})(typeof exports === 'undefined' ? this['OO'] = {} : exports);
