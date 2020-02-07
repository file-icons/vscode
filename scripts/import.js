#!/usr/bin/env node

const cson            = require("cson");
const fs              = require("fs");
const {execSync}      = require("child_process");
const util            = require("util");
const genex           = require("genex");

const defs            = cson.parseCSFile("./defs/config.cson");
const stylesIcons     = fs.readFileSync("./defs/styles/icons.less").toString();
const darkFontColour  = "#cccccc";
const lightFontColour = "#6c6c6c";

// HACK(#42)
defs.fileIcons["Pre-commit"].match = /^\.pre-commit-config\.(ya?ml)$/i;

const icons = {};
const regex = /\.(.*?)-icon:before\s+{\s+\.(\w+); content: "(.*?)"/g;
const fontMap = {
	fi: "file-icons",
	fa: "fontawesome",
	octicons: "octicons",
	mf: "mfixx",
	devicons: "devopicons",
};

// Hardcoded file- and folder-icons (i.e, those that are default in Atom)
const hardcoded = {
	_folder: "\\f016",
	_file: "\\f011",
	"_icon-file-text": "\\f011",
	"_icon-file-binary": "\\f094",
	"_icon-file-zip": "\\f013",
	"_icon-file-pdf": "\\f014",
	"_icon-file-code": "\\f05f",
	_fd_root: "\\f001",
	_fd_root_open: "\\f001",
};

for(const key in hardcoded){
	const value = hardcoded[key];
	icons[key] = {
		fontCharacter: value,
		fontColor: darkFontColour,
		fontId: "octicons",
	};
	icons[`${key}_l`] = {
		fontCharacter: value,
		fontColor: lightFontColour,
		fontId: "octicons",
	};
}

let match;
while(null !== (match = regex.exec(stylesIcons))){
	const name = `_${match[1]}`;
	const font = match[2];
	const char = match[3];
	icons[name] = {
		fontCharacter: char,
		fontColor: darkFontColour,
		fontId: fontMap[font],
	};
	icons[`${name}_l`] = {
		fontCharacter: char,
		fontColor: lightFontColour,
		fontId: fontMap[font],
	};
}

const fonts = Object.values(fontMap).map(name => ({
	id: name,
	src: [{path: `./${name}.woff2`, format: "woff2"}],
	weight: "normal",
	style: "normal",
	size: "100%",
}));

const extensions   = {};
const extensions_l = {};
const files        = {};
const files_l      = {};
const folders      = {};
const folders_l    = {};
const colourMap    = {
	// Red
	"medium-red": "#ac4142",
	"light-red": "#c97071",
	"dark-red": "#c97071",
	// Green
	"medium-green": "#90a959",
	"light-green": "#b2c38b",
	"dark-green": "#66783e",
	// Yellow
	"medium-yellow": "#f4bf75",
	"light-yellow": "#fae0bc",
	"dark-yellow": "#ee9e2e",
	// Blue
	"medium-blue": "#6a9fb5",
	"light-blue": "#9dc0ce",
	"dark-blue":  "#46788d",
	// Maroon
	"medium-maroon": "#8f5536",
	"light-maroon": "#be7953",
	"dark-maroon":  "#573421",
	// Purple
	"medium-purple": "#aa759f",
	"light-purple": "#c7a4c0",
	"dark-purple": "#825078",
	// Orange
	"medium-orange": "#d28445",
	"light-orange": "#e1ad83",
	"dark-orange":  "#a35f27",
	// Cyan
	"medium-cyan": "#75b5aa",
	"light-cyan": "#a7d0c9",
	"dark-cyan":  "#4d9085",
	// Pink
	"medium-pink": "#ff00cc",
	"light-pink": "#ff4ddb",
	"dark-pink":  "#b3008f",
};

function darkColourFor(colourName){
	if(Array.isArray(colourName))
		return colourMap[colourName[0]];
	else if(colourMap[colourName])
		return colourMap[colourName];
	else if("string" === typeof colourName && colourName.startsWith("auto"))
		return colourMap[colourName.replace("auto", "medium")];
	else return darkFontColour;
}

function lightColourFor(colourName){
	if(Array.isArray(colourName))
		return colourMap[colourName[1]];
	else if(colourMap[colourName])
		return colourMap[colourName];
	else if("string" === typeof colourName && colourName.startsWith("auto"))
		return colourMap[colourName.replace("auto", "dark")];
	else return lightFontColour;
}

function parseRegex(regex){
	const gen = [];
	try{
		let count = genex(regex).count();
		
		// Strip variable-length sequences so /foo.*\.bar/ will at least match "foo.bar"
		const rmquant = /(?<!^)(?:\.|\[\^(?:[^\\\[\]]|\\.)+\])[*+]\??(?!$)/;
		if(!isFinite(count) && rmquant.test(regex.source)){
			regex = new RegExp(regex.source.replace(rmquant, ""), regex.flags);
			count = genex(regex).count();
		}
		count <= 1000
			? genex(regex).generate(output => gen.push(output))
			: console.warn(`${regex} skipped; too many cases to generate: ${count}`);
	}
	catch(exception){
		console.error(`${regex} skipped: ${exception}`);
	}
	return gen;
}

function process(hash, set, set_l){
	const {match, icon, colour} = hash;

	if(Array.isArray(match)){
		for(let m = 0; m < match.length; ++m){
			const nested = match[m];
			const [ext, colour] = nested;
			let iconName = icon;

			if(icons[`_${icon}`] && undefined !== colour){
				iconName = `${icon}_${colour}`;
				
				const darkColour = darkColourFor(colour);
				if(darkColour === undefined)
					console.warn(`no dark colour in colourMap = ${colour}`);
				
				icons[`_${iconName}`] = JSON.parse(JSON.stringify(icons[`_${icon}`]));
				icons[`_${iconName}`].fontColor = darkColour;
				
				const lightColour = lightColourFor(colour);
				if(undefined === lightColour)
					console.warn(`no light colour in colourMap = ${colour}`);
				
				icons[`_${iconName}_l`] = JSON.parse(JSON.stringify(icons[`_${icon}_l`]));
				icons[`_${iconName}_l`].fontColor = darkColour;
			}

			if(ext instanceof RegExp){
				console.info(`regexp ${util.inspect(ext)}`);
				const exts = parseRegex(ext);
				for(let i = 0; i < exts.length; ++i){
					const ext = exts[i];
					if(ext.startsWith(".")){
						extensions[ext.substring(1).toLowerCase()]   = `_${iconName}`;
						extensions_l[ext.substring(1).toLowerCase()] = `_${iconName}_l`;
					}
					else{
						set[ext.toLowerCase()]   = `_${iconName}`;
						set_l[ext.toLowerCase()] = `_${iconName}_l`;
					}
					console.info(`${ext} => ${iconName}`);
				}
			}
			
			else if("string" === typeof ext){
				console.info(`string ${util.inspect(ext)}`);
				if(ext.startsWith(".")){
					extensions[ext.substring(1).toLowerCase()]   = `_${iconName}`;
					extensions_l[ext.substring(1).toLowerCase()] = `_${iconName}_l`;
				}
				else{
					set[ext.toLowerCase()]   = `_${iconName}`;
					set_l[ext.toLowerCase()] = `_${iconName}_l`;
				}
				console.info(`${ext} => ${iconName}`);
			}
			else console.warn(`skipped ${ext}`);
		}
	}
	
	else if(match instanceof RegExp){
		const exts = parseRegex(match);
		let iconName = icon;

		if(icons[`_${icon}`] && undefined !== colour){
			iconName = `${icon}_${colour}`;
			
			const darkColour = darkColourFor(colour);
			if(undefined === darkColour)
				console.warn(`no dark colour in colourMap = ${colour}`);
			
			icons[`_${iconName}`] = JSON.parse(JSON.stringify(icons[`_${icon}`]));
			icons[`_${iconName}`].fontColor = darkColour;
			
			const lightColour = lightColourFor(colour);
			if(undefined === lightColour)
				console.warn(`no light colour in colourMap = ${colour}`);
			
			icons[`_${iconName}_l`] = JSON.parse(JSON.stringify(icons[`_${icon}_l`]));
			icons[`_${iconName}_l`].fontColor = darkColour;
		}

		for(let i = 0; i < exts.length; ++i){
			const ext = exts[i];
			if(ext.startsWith(".")){
				extensions[ext.substring(1).toLowerCase()]   = `_${iconName}`;
				extensions_l[ext.substring(1).toLowerCase()] = `_${iconName}_l`;
			}
			else{
				set[ext.toLowerCase()]   = `_${iconName}`;
				set_l[ext.toLowerCase()] = `_${iconName}_l`;
			}
			console.info(`${ext} => ${iconName}`);
		}
	}
	
	else if("string" === typeof match){
		if(match.startsWith(".")){
			let iconName = icon;
			if(icons[`_${icon}`] && undefined !== colour){
				iconName = `${icon}_${colour}`;
				
				const darkColour = darkColourFor(colour);
				if(undefined === darkColour)
					console.warn(`no dark colour in colourMap = ${colour}`);
				
				icons[`_${iconName}`] = JSON.parse(JSON.stringify(icons[`_${icon}`]));
				icons[`_${iconName}`].fontColor = darkColour;
				
				const lightColour = lightColourFor(colour);
				if(undefined === lightColour)
					console.warn(`no light colour in colourMap = ${colour}`);
				
				icons[`_${iconName}_l`] = JSON.parse(JSON.stringify(icons[`_${icon}_l`]));
				icons[`_${iconName}_l`].fontColor = darkColour;
			}
			
			extensions[match.substring(1).toLowerCase()]   = `_${iconName}`;
			extensions_l[match.substring(1).toLowerCase()] = `_${iconName}_l`;
			console.info(`${match} => ${iconName}`);
		}
		else console.warn(`${match} skipped not a file extension`);
	}
	else console.warn(`${match} skipped type`);
}

// HACK: Include file-icons dropped by `genex` module
const fixes = require("./import-fixes.json");
for(const icon in fixes){
	for(const ext of fixes[icon]){
		extensions[ext]   = icon;
		extensions_l[ext] = icon + "_l";
	}
}

for(const fileIcon in defs.fileIcons)
	process(defs.fileIcons[fileIcon], files, files_l);

for(const directoryIcon in defs.directoryIcons)
	process(defs.directoryIcons[directoryIcon], folders, folders_l);


// BUGFIX: BUILD as a fileName has precendence over a file extension, i.e. build.js
delete files["BUILD"];
delete files_l["BUILD"];


// Export `file-icons-icon-theme.json` and `file-icons-colourless-icon-theme.json`
const root = {
	fonts: fonts,
	iconDefinitions: icons,
	file: "_file",
	folder: "_folder",
	folderExpanded: "_folder",
	rootFolder: "_fd_root",
	rootFolderExpanded: "_fd_root_open",
	fileExtensions: extensions,
	fileNames: files,
	folderNames: folders,
	folderNamesExpanded: folders,
	languageIds: {},
	light: {
		file: "_file_l",
		folder: "_folder_l",
		folderExpanded: "_folder_l",
		fileExtensions: extensions_l,
		fileNames: files_l,
		folderNames: folders_l,
		folderNamesExpanded: folders_l,
	},
	version: `https://github.com/file-icons/vscode/commit/${execSync("git rev-parse HEAD")}`.replace(/\n+/g, ""),
};

fs.writeFileSync("./icons/file-icons-icon-theme.json", JSON.stringify(root, null, "\t"));

for(const key of Object.keys(icons))
	icons[key].fontColor = key.endsWith("_l")
		? lightFontColour
		: darkFontColour;

fs.writeFileSync("./icons/file-icons-colourless-icon-theme.json", JSON.stringify(root, null, "\t"));
