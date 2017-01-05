const cson = require('cson');
const fs = require('fs');
const execSync = require('child_process').execSync;
const parameterize = require('parameterize');
const util = require('util');
const genex = require('genex');
const ret = require('ret');

const repo = 'https://github.com:DanBrooker/file-icons';
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
    "_file": "\\f011",
    "_binary": "\\f094",
    "_folder": "\\f016",
    "_zip": "\\f013",
    "_pdf": "\\f014",
    "_code": "\\f05f"
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

let icons_c = JSON.parse(JSON.stringify(icons));

execSync("git submodule init; git submodule update")

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

            let darkColour = colourMap[colour];
            if(darkColour && icons["_" + icon]) {
                iconName = icon + "_" + colour

                icons["_" + iconName] = JSON.parse(JSON.stringify(icons["_" + icon]));
                icons["_" + iconName].fontColor = darkColour;
            }

            if(ext instanceof RegExp) {
                console.log("regexp " + util.inspect(ext));
                let exts = parseRegex(ext);
                for(var i = 0; i < exts.length; i++) {
                    let ext = exts[i];
                    if(ext.startsWith(".")) {
                        extensions[ext.substring(1)] = "_" +iconName;
                        extensions_l[ext.substring(1)] = "_" + iconName + "_l";
                    } else {
                        set[ext] = "_" + iconName;
                        set_l[ext] = "_" + iconName + "_l";
                    }
                    console.log(ext + " => " + iconName);
                }
            } else if(typeof(ext) === "string") {
                console.log("string " + util.inspect(ext));
                if(ext.startsWith(".")) {
                    extensions[ext.substring(1)] = "_" + iconName;
                    extensions_l[ext.substring(1)] = "_" + iconName + "_l";
                } else {
                    set[ext] = "_" + iconName;
                    set_l[ext] = "_" + iconName + "_l";
                }
                console.log(ext + " => " + iconName);
            } else {
                console.log("skipped " + ext);
            }
        }
    } else if(match instanceof RegExp) {
        let exts = parseRegex(match);

        let darkColour = colourMap[colour];
        if (darkColour && icons["_" + icon]) {
            let iconName = icon + "_" + colour;

            icons["_" + iconName] = JSON.parse(JSON.stringify(icons["_" + icon]));
            icons["_" + iconName].fontColor = darkColour;

            icon = iconName;
        }

        for(var i = 0; i < exts.length; i++) {
            let ext = exts[i];
            if(ext.startsWith(".")) {
                extensions[ext.substring(1)] = "_" + icon;
                extensions_l[ext.substring(1)] = "_" + icon + "_l";
            } else {
                set[ext] = "_" + icon;
                set_l[ext] = "_" + icon + "_l";
            }
            console.log(ext + " => " + icon);
        }
    } else if(typeof(match) === "string") {
        if(match.startsWith('.')) {
            let darkColour = colourMap[colour];

            if (darkColour && icons["_" + icon]) {
                let iconName = icon + "_" + colour;

                icons["_" + iconName] = JSON.parse(JSON.stringify(icons["_" + icon]));
                icons["_" + iconName].fontColor = darkColour;

                icon = iconName;
            }

            extensions[match.substring(1)] = "_" + icon;
            extensions_l[match.substring(1)] = "_" + icon + "_l";
            console.log(match + " => " + icon);
        } else {
            console.log(match+ " skipped not a file extension");
        }
    } else {
        console.log(match+ " skipped type");
    }
}

// hardcoded files and folder, i.e ones that are default in atom
extensions['gitignore'] = '_git';
extensions['gitattributes'] = '_git';

for(let fileIcon in defs.fileIcons ) {
    process(defs.fileIcons[fileIcon], files, files_l);
}

for(let directoryIcon in defs.directoryIcons) {
    process(defs.directoryIcons[directoryIcon], folders, folders_l);
}

var languages = [];

// export file-icons-icon-theme.json and file-icons-colourless-icon-theme.json
var root = {};
root.fonts = fonts;
root.iconDefinitions = icons;
root.file = '_file';
root.folder = "_folder";
root.folderExpanded = "_folder";
root.fileExtensions = extensions;
root.fileNames = files;
root.folderNames = folders;
root.languageIds = languages;
root.light = {
    "file": '_file_l',
    "folder": "_folder_l",
    "folderExpanded": "_folder_l",
    "fileExtensions": extensions_l,
    "fileNames": files_l,
    "folderNames": folders_l
};
root.version = ("https://github.com/file-icons/vscode/commit/" + execSync('git rev-parse HEAD')).replace(/\n$/, '');

let json = JSON.stringify(root, null, 2);
fs.writeFile('./icons/file-icons-icon-theme.json', json, function() {});

root.iconDefinitions = icons_c;
let colourless = JSON.stringify(root, null, 2);
fs.writeFile('./icons/file-icons-colourless-icon-theme.json', colourless, function() {});