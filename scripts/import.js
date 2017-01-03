const cson = require('cson');
const fs = require('fs');
const execSync = require('child_process').execSync;
const parameterize = require('parameterize');
const util = require('util');
const genex = require('genex');
const ret = require('ret');

const path = './defs';
const repo = 'https://github.com:DanBrooker/file-icons';
const defs = cson.parseCSFile(path + '/config.cson');
const stylesIcons = fs.readFileSync(path + '/styles/icons.less').toString();
const fontColour = "#ffffff";
// console.log("icons file: ", stylesIcons);

var icons = {};
var result;

let regex = /\.(.*?)-icon:before\s+{\s+\.(\w+); content: "(.*?)"/g;
let fontMap = {
    "fi": "file-icons",
    "fa": "fontawesome",
    "octicons": "octicons",
    "mf": "mfixx",
    "devicons": "devicons"
}
while ((match = regex.exec(stylesIcons)) !== null) {
    // console.log(match)
    let name = "_" + match[1];
    let font = match[2];
    let character = match[3];
    icons[name] = {
        'fontCharacter': character,
        'fontColor': fontColour,
        'fontId': fontMap[font]
    };
}

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

var extensions = {};
var files = {};

function parseRegex(regex) {
    // let tokens = ret(regex.source);
    var gen = [];
    try {
        let count = genex(regex).count();
    
        if (count <= 1000) {
            genex(regex).generate(function (output) {
                // console.log('[*] ' + output);
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

function process(hash) {
    let match = hash.match;
    let icon = hash.icon;

    if(match instanceof Array) {
        for(var m = 0; m < match.length; m++) {

            let nested = match[m];
            
            var ext = nested[0];
            let colour = nested[1]; // TODO do something with this colour

            if(ext instanceof RegExp) {
                console.log("regexp " + util.inspect(ext));
                let exts = parseRegex(ext);
                for(var i = 0; i < exts.length; i++) {
                    let ext = exts[i];
                    if(ext.startsWith(".")) {
                        extensions[ext.substring(1)] = "_" + icon;
                    } else {
                        files[ext] = "_" + icon;
                    }
                    console.log(ext + " => " + icon);
                }
            } else if(typeof(ext) === "string") {
                console.log("string " + util.inspect(ext));
                if(ext.startsWith(".")) {
                    extensions[ext.substring(1)] = "_" + icon;
                } else {
                    files[ext] = "_" + icon;
                }
                console.log(ext + " => " + icon);
            } else {
                console.log("skipped " + ext);
            }
        }
    } else if(match instanceof RegExp) {
        let exts = parseRegex(match);
        for(var i = 0; i < exts.length; i++) {
            let ext = exts[i];
            if(ext.startsWith(".")) {
                extensions[ext.substring(1)] = "_" + icon;
            } else {
                files[ext] = "_" + icon;
            }
            console.log(ext + " => " + icon);
        }
    } else if(typeof(match) === "string") {
        if(match.startsWith('.')) {
            extensions[match.substring(1)] = "_" + icon;
            console.log(match + " => " + icon);
        } else {
            console.log(match+ " skipped not a file extension");
        }
    } else {
        console.log(match+ " skipped type");
    }
}

for(let fileIcon in defs.fileIcons ) {
    process(defs.fileIcons[fileIcon]);
}

for(let directoryIcon in defs.directoryIcons) {
    process(defs.directoryIcons[directoryIcon]);
}

var languages = [];

// export file-icon-theme.json
var root = {};
root.fonts = fonts;
root.iconDefinitions = icons;
root.file = '_default';
root.fileExtensions = extensions;
root.fileNames = files;
root.languageIds = languages;
root.light = {
    "root": {},
    "fileNames": {},
    "languageIds": languages
};
root.version = ("https://github.com/file-icons/vscode/commit/" + execSync('git rev-parse HEAD')).replace(/\n$/, '');

let json = JSON.stringify(root, null, 2);
fs.writeFile('./icons/file-icons-theme.json', json, function() {});