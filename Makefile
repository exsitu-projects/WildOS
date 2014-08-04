
#walldo=tools/walldo -l mbl
walldo=tools/walldo

what:
	@echo "make start: start server and rendering clients"
	@echo "make stop: kill server and rendering clients"
	@echo
	@echo "make server: create the wildos.js library"
	@echo "make install: copy the rendering client to the display cluster"
	@echo "make sync: update files on rendering clients"
	@echo "make update: sync rendering clients and reinstall node modules"
	@echo "make docs: generate the HTML documentation"

start:
	tools/wildos

stop:
	tools/wildos stop

server:
	cd renderer/lib; browserify -r OO -r Log -r ./ObjectSharer -r ./SharingServer -r ./SocketIOServer -r socket.io-client > ../../server/content/wildos.js

install:
	# install WildOS on clients
	$(walldo) mkdir WildOS
	$(walldo) rsync . WildOS
	$(walldo) -d WildOS/renderer npm install

sync:
	# update WildOS on clients
	$(walldo) rsync . WildOS

update: sync
	# sync reinstall node modules
	$(walldo) -d WildOS/renderer rm -rf node_modules
	$(walldo) -d WildOS/renderer npm install

ReadMe.html: ReadMe.md
	tools/mmdoc -a doc/assets -t doc/src/template.html ReadMe.md

docs: ReadMe.html
	tools/mmdoc -i doc/src -o doc

# SlideShow app
tilecutter=tools/tilecutter
slides=../demo-slides
tiles=slides
tilesRemote=slides

makeslides:
	$(tilecutter) -r -d $(tiles) $(slides)

updateslides: 
	$(tilecutter) -r -u -d $(tiles) $(slides)

syncslides:
	$(walldo) rsync --filter '- thumbs' $(tiles) $(tilesRemote)
