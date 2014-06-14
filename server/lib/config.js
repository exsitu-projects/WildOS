// Config - load json configuration files
//
// Load a config file
// 	A config file is a json file
// 	It can _inherit_ from another file by specifying a field called 'inherit'
// 		in this case, all properties of the inherited files are merged into the new config
// 	It can also _be based_ on another file by specifying a field called 'basedOn'
// 		in this case only the properties in the file it is based on that exist
// 		in the config file are being merged
//

// Node modules
var Path = require('path');
var util = require('util');

// Shared modules
var SearchPath = require('searchpath');

var searchPath = new SearchPath('../configs:../../configs');
searchPath.extensions('.json');

// Load `file` and merge its properties into `config`.
// If `inherit` is true, all properties are merged,
// otherwise only those that are already defined in `config` are merged.
//
function mergeOne(config, file, inherit) {
	// Lookup the base config...
	var path = searchPath.get(file);
	if (! path)
		return null;

	// ... and load it.
	var base = loadConfig(path);
	if (! base)
		return config;

	// Merge properties.
	for (var prop in base) {
		// Ignore these:
		if (prop == 'inherit' || prop == 'basedOn')
			continue;

		// Only merge those that should be merged.
		if (inherit || config[prop]) {
			if (typeof base[prop] !== 'object') {
				// Simple property: copy it if it does not exist.
				if (! config[prop])
					config[prop] = base[prop];				
			} else {
				// Object or array: look at content and
				// create property if needed in config file.
				if (! config[prop])
					config[prop] = {};
				// Merge the content of the property.
				var target = config[prop];
				var source = base [prop];
				for (var inherited in source)
					if (! target[inherited])
						target[inherited] = source[inherited];				
			}
		}
	}

	return config;
}

// Merge the content of `base` into `config`.
// `base` can be the name of a configuration, or an array of names.
// `inherit` specifies if properties are inherited from or based on `base`.
//
function mergeAll(config, base, inherit) {
	if (util.isArray(base)) {
		for (var i = 0; i < base.length; i++)
			mergeOne(config, base[i], inherit);
	} else
		mergeOne(config, base, inherit);
}

// Load a configuration file and return an object.
// Raises an error if the file does not exist or could not be loaded.
// Two properties are added to the returned object:
// `__dirname` and `__filename`, with the directory and file name of the file that was loaded
//
function loadConfig(configFile) {
	var path = searchPath.get(configFile);
	if (!path)
		throw "Config file not found: "+configFile; 

	var dirname = Path.dirname(path);
	var filename = Path.basename(path);

	// to account for the fact that we are in the lib directory
	// but the lookup is done from the cwd which is the parent directory
	// (require uses a path relative to the requiring file)
	if (path.match(/^\.\//) || path.match(/^\.\.\//))
		path = '../'+path;
	
	var config = null;
	try {
		config = require(path);
	} catch(e) {
		throw "Could not load config file "+configFile+': '+e;
	}

	// added to the config object so that we can find relative files
	config.__dirname = dirname;
	config.__filename = filename;
	
	if (config.basedOn)
		mergeAll(config, config.basedOn, false);
	if (config.inherit)
		mergeAll(config, config.inherit, true);

	return config;
}

exports.load = loadConfig;
exports.searchPath = searchPath;

/* test
var c = loadConfig('WILD');
console.log('WILD', util.inspect(c));
c = loadConfig('WILDleft');
console.log('WILDleft', util.inspect(c));
c = loadConfig('WILDright');
console.log('WILDright', util.inspect(c));
*/