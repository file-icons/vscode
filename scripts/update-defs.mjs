#!/usr/bin/env node

import {dirname, join, resolve} from "path";
import {fileURLToPath} from "url";
import Genex from "genex";

const $0   = fileURLToPath(import.meta.url);
const root = dirname($0).replace(/\/scripts$/i, "");
const path = process.argv[2] || resolve(root, join("..", "atom", "lib", "icons", ".icondb.js"));

import(path).then(async ({default: iconDB}) => {
	const [directoryIcons, fileIcons] = iconDB;
	console.log(directoryIcons);
});
