#!/usr/bin/env node

import Less from "less";
import {copyFileSync, linkSync, lstatSync, statSync, readFileSync, unlinkSync} from "fs";
import {basename, dirname, join, resolve} from "path";
import {fileURLToPath} from "url";
import {inspect} from "util";

const $0    = fileURLToPath(import.meta.url);
const root  = dirname($0).replace(/\/scripts$/i, "");
const isObj = obj => "object" === typeof obj && null !== obj;
const isKey = key => "string" === typeof key || "symbol" === typeof key;
const isEnt = obj => Array.isArray(obj) && 2 === obj.length && isKey(obj[0]);

// TEMP
inspect.defaultOptions.depth = Infinity;
// inspect.defaultOptions.showHidden = true;
if(!process.stdout.isTTY)
	inspect.defaultOptions.colors = true;

const source  = resolve(process.argv[2] || join(root, "..", "atom"));
const output  = resolve(process.argv[3] || join(root, "icons"));
const fonts   = join(source, "styles", "fonts.less");
const colours = join(source, "styles", "colours.less");
assertDir(source, output);
assertFile(fonts, colours);

Promise.all([
	loadFonts(fonts),
	loadColours(colours),
]).then(async ([fonts, colours]) => {
	0 && updateFonts(fonts, output);
}).catch(error => {
	console.error(error);
	process.exit(1);
});


// Section: Colours {{{1

/**
 * Load a colour palette from the given stylesheet.
 *
 * @example loadColours("/path/to/styles/colours.less");
 * @param {String} from - Path to stylesheet
 * @return {Object}
 * @private
 */
async function loadColours(from){
	from = resolve(from);
	const colours = {};
	const rules = parseRules(await loadStyleSheet(from));
	for(const [key, value] of Object.entries(rules)){
		if(!isObj(value) || !value.hasOwnProperty("color")) continue;
		if(/^\.(light|medium|dark)-([^-:\s]+)::?before$/i.test(key)){
			const colour = RegExp.$2.toLowerCase();
			colours[colour] = Object.assign(colours[colour] || {}, {
				[RegExp.$1.toLowerCase()]: value.color,
			});
		}
	}
	return colours;
}

/**
 * Extract a list of rulesets from a parsed stylesheet.
 *
 * @see {@link loadStyleSheet}
 * @example <caption>Parsing a stylesheet with 3 class selectors</caption>
 *    const blue = await loadStyleSheet("colours/blue.less");
 *    parseRules(blue) == {
 *       ".light-blue:before":  {color: "#9dc0ce"},
 *       ".medium-blue:before": {color: "#6a9fb5"},
 *       ".dark-blue:before":   {color: "#46788d"},
 *    };
 * @param {Less~Ruleset} ruleset
 * @return {Object} A null-prototype object containing objects
 * keyed by selector, enumerated with parsed CSS properties.
 */
function parseRules(ruleset){
	const rules = {__proto__: null};
	for(const rule of ruleset.rules){
		if(!rule || "Comment" === rule.type)
			continue;
		const selectors = rule.selectors.map(sel =>
			sel.elements.map(el => el.combinator.value + el.value).join("").trim());
		for(const name of selectors)
			rules[name] = {...rules[name], ...parse(rule)};
	}
	return rules;
}


// Section: Fonts {{{1

/**
 * Load a list of icon-font descriptions using the given stylesheet.
 *
 * @example await loadFonts("/path/to/styles/fonts.less");
 * @param {String} from - Path to stylesheet
 * @return {IconThemeFont[]}
 * @private
 */
async function loadFonts(from){
	from = resolve(from);
	const fonts = [];
	const {rules} = await loadStyleSheet(from);
	for(let font of rules){
		[, [font]] = parse(font);
		
		// Sanity check
		if(!font["font-family"] || !font.src)
			throw new TypeError("Failed to parse AST");
		
		// Unravel the `src:` of each @font-face rule
		let {src} = font, path, format;
		if(Array.isArray(src)){
			if(Array.isArray(src[0]) && "local" === src[0][0])
				src = src.find(x => "string" === typeof x || Array.isArray(x) && "local" !== x[0]) ?? src;
			if("string" === typeof src)
				path = src;
			else for(const item of src){
				if(null == path && "string" === typeof item)
					path = item;
				if(null == format && Array.isArray(item) && "format" === item[0]){
					format = item[1];
					if(Array.isArray(format))
						format = format[0];
				}
			}
		}
		else path = parse(src);
		format ||= /\.\w+$/.test(path) ? RegExp.lastMatch.slice(1) : "woff2";
		if(path.toLowerCase().startsWith("atom://file-icons/")){
			const head = resolve(dirname(from), "..");
			const tail = path.slice(18);
			path = resolve(join(head, tail));
		}
		fonts.push({
			id:     font["font-family"].toLowerCase(),
			src:    {path, format},
			weight: font["font-weight"] || "normal",
			style:  font["font-style"]  || "normal",
			size:   "100%",
		});
	}
	return fonts;
}

