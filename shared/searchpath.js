//	SearchPath - lookup files with search paths
//
//	Manage search paths to look up files.
//	A search path is a list of directories.
//	
//	The module export is a constructor for paths:
//		var SearchPath = require('searchpath');
//		var mySearchPath = new SearchPath('~/somewhere:/some/where', '$MYSEARCHPATH');
//		...
//		var path = mySearchPath.get('file');
//	returns the first path to the file that exists.
//	
//	A list of extensions can be specified, which are added to the file name in the lookup process if the file does not have one:
//		mySearchPath.extensions('.jpeg:.png', '.pdf');
//
//	The lists of paths and of extensions can be specified as a list of arguments,
//	colon-separated strings, and arrays of these. Environment variables are substituted
//	before parsing them, as well as leading ~ in search paths.
//		new SearchPath('$PATH')
//	adds each individual path in the environment variable PATH
//
//	A `SearchPath` also has two properties to control the search:
//		`lookupCwd` (true by default) specifies whether to start the search in the current directory,
//			as if '.' was in the search path.
//		`lookupAll` (false by default) specifies whether to lookup for the file without any suffix
//			in the case where a list of suffixes is provided but the file does not have one.
//

// node modules
var fs = require('fs');
var util = require('util');

//	Create a new search path initialized from its arguments (empty if no arguments).
//	The arguments are the same as `appendPath`.
//
function SearchPath() {
	this.paths = [];
	this.suffixes = [];
	this.append.apply(this, arguments);
	this.lookupCwd = true;	// lookup file relative to cwd (i.e. as if ./ was in searchpath)
	this.lookupAll = false; // if there are suffixes, do not look up suffixless file
}

// Expand leading ~ into $HOME.
//
function expandTilde(path) {
	/*jshint sub:true */
	if (path.match(/^\~/))
		path = process.env["HOME"]+path.substring(1);
	return path;
}

// Expand environment variables.
//
function expandEnv(path) {
	var f = function(match, submatch) { return process.env[submatch] || ''; };
	while (path.match(/\$/)) {
		path = path.replace(/\$\{([^}]*)\}/, f, 'g').replace(/\$([a-zA-Z0-9_]*)/, f, 'g');
	}
	return path;
}

// Append one or more paths to the search path.
// The arguments to this function can be a string with one or more paths
// separated by colons ('path1:path2'), or an array of such paths.
// Environment variables ('$MYPATH') are substituted, as well
// as leading ~ (replaced by $HOME).
// Returns `this` so that other calls (e.g. to suffixes) can be chained.
//
SearchPath.prototype.append = function() {
	// Go over the arguments
	for (var a = 0; a < arguments.length; a++) {
		var newPath = arguments[a];
		if (! newPath)
			continue;

		if (util.isArray(newPath))
			this.append.apply(this, newPath);	// Apply recursively if it's an array
		else {
			// We assume it's a string.
			newPath = expandEnv(newPath);
			if (newPath.match(/:/))
				this.append(newPath.split(':'));	// Apply recursively after splitting by ':'
			else {
				// Expand leading ~
				newPath = expandTilde(newPath);
				// Avoid duplicates
				if (this.paths.indexOf(newPath) < 0)
					this.paths.push(newPath);
			}
		}
	}
	return this;
};

// Same as `append` but replaces the search path
//
SearchPath.prototype.set = function() {
	this.paths = [];
	this.append.apply(this, arguments);
};

// Add one or more suffixes to be automatically added to file names being looked up.
// Each suffix can be a simple suffix (with or without leading '.'),
// a set of suffixes separated by ':', or an array of the above.
// As with search paths, environment variables are substituted.
// Returns `this` so that other calls (e.g. to append) can be chained.
//
SearchPath.prototype.addExtensions = function() {
	// Go over the arguments
	for (var a = 0; a < arguments.length; a++) {
		var newSuffix = arguments[a];
		if (! newSuffix)
			continue;

		if (util.isArray(newSuffix))
			this.addExtensions.apply(this, newSuffix);	// Apply recursively if it's an array
		else {
			// We assume it's a string
			newSuffix = expandEnv(newSuffix);
			if (newSuffix.match(/:/))
				this.addExtensions(newSuffix.split(':'));	// Apply recursively after splitting by ':'
			else {
				// Add leading . if needed.
				if (! newSuffix.match(/^\./))
					newSuffix = '.'+newSuffix;
				// Avoid duplicates.
				if (this.suffixes.indexOf(newSuffix) < 0)
					this.suffixes.push(newSuffix);
			}
		}
	}
	return this;
};

