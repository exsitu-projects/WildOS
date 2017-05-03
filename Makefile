
#walldo=tools/walldo -l mbl
walldo=tools/walldo

version?=`node -e "console.log(require('./renderer/package.json').version)"`
WildOSRoot=WildOS
clientdir=$(WildOSRoot)/$(version)

what:
	@echo "make start: start server and rendering clients"
	@echo "make stop: kill server and rendering clients"
	@echo
	@echo "make server: create the wildos.js library"
	@echo "make install: copy the rendering client to the display cluster"
	@echo "make sync: update files on rendering clients"
	@echo "make update: sync rendering clients and reinstall node modules"
	@echo "make docs: generate the HTML documentation"

echo-version:
	@echo $(version)

set-as-latest:
	$(walldo) rm -rf $(WildOSRoot)/latest 
	$(walldo) ln -s $(version) $(WildOSRoot)/latest

start:
	tools/wildos

stop:
	tools/wildos stop

server: shared/OO.js shared/Log.js shared/ObjectStore.js renderer/lib/ObjectSharer.js renderer/lib/SharingServer.js renderer/lib/SocketIOServer.js
	cd renderer/lib; browserify -r OO -r Log -r ./ObjectSharer -r ./SharingServer -r ./SocketIOServer -r socket.io-client > ../../server/content/wildos.js

install:
	# install WildOS on server
	npm install --prefix server
	# install WildOS on clients
	$(walldo) mkdir -p $(clientdir)
	$(walldo) rsync . $(clientdir)
	$(walldo) -d $(clientdir)/renderer npm install

sync:
	# update WildOS on clients
	$(walldo) rsync . $(clientdir)

update: sync
	# sync reinstall node modules
	$(walldo) -d $(clientdir)/renderer rm -rf node_modules
	$(walldo) -d $(clientdir)/renderer npm install

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
