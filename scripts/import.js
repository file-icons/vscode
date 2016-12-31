const cson = require('cson');
const fs = require('fs');
const execSync = require('child_process').execSync;

const path = './defs';
const repo = 'git@github.com:DanBrooker/file-icons.git';

// Checkout file-icons repo
if (fs.existsSync(path)) {
    execSync('cd defs; git fetch --depth 1 origin master; git merge origin/master;');
} else {
    execSync('git clone '+ repo +' --branch master --single-branch --depth 1 defs');
}

// Convert file-icons styles to icons/file-icons-theme.json
const defs = cson.parseCSFile(path + '/' + 'config.cson');

for(var directoryIcon in defs.directoryIcons) {
    console.log("dir: ", directoryIcon);
}

for(var fileIcon in defs.fileIcons) {
    console.log("file: ", fileIcon);
}

// export file-icon-theme.json
var root = {};
root.fonts = {};
root.iconDefinitions = {};
root.file = '_default';
root.fileExtensions = {};
root.fileNames = {};
root.languageIds = {};
root.light = {
    "root": {},
    "fileNames": {},
    "languageIds": {}
};
root.version = "https://github.com/file-icons/vscode/commit/" + execSync('git rev-parse HEAD');

let json = JSON.stringify(root);
fs.writeFile('./icons/file-icons-theme.json', json);

console.log(root);