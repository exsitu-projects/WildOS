The WildOS applications
========

### The Browser application ###

The Browser application lets you display any web page on the tiled display.

You specify the web page to be displayed either in the platform window or in the web controller.
In the platform window, you can pan the page by dragging the miniature image of the page, and you can zoom it in/out by using the scrollwheel of your mouse when the cursor is on the miniature image. This makes it easy to scale the web page to the size of your wall display.

These functions are also available on the web controller: tap one of the three buttons `Zoom`, `Move` or `Resize`;
a trackpad appears; dragging in the trackpad controls the corresponding function.

![Screendump of the browser app](img/browser.png)

![Screendump of the browser web controller](img/browser-controller.png)

### The SlideShow application ###

The SlideShow application is designed to show a series of precomputed large images on the wall display. 

The images and the files describing the slideshows must be in the `slides` directory, and the `tilecutter` Mac OS X console application must be used to cut the images into tiles that can be used by the SlideShow application. Separate documentation (to be written!) will explain how to do this. 

The SlideShow application opens a control window load slides, view them and navigate them.
You can load slides with the `Open slideshow` and `Open folder` buttons.
You can also drag a slideshow file or a folder containing images onto the control window.
The `Show in Finder` menu opens the folder holding the slides to make it easy to browse the available slideshows.

Once slides are loaded, they are displayed in the SlideShow window, and the current slide is displayed in the platform control window. To navigate the slides, you can:

- Click a slide in the light table view. The current slide has a yellow outline;
- Clicking the current slide or the `Gallery` button goes into gallery mode, which shows one slide at a time. In this mode, you can click or swipe the slides, or click the arrows to go to the next/previous slide. Clicking outside the slide gets back to the light table;
- Left and right arrows navigate to the next/previous slide; spacebar navigates to the next slide; return opens/closes gallery mode.

The web controller has a similar interface.

![SlideShow application on server](img/slideshow.png )

![SlideShow control panel in light table mode](img/slideshow-help.png)

![SlideShow control panel in gallery mode](img/slideshow-gallery.png)

![SlideShow application web controller in light table mode](img/slideshow-controller.png)

![SlideShow application web controller in gallery mode](img/slideshow-controller-gallery.png)


### The Cursors application ###

The Cursors application lets users create and move several cursors on the wall display. At present, it does not do anything else, e.g. you cannot "click" with those cursors.

The controller interface on both the server and on the web clients lets you create new cursors, select them by clicking their swatch, and delete the selected cursor. On the server, you can move a cursor either by dragging it directly in the miniature image of the wall, or by using the swatch as a joystick. On the web client, when you select a cursor swatch, the large area below turns the same color and you can drag the mouse (or finger on a touch screen) in it to move the cursor with a joystick-like interaction.

![Cursors application on server](img/cursors.png)

![Cursors application web controller](img/cursors-controller.png)

