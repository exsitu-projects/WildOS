// Code injected in the platform control window
//
// Here we let the user load a slideshow and navigate slides.
//

var slidesRoot = 'app://localhost/apps/SlideShow/content/slides/';	// where to find slide thumbs

var app = platform.apps.getApp('SlideShow');

function selectSlideShow() {
	var chooser = $("#openSlideShow");

	if (app.slideShow) {
		chooser.attr('nwworkingdir', app.slideShow.split('/').slice(0, -1).join('/'));
	}

	chooser.change(function(evt) {
		var fileName = $(this).val();
		if (! fileName)
			return;

		if (! app.loadSlideShow(fileName))
			selectSlideShow();
    });
	chooser.trigger('click');
}

function updateState(slideShow) {
	$('#slideShow').val(slideShow.slideShow);
	$('#slide').val(slideShow.currentSlide);

	if (slideShow.currentSlide)
		$('#slideShowImage').show().attr('src', slidesRoot+slideShow.currentSlide+'/thumbs/thumb1000.png');
	else
		$('#slideShowImage').hide();

	if (slideShow.slides)
		$('#slideShowCount').html(' '+(slideShow.currentSlideIndex+1)+'/'+slideShow.slides.length);
	else
		$('#slideShowCount').html('');

	localStorage.slideShow = JSON.stringify({
		name: slideShow.slideShow,
		current: slideShow.currentSlideIndex,
	});
}

function dnd(files) {
	var paths = [];
	for (var i = 0; i < files.length; i++) {
		paths.push(files[i].path);
	}

	app.loadFiles(paths);
}

// Called at the end of the script.
// Creates a UI to control the slides and display the current slide in the miniature wall.
function startSlideShow() {
	// update display on application state change
	app.onSlideChanged(updateState);

	// Create a div that will hold the app's UI, so we can easily remove it
	$('#top').append('<div id="slideShowApp">Slide control: </div>');

	// Add buttons to navigate
	$('#slideShowApp').append('<input id="firstSlide" type="button" value="First"/>');
	$('#firstSlide').click(function() { app.firstSlide(); });
	$('#slideShowApp').append('<input id="prevSlide" type="button" value="Prev"/>');
	$('#prevSlide').click(function() { app.prevSlide(); });
	$('#slideShowApp').append('<input id="nextSlide" type="button" value="Next"/>');
	$('#nextSlide').click(function() { app.nextSlide(); });
	$('#slideShowApp').append('<input id="lastSlide" type="button" value="Last"/>');
	$('#lastSlide').click(function() { app.lastSlide(); });

	// Add text to show the current slide number
	$('#slideShowApp').append('<span id="slideShowCount"></span><br/>');

	// Add a text field to load a different slide
	$('#slideShowApp').append('<input id="slide" type="text" size="40"/><input id="setSlide" type="button" value="Show Slide"/>');
	$('#slide').keypress(function(e) { if (e.which == 13) $('#setSlide').click(); });
	$('#setSlide').click(function() { app.loadSlide($('#slide').val()); });

	// Add a text field to load a slideshow
	$('#slideShowApp').append('<input id="slideShow" type="text" size="40"/><input id="setSlideShow" type="button" value="Load SlideShow"/>');
	$('#slideShow').keypress(function(e) { if (e.which == 13) $('#setSlideShow').click(); });
	$('#setSlideShow').click(function() { selectSlideShow(); });

	// Add a hidden input field to load a slideshow
	$('#slideShowApp').append('<input style="display: none" id="openSlideShow" type="file" accept=".json" nwworkingdir=""/>');

	// Add an image for the thumbnail.
	// *** Not sure how to set the size to be consistent with wall display
	$('#wall').append('<image id="slideShowImage" style="z-index: 1; position: absolute; width: 100%" src=""/>');

	// Manage drag and drop of slideshow and slide onto the wall.
	// `dragAndDropFiles` is defined in `devices/Surface/content/surface-ui.js`
	dragAndDropFiles('#wall', dnd);

	// Reload last slideshow if any
	if (localStorage.slideShow) {
		var state = JSON.parse(localStorage.slideShow);
		if (state.name) {
			app.loadSlideShow(state.name);
			if (app.slides && state.current)
				app.gotoSlide(state.current);
		}
	}

	// Synchronize state
	updateState(app);
}

function stopSlideShow() {
	// Remove the elements that we added
	$('#slideShowApp').remove();
	$('#slideShowImage').remove();
	$('#slideShowJS').remove();

	// Disable drag-and-drop
	dragAndDropFiles('#wall', false);
}

// Go!
startSlideShow();
