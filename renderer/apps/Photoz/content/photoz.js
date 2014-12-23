// Photoz - View and autozoom photo collections
// (c) 2013-2014 - Michel Beaudouin-Lafon - mbl@lri.fr

// The Photoz app
var photoz;

// Called by quadtree
function getNextPhotoFor(node) {
	var photo = photoz.getNextUnusedPhoto();
	if (! photo)
		return null;

	var server = global.renderer;
	var root = photoz.imageRoot; //'http://'+server.hostname+':'+server.port+'/Photoz/photoz/';
	if (! root.match(/\/$/))
		root += '/';
	
	return {
		full: root + photoz.fullFrameDir + photo,
		half: root + photoz.halfFrameDir + photo,
		quarter: root + photoz.quarterFrameDir + photo,
	};
}

// Get the size of the display window
// (For best effect, you may want to get full-screen first)
var displayWidth = $(window).width(); //2560;
var displayHeight = $(window).height(); //1600;

// "burn in" the animated properties into the target element
// at the end of the animation, so that the next animation
// starts from there.
// 'target' must be a jQuery set ($(...))
function setAnimProps(target) {
	target.one('webkitAnimationEnd', function(e) {
		target.css('-webkit-transform', target.css('-webkit-transform'));
	});
}

// Control whether the autozooming is active or not.
// Automatic zooming is simply clicking randomly on the screen.
var animationRunning = false;

function startAnimation() {
	if (animationRunning)
		return;
	animationRunning = true;
	randomClick();
}

function stopAnimation() {
	animationRunning = false;
}

// Click randomly on the screen until we hit something,
// Repeat every 3 seconds.
function randomClick() {
	if (! animationRunning)
		return;

	var elem = null;
	while (!elem) {
		var x = Math.floor(Math.random()*displayWidth);
		var y = Math.floor(Math.random()*displayHeight);
		elem = document.elementFromPoint(x, y);
		if (elem)
			$(elem).click();
	}

	setTimeout(randomClick, 3000 + Math.floor(Math.random()*3000));
}

// Briefly show a message
function flash(id) {
	$(id).show().delay(1000).fadeOut(500);
}

// Change the resolution of an image.
// The various resolutions are held in the data-attributes of the img element.
function switchToResolution(img, res) {
	var current = img.attr('src');
	var next = img.attr('data-'+res);
	if (next && next != current)
		img.attr('src', next);
}

function initContent() {
	makeQuadTree(2, displayWidth, displayHeight);	// # levels, width, height
//	makeQuadTree(3, displayWidth, displayHeight);	// # levels, width, height

	// Assign initial positions
	$('.photo').each(function() {
		setAnimProps($(this));
	});

	// Animate photo when clicking it
	$(".photo").click(function (ev) {
		// Which photo was clicked
		var target = $(ev.delegateTarget);

		// We have three states: original size, half size, full screen
		// The id of each photo is 'cNNNN' where NNNN is the code for the quadtree position
		// Initially each photo also has the corresponding 'posNNNN' class
		// The 'posNN' classes correspond to the half-size positions
		// The 'pos' class corresponds to full-screen

		// We construct the tag for the half-size 
		var code = target.attr('id').substring(1, 3);
		var tag = 'pos'+code;

		// Now we can easily tell in which state we are and what to do:
		if (target.hasClass('pos')) {
			// Is full-screen, get back to normal size
			switchToResolution(target.children('img'), 'quarter');
			target.removeClass('pos').one('webkitAnimationEnd', function(e) { target.css('z-index', 10); });
// if no animation (see quadtree.js) comment line above and uncomment this one
//			target.removeClass('pos').css('z-index', 10);
		} else
		if (target.hasClass(tag)) {
			// Is half-screen, go to full screen
			switchToResolution(target.children('img'), 'full');
			target.removeClass(tag).css('z-index', 1000).addClass('pos');
		} else {
			// Is normal size, go to half-screen
			switchToResolution(target.children('img'), 'half');
			target.css('z-index', 100).addClass(tag);
		}

		setAnimProps(target);
	});

	// Key binding: <space> starts/stops autozoom
	$('body').keydown(function(ev) {
		if (ev.which != 32)
			return;

		ev.preventDefault();
		if (animationRunning) {
			stopAnimation();
			flash('#stop');
		} else {
			startAnimation();
			flash('#start');
		}
	});

	// Wait 5 seconds before starting autozoom
	setTimeout(startAnimation, Math.round(Math.random()*5000));
}

// Get started!
$(document).ready(function() {
	//get the Photoz app object
	photoz = global.renderer.apps.getApp('Photoz');

	if (photoz.unused.length > 0)
		initContent();
	else // content not here yet: init when content arrives
		photoz.onLoad = initContent;
});
