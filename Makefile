
#walldo=tools/walldo -l mbl
walldo=tools/walldo
tilecutter=tools/tilecutter

slides=../SlideShows
tiles=slides
desttiles=WildOS

what:
	@echo "make start: (re)start the rendering clients"
	@echo "make stop: kill the rendering clients"
	@echo
	@echo "make renderer: create the wildos.js library"
	@echo "make install: copy the rendering client to the display cluster"
	@echo "make update: update the rendering clients"
	@echo "make docs: generate the HTML documentation"
	@echo
	@echo "make makeslides: create the slides with tilecutter"
	@echo "make updateslides: update the slides with tilecutter"
	@echo "make syncslides: update the slides on the display cluster"

start:
	$(walldo) WildOS/renderer/restart

stop:
	$(walldo) killall nw node-webkit

renderer:
	cd renderer/lib; browserify -r OO -r Log -r ./ObjectSharer -r ./SharingServer -r ./SocketIOServer -r socket.io-client > ../../server/content/wildos.js

install:
	# install WildOS on clients
	$(walldo) mkdir WildOS
	$(walldo) rsync . WildOS
	$(walldo) -d WildOS/renderer npm install

update:
	# update WildOS on clients
	$(walldo) rsync renderer shared WildOS
	$(walldo) -d WildOS/renderer npm update

docs: 
	tools/mmdoc -a doc/assets -t doc/src/template.html ReadMe.md
	tools/mmdoc -i doc/src -o doc

makeslides:
	$(tilecutter) -r -d $(srcslides) $(tiles)

updateslides: 
	$(tilecutter) -r -u -d $(srcslides) $(tiles)

syncslides:
	$(walldo) rsync --filter '- thumbs' $(tiles) $(desttiles)

