PATH := ./node_modules/.bin:$(PATH)

all: install update lint


# Install or download project dependencies
install: node_modules defs

defs:
	test -d $@ || git clone \
		--branch master \
		--single-branch \
		--filter=tree:0 \
		'https://github.com/file-icons/atom.git' $@

node_modules:
	npm install --legacy-peer-deps .


# Pull the latest updates from upstream
update: defs
	cd $^ && git pull -f origin master
	node scripts/update.mjs $^ ./icons


# Check source for errors and style violations
lint: node_modules
	eslint .

.PHONY: lint



# Package a VSIX bundle for uploading to VSCode's marketplace thingie
release: tmp
	cp scripts/content-types.xml 'tmp/[Content_Types].xml'
	grep -e version package.json | tr -d '", \t' | cut -d: -f2 > version
	sed -e "s/%%VERSION%%/`cat version`/g" scripts/extension.xml > tmp/extension.vsixmanifest
	mkdir tmp/extension
	cp -r CHANGELOG.md LICENSE.md README.md icons package.json thumbnail.png tmp/extension
	vsix="file-icons.file-icons-`cat version`.vsix"; \
	cd tmp && zip -r "$$vsix" *
	mv tmp/*.vsix .
	rm -rf version tmp
	open 'https://marketplace.visualstudio.com/manage/publishers/file-icons'

tmp:; mkdir $@


# Wipe generated files and build artefacts
clean:
	rm -rf tmp version

.PHONY: clean