/**
 * Update the VSCode package's icon-fonts with their upstream versions, if needed.
 *
 * @example updateFonts([octicons, ...fonts] "./vscode/icons/");
 * @param {IconThemeFont[]} fontDefs - Icon-font definitions
 * @param {String} targetDir - Path of destination directory
 * @return {Number} The number of fonts that were updated
 * @private
 */
function updateFonts(fontDefs, targetDir){
	let updates = 0;
	for(const font of fontDefs){
		const srcPath = font.src.path;
		const srcStat = stat(srcPath);
		const dstPath = join(targetDir, basename(srcPath));
		if(!exists(dstPath)){
			const [str, fn] = srcStat.dev !== stat(targetDir).dev
				? ["Copying", copyFileSync]
				: ["Linking", linkSync];
			console.info(`${str}: ${srcPath} -> ${dstPath}`);
			fn(srcPath, dstPath);
			linkSync(srcPath, dstPath);
			++updates;
		}
		else{
			const dstStat = stat(dstPath);
			if(srcStat.dev !== dstStat.dev){
				console.info(`Copying: ${srcPath} -> ${dstPath}`);
				unlinkSync(dstPath);
				copyFileSync(srcPath, dstPath);
				++updates;
			}
			else if(srcStat.ino !== dstStat.ino){
				console.log(`Relinking: ${srcPath} -> ${dstPath}`);
				unlinkSync(dstPath);
				linkSync(srcPath, dstPath);
				++updates;
			}
		}
	}
	return updates;
}

/**
 * @typedef  {Object} IconThemeFont
 * @property {String} id
 * @property {String} [weight="normal"]
 * @property {String} [style="normal"]
 * @property {String} [size="100%"]
 * @property {{path: String, format: String}[]} src
 */


// Section: Utilities {{{1

/**
 * Throw an exception if one of the given paths isn't a directory.
 * @param {...String} paths
 * @return {void}
 */
function assertDir(...paths){
	for(const path of paths){
		const stats = stat(path, true);
		if(!stats)
			throw new Error("No such directory: " + path);
		if(!stats.isDirectory())
			throw new Error("Not a directory: " + path);
	}
}

/**
 * Throw an exception if one of the given paths isn't a regular file.
 * @param {...String} paths
 * @return {void}
 */
function assertFile(...paths){
	for(const path of paths){
		const stats = stat(path, true);
		if(!stats)
			throw new Error("No such file: " + path);
		if(!stats.isFile())
			throw new Error("Not a regular file: " + path);
	}
}

/**
 * Return true if a file exists on disk, even as a broken symbolic link.
 * @param {String}
 * @return {Boolean}
 * @see {@link fs.existsSync}
 */
function exists(path){
	try{ return !!lstatSync(path); }
	catch(e){ return false; }
}

/**
 * Synchronously lstat(2) a file without throwing an exception.
 *
 * @example <caption>Testing a symlink to `/dev/fd/0`</caption>
 *    stat("/dev/stdin").isSymbolicLink()          === true;
 *    stat("/dev/stdin", true).isCharacterDevice() === true;
 *
 * @param {String} path - Pathname of the file being examined
 * @param {Boolean} [followLinks=false] - Use stat(2) instead
 * @return {?fs.BigIntStats}
 * @see {@link fs.lstatSync}
 */
function stat(path, followSymlinks = false){
	try{ return (followSymlinks ? statSync : lstatSync)(path, {bigint: true}); }
	catch(e){ return null; }
}

/**
 * Render and reparse a Less stylesheet.
 * @param {String} path
 * @return {Less~Ruleset}
 * @private
 */
async function loadStyleSheet(path){
	const file = readFileSync(path, "utf8");
	const {css} = await Less.render(file, {filename: path});
	path = path.replace(/\.less$/i, ".css");
	return Less.parse(css, {filename: path});
}

/**
 * Try to simplify Less's absurdly over-complicated parser output.
 * @param {String|Object|Array} node
 * @param {WeakSet} [refs]
 * @return {String|Object|Array}
 * @private
 */
function parse(node, refs = new WeakSet()){
	if(null == node) return node;
	if(!isObj(node)) return String(node ?? "");
	if(refs.has(node)) return;
	refs.add(node);
	if(Array.isArray(node)){
		node = node.map(x => parse(x, refs)).filter(x => null != x);
		return node.length < 2
			? parse(node[0], refs) ?? ""
			: node;
	}
	let {name, value, args, rules} = node;
	if("Comment" === node.type) return;
	if(name  && value) return [parse(name, refs), parse(value, refs)];
	if(!name && value) return parse(value, refs);
	if(!value && (value = rules || args)){
		value = value.map(x => parse(x, refs));
		if(value.every(item => isEnt(item)))
			value = Object.fromEntries(value);
		return name ? [parse(name, refs), value] : value;
	}
	console.error("Bad input:", node);
	throw new TypeError(`Unexpected input: ${inspect(node)}`);
}

// vim:fdm=marker:noet
