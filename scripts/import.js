const cson = require('cson');
const fs = require('fs');
const execSync = require('child_process').execSync;
const parameterize = require('parameterize');
const util = require('util');
const genex = require('genex');
const ret = require('ret');

// const repo = 'https://github.com:file-icons/atom';
const defs = cson.parseCSFile('./defs/config.cson');
const stylesIcons = fs.readFileSync('./defs/styles/icons.less').toString();
const darkFontColour = "#cccccc";
const lightFontColour = "#6c6c6c";

var icons = {};
var result;

let regex = /\.(.*?)-icon:before\s+{\s+\.(\w+); content: "(.*?)"/g;
let fontMap = {
    "fi": "file-icons",
    "fa": "fontawesome",
    "octicons": "octicons",
    "mf": "mfixx",
    "devicons": "devopicons"
}

// hardcoded files and folder, i.e ones that are default in atom
const hardcoded = {
    "_folder": "\\f016",
    "_file": "\\f011",
    "_icon-file-text": "\\f011",
    "_icon-file-binary": "\\f094",
    "_icon-file-zip": "\\f013",
    "_icon-file-pdf": "\\f014",
    "_icon-file-code": "\\f05f",
    "_fd_root": "\\f001",
    "_fd_root_open": "\\f001",
};

for(let key in hardcoded) {
    let value = hardcoded[key];
    icons[key] = {
        'fontCharacter': value,
        'fontColor': darkFontColour,
        'fontId': "octicons"
    };
    icons[key + '_l'] = {
        'fontCharacter': value,
        'fontColor': lightFontColour,
        'fontId': "octicons"
    };
}

while ((match = regex.exec(stylesIcons)) !== null) {
    let name = "_" + match[1];
    let font = match[2];
    let character = match[3];
    icons[name] = {
        'fontCharacter': character,
        'fontColor': darkFontColour,
        'fontId': fontMap[font]
    };
    icons[name + "_l"] = {
        'fontCharacter': character,
        'fontColor': lightFontColour,
        'fontId': fontMap[font]
    };
}

execSync("git submodule update --remote --merge")
execSync("cp defs/fonts/*.woff2 icons/")

let fonts = Object.values(fontMap).map(function (name){
    return {
        "id": name,
        "src": [
            {
                "path": "./" + name +".woff2",
                "format": "woff2"
            }
        ],
        "weight": "normal",
        "style": "normal",
        "size": "100%"
    };
});

var extensions = {}, extensions_l = {};
var files = {}, files_l = {};
var folders = {}, folders_l = {};

let colourMap = {
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

function darkColourFor(colourName) {
    if(colourName instanceof Array) {
        return colourMap[colourName[0]];
    } else if(colourMap[colourName]) {
        return colourMap[colourName];
    } else if(typeof(colourName) === "string" && colourName.startsWith("auto")) {
        return colourMap[colourName.replace("auto", "medium")];
    } else {
        return darkFontColour;
    }
}

function lightColourFor(colourName) {
    if(colourName instanceof Array) {
        return colourMap[colourName[1]];
    } else if(colourMap[colourName]) {
        return colourMap[colourName];
    } else if(typeof(colourName) === "string" && colourName.startsWith("auto")) {
        return colourMap[colourName.replace("auto", "dark")];
    } else {
        return lightFontColour;
    }
}

function parseRegex(regex) {
    var gen = [];
    try {
        let count = genex(regex).count();

        if (count <= 1000) {
            genex(regex).generate(function (output) {
                gen.push(output);
            });
        } else {
            console.log(regex + " skipped regex has too many cases to generate: " + count);
        }
    } catch(exception) {
        console.log(regex + "skipped regex caused an error: " + exception);
    }

    return gen;
}

function process(hash, set, set_l) {
    let match = hash.match;
    let icon = hash.icon;
    let colour = hash.colour;

    if(match instanceof Array) {
        for(var m = 0; m < match.length; m++) {

            let nested = match[m];

            var ext = nested[0];
            let colour = nested[1];

            var iconName = icon;


            if(icons["_" + icon] && colour !== undefined) {
                iconName = icon + "_" + colour

                let darkColour = darkColourFor(colour);
                if(darkColour === undefined) {
                    console.log("no dark colour in colourMap = " + colour);
                }
                icons["_" + iconName] = JSON.parse(JSON.stringify(icons["_" + icon]));
                icons["_" + iconName].fontColor = darkColour;

                let lightColour = lightColourFor(colour);
                if(lightColour === undefined) {
                    console.log("no light colour in colourMap = " + colour);
                }
                icons["_" + iconName + "_l"] = JSON.parse(JSON.stringify(icons["_" + icon + "_l"]));
                icons["_" + iconName + "_l"].fontColor = darkColour;
            }

            if(ext instanceof RegExp) {
                console.log("regexp " + util.inspect(ext));
                let exts = parseRegex(ext);
                for(var i = 0; i < exts.length; i++) {
                    let ext = exts[i];
                    if(ext.startsWith(".")) {
                        extensions[ext.substring(1).toLowerCase()] = "_" +iconName;
                        extensions_l[ext.substring(1).toLowerCase()] = "_" + iconName + "_l";
                    } else {
                        set[ext.toLowerCase()] = "_" + iconName;
                        set_l[ext.toLowerCase()] = "_" + iconName + "_l";
                    }
                    console.log(ext + " => " + iconName);
                }
            } else if(typeof(ext) === "string") {
                console.log("string " + util.inspect(ext));
                if(ext.startsWith(".")) {
                    extensions[ext.substring(1).toLowerCase()] = "_" + iconName;
                    extensions_l[ext.substring(1).toLowerCase()] = "_" + iconName + "_l";
                } else {
                    set[ext.toLowerCase()] = "_" + iconName;
                    set_l[ext.toLowerCase()] = "_" + iconName + "_l";
                }
                console.log(ext + " => " + iconName);
            } else {
                console.log("skipped " + ext);
            }
        }
    } else if(match instanceof RegExp) {
        let exts = parseRegex(match);
        var iconName = icon;

        if(icons["_" + icon] && colour !== undefined) {
            iconName = icon + "_" + colour

            let darkColour = darkColourFor(colour);
            if(darkColour === undefined) {
                console.log("no dark colour in colourMap = " + colour);
            }
            icons["_" + iconName] = JSON.parse(JSON.stringify(icons["_" + icon]));
            icons["_" + iconName].fontColor = darkColour;

            let lightColour = lightColourFor(colour);
            if(lightColour === undefined) {
                console.log("no light colour in colourMap = " + colour);
            }
            icons["_" + iconName + "_l"] = JSON.parse(JSON.stringify(icons["_" + icon + "_l"]));
            icons["_" + iconName + "_l"].fontColor = darkColour;
        }

        for(var i = 0; i < exts.length; i++) {
            let ext = exts[i];
            if(ext.startsWith(".")) {
                extensions[ext.substring(1).toLowerCase()] = "_" + iconName;
                extensions_l[ext.substring(1).toLowerCase()] = "_" + iconName + "_l";
            } else {
                set[ext.toLowerCase()] = "_" + iconName;
                set_l[ext.toLowerCase()] = "_" + iconName + "_l";
            }
            console.log(ext + " => " + iconName);
        }
    } else if(typeof(match) === "string") {
        if(match.startsWith('.')) {
            var iconName = icon;
            if(icons["_" + icon] && colour !== undefined) {
                iconName = icon + "_" + colour

                let darkColour = darkColourFor(colour);
                if(darkColour === undefined) {
                    console.log("no dark colour in colourMap = " + colour);
                }
                icons["_" + iconName] = JSON.parse(JSON.stringify(icons["_" + icon]));
                icons["_" + iconName].fontColor = darkColour;

                let lightColour = lightColourFor(colour);
                if(lightColour === undefined) {
                    console.log("no light colour in colourMap = " + colour);
                }
                icons["_" + iconName + "_l"] = JSON.parse(JSON.stringify(icons["_" + icon + "_l"]));
                icons["_" + iconName + "_l"].fontColor = darkColour;
            }

            extensions[match.substring(1).toLowerCase()] = "_" + iconName;
            extensions_l[match.substring(1).toLowerCase()] = "_" + iconName + "_l";
            console.log(match + " => " + iconName);
        } else {
            console.log(match+ " skipped not a file extension");
        }
    } else {
        console.log(match+ " skipped type");
    }
}

// hardcoded files and folder, i.e ones that are default in atom
extensions['gitignore'] = '_git_medium-red';
extensions['gitmodules'] = '_git_medium-red';
extensions['gitattributes'] = '_git_medium-red';
extensions['cfignore'] = '_gear_medium-yellow';
extensions_l['gitignore'] = '_git_medium-red_l';
extensions_l['gitmodules'] = '_git_medium-red_l';
extensions_l['gitattributes'] = '_git_medium-red_l';
extensions_l['cfignore'] = '_gear_medium-yellow_l';

for(let fileIcon in defs.fileIcons ) {
    process(defs.fileIcons[fileIcon], files, files_l);
}

for(let directoryIcon in defs.directoryIcons) {
    process(defs.directoryIcons[directoryIcon], folders, folders_l);
}

// BUGFIX: BUILD as a fileName has precendence over a file extension, i.e. build.js
delete files["BUILD"]
delete files_l["BUILD"]

var languages = {};

// export file-icons-icon-theme.json and file-icons-colourless-icon-theme.json
var root = {};
root.fonts = fonts;
root.iconDefinitions = icons;
root.file = '_file';
root.folder = "_folder";
root.folderExpanded = "_folder";
root.rootFolder = "_fd_root",
root.rootFolderExpanded = "_fd_root_open",
root.fileExtensions = extensions;
root.fileNames = files;
root.folderNames = folders;
root.folderNamesExpanded = folders;
root.languageIds = languages;
root.light = {
    "file": '_file_l',
    "folder": "_folder_l",
    "folderExpanded": "_folder_l",
    "fileExtensions": extensions_l,
    "fileNames": files_l,
    "folderNames": folders_l,
    "folderNamesExpanded": folders_l
};
root.version = ("https://github.com/file-icons/vscode/commit/" + execSync('git rev-parse HEAD')).replace(/\n$/, '');

let json = JSON.stringify(root, null, 2);
fs.writeFile('./icons/file-icons-icon-theme.json', json, function() {});

Object.keys(icons).map(function(key, index) {
    if(key.endsWith("_l")) {
        icons[key].fontColor = lightFontColour;
    } else {
        icons[key].fontColor = darkFontColour;
    }
});

let colourless = JSON.stringify(root, null, 2);
fs.writeFile('./icons/file-icons-colourless-icon-theme.json', colourless, function() {});