// Same as `addSuffixes` but replaces the list rather than appending to it.
//
SearchPath.prototype.extensions = function() {
	this.suffixes = [];
	this.addExtensions.apply(this, arguments);
	return this;
};

// Helper function to lookup all the suffixes for a given file.
// Note that if suffixes are specified, the raw file name is not tested.
//
function lookup(path, file, suffixes) {
	path = path+'/'+file;
	if (suffixes && suffixes.length > 0) {
		for (var i = 0; i < suffixes.length; i++) {
			var suffix = suffixes[i];
			console.log('lookup', path+suffix);
			if (fs.existsSync(path+suffix))
				return path+suffix;
		}
	} else {
		console.log('lookup', path);
		if (fs.existsSync(path))
			return path;
	}
	return null;
}

// Look up a file locally and then in the search path.
// Return null if the search failed.
//
SearchPath.prototype.get = function(name) {
	if (!name)
		return null;
	
	var suffixes = this.suffixes;
	var path = null;

	console.log('SearchPath.get', name, ' cwd=', process.cwd());

	// if there is a suffix, do not lookup with other suffixes
	// TODO - maybe change this and look up the file first and then with the other suffixes?
	if (name.match(/[^.]\.[a-zA-Z0-9]*$/))
		suffixes = null;

	// First look up in the current directory (unless `lookupCwd` has been set to false)
	if (this.lookupCwd) {
		path = lookup('.', name, suffixes);
		if (path)
			return path;		
	}

	// If `lookupAll` is set, lookup without suffix
	var i;
	if (this.lookupAll) {
		for (i = 0; i < this.paths.length; i++) {
			path = lookup(this.paths[i], name, null);
			if (path)
				return path;
		}
	}

	// General case.
	for (i = 0; i < this.paths.length; i++) {
		path = lookup(this.paths[i], name, suffixes);
		if (path)
			return path;
	}

	return null;
};

// Return all files in the search path matching the regexp.
//
SearchPath.prototype.find = function(pattern) {
	var matches = [];

	// Go through the paths in the search path
	for (var i = 0; i < this.paths.length; i++) {
		var dir = this.paths[i];
		var files = [];
		try {
			files = fs.readdirSync(dir);
		} catch(e) {
			continue;
		}

		// Go through the files in the dir
		for (var j = 0; j < files.length; j++) {
			var file = files[j];

			// Skip .files
			if (file.match(/^\./))
				continue;

			// Check if it matches the pattern
			if (pattern && !file.match(pattern))
				continue;

			// Check if it matches an allowed suffix
			var match = true;
			if (! this.lookupAll && this.suffixes) {
				match = false;
				for (var k = 0; k < this.suffixes.length; k++) {
					var suffix = this.suffixes[k];
					if (file.match(suffix+'$')) {
						match = true;
						break;
					}
				}
			}

			if (match)
				matches.push(file);
		}
	}

	return matches;
};

module.exports = SearchPath;

/* test
var p = new SearchPath('a', 'b:c', ['d', 'e:f', ['g', 'h:i', 'a']], '~:~/home', '/there/$LOGNAME/Iam${LOGNAME}here', '$PATH');
p.extensions('a', 'b:c', ['d', 'e:f', ['g', 'h:i', 'a']], '$LOGNAME', '$PATH', 'zip')
console.log(util.inspect(p));
console.log(p.get('wildbin'));
console.log(p.get('wildbin.zip'));
*/