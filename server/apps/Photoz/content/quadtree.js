// Photoz - View and autozoom photo collections
// (c) 2013-2014 - Michel Beaudouin-Lafon - mbl@lri.fr

// Create a set of CSS rules to animate elements to the various cells in a quadtree.

// Dynamically create CSS rules
// http://stackoverflow.com/questions/13075920/add-css-rule-via-jquery-for-future-created-elements
function CSS( sheet ){
	var elem = document.createElement('style');
	sheet = sheet || document.head.appendChild(elem);
	elem.appendChild(document.createTextNode(''));	// some version of Safari need this?
	this.sheet = sheet.sheet;
}
CSS.prototype = {
    constructor : CSS,
    add  : function( cssText ){
        return this.sheet.insertRule( cssText, this.sheet.cssRules.length );
    },
    del  : function( index ) {
        return this.sheet.deleteRule( index );
    },
    edit : function( index, cssText ){
        var i;
        if( index < 0 ) index = 0;
        if( index >= this.sheet.cssRules.length ) return this.add( cssText );
        i = this.sheet.insertRule( cssText, index );
        if( i === index ) this.sheet.deleteRule( i + 1 );
        return i;
    }
};

var myCss = null;

// Create the CSS rule defining the position of a node of the quadtree.
// The rule targets the class 'pos<code>' and includes an animation to
// smoothly transition to the target position and size from the current one. 
function createNodeCSS(node) {
	var code = node.code;
	var s = node.position.s;
	var x = node.position.x + node.position.w*(s-1)/s/2;
	var y = node.position.y + node.position.h*(s-1)/s/2;
	myCss.add('.pos'+code+' { -webkit-animation: toPos'+code+' 0.5s ease 0s 1 normal forwards; }');
	myCss.add('@-webkit-keyframes toPos'+code+' { to { -webkit-transform: translate('+x+'px, '+y+'px) scale('+s+'); } }');
// no animation (replaces the above 2 lines, but creates problem with overlapping order because the Animation event used in photoz.js is not issued anymore)
//		myCss.add('.pos'+code+' { -webkit-transform: translate('+x+'px, '+y+'px) scale('+s+'); }');
}

// Create a leaf of the quadtree
function createPhoto(node) {
	var code = node.code;
	var img = node.photo;
	var src = img;
	var data = "";

	// Store the paths to the multiple resolutions of the image in data- attributes
	if (img.full) {
		src = img.full;
		data += ' data-full="'+img.full+'"';
	}
	if (img.half) {
		src = img.half;
		data += ' data-half="'+img.half+'"';
	}
	if (img.quarter) {
		src = img.quarter;
		data += ' data-quarter="'+img.quarter+'"';			
	}

	// Create the div holding the photo.
	// The id is of the form 'c<code>'.
	// The class (which determines the position) is "pos<code>" and is defined by createNodeCSS above
	$('body').append('<div id="c'+code+'" class="photo pos'+code+'"><img src="'+src+'"'+data+'"/></div>');
}

// Recursive creationg of the quadtree.
// At each level, the four subnodes are coded by adding 
// '00' (NW), '01' (NE), '10' (SW), '11' (SE) to the parent code
function makeQuadTreeNode(level, code, parent, x, y, s, w, h) {
	var node = {
		level: level,	// unused
		code: code,
		parent: parent,	// unused
		photo: null,
		position: {x: x, y: y, w: w, h: h, s: s},
		children: null,
	};

	if (level > 0) {
		node.children = [];
		s = s/2; w = w/2; h = h/2;
		node.children.push(makeQuadTreeNode(level -1, code+'00', node, x  , y  , s, w, h));
		node.children.push(makeQuadTreeNode(level -1, code+'01', node, x+w, y  , s, w, h));
		node.children.push(makeQuadTreeNode(level -1, code+'10', node, x  , y+h, s, w, h));
		node.children.push(makeQuadTreeNode(level -1, code+'11', node, x+w, y+h, s, w, h));
		createNodeCSS(node);
	} else {
		node.photo = getNextPhotoFor(node);
		createNodeCSS(node);
		createPhoto(node);
	}

	return node;
}

// Create the CSS styles for a quadtree described by a number of level and the size of the root.
function makeQuadTree(levels, w, h) {
	myCss = new CSS();
	myCss.add('.photo {	width: '+w+'px; height:'+h+'px; }');

	return makeQuadTreeNode(levels, '', null, 0, 0, 1, w, h);
}