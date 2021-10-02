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
import "./temp-hacks.mjs";

const source  = resolve(process.argv[2] || join(root, "..", "atom"));
const output  = resolve(process.argv[3] || join(root, "icons"));
const icons   = join(source, "styles", "icons.less");
const fonts   = join(source, "styles", "fonts.less");
const colours = join(source, "styles", "colours.less");
assertDir(source, output);
assertFile(fonts, colours);

export default Promise.all([
	loadIcons(icons),
	loadFonts(fonts),
	loadColours(colours),
]).then(async ([icons, fonts, colours]) => {
	let count = updateFonts(fonts, output);
	console.info(count ? `${count} font(s) updated` : "Fonts already up-to-date");
	
	fonts.push({
		id:     "octicons regular",
		src:    [{path: join(output, "octicons.woff2"), format: "woff2"}],
		weight: "normal",
		style:  "normal",
		size:   "100%",
	});
	for(const font of fonts)
		font.id = icons.fonts[font.id].id || font.id;
	({icons} = icons);
	
	fonts = fonts.sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));
	const index = fonts.findIndex(font => "fi" === font.id);
	if(-1 !== index)
		fonts.unshift(...fonts.splice(index, 1));
	else throw new ReferenceError("Failed to locate font with ID 'fi'");
	
	const result = {icons, fonts, colours};
	console.log(result);
	return result;
	
}).catch(error => {
	console.error(error);
	process.exit(1);
});


// Section: Icons {{{1

/**
 * Load icon definitions from the given stylesheet.
 *
 * @example loadIcons("/path/to/styles/icons.less");
 * @param {String} from - Path to stylesheet
 * @return {Object}
 * @private
 */
async function loadIcons(from){
	from = resolve(from);
	const icons = {__proto__: null};
	const fonts = {__proto__: null};
	const rules = parseRules(await loadStyleSheet(from));
	for(const selector in rules){
		const rule = rules[selector];
		const font = (rule["font-family"] || "").toLowerCase();
		if(!font) continue;
		if(/^\.((?!-|\d)[-a-z0-9]+(?<!-))(?:::?before)?$/i.test(selector)){
			const name = RegExp.$1.replace(/-icon$/i, "");
			if("string" === typeof rule.content)
				icons[name] = rule;
			else fonts[font] ||= {...rule, id: name.toLowerCase()};
		}
		rule["font-family"] = font;
	}
	for(const name in icons){
		const icon = icons[name];
		const font = icon["font-family"];
		if(!font)
			throw new TypeError(`No font defined for icon '${name}'`);
		if(!(font in fonts))
			throw new TypeError(`Undefined font ${font}`);
		const size = parseSize(icon["font-size"] || fonts[font]["font-size"], 14);
		icons[name] = {
			fontCharacter: icon.content,
			fontColor: "#000000",
			fontId: fonts[font].id,
		};
		if("100%" !== size)
			icons[name].fontSize = size;
	}
	return {icons: sortProps(icons), fonts};
}


/**
 * Convert a CSS font-size into a percentage string.
 *
 * @example parseSize("16px") === "100%";
 * @param {Number|BigInt|Object|String} input
 * @param {Number|BigInt} [baseSize=16]
 * @return {String}
 * @private
 */
function parseSize(input, baseSize = 16){
	switch(typeof input){
		case "number":
			return isFinite(input)
				? `${Math.round((input / Number(baseSize)) * 100)}%`
				: "100%";
		case "bigint":
			return String((input / 100n) * BigInt(baseSize)) + "%";
		case "object":
			if(null === input) return "100%";
			input = String(input); // Fall-through
		case "string":
			let [value, ...unit] = input.split(/(?<=\d)(?=[^\s\d])/);
			value = parseFloat(value);
			unit = unit.join("").toLowerCase();
			const cm = 96 / 2.54;
			switch(unit){
				case "cm":  value *= cm;        break; // Centimetre
				case "mm":  value *= cm / 10;   break; // Millimetre
				case "q":   value *= cm / 40;   break; // Quarter-millimetre
				case "in":  value *= 96;        break; // Inch
				case "pc":  value *= 6;         break; // Pica
				case "pt":  value *= 1 + 1 / 3; break; // Point
				case "px":  case "":            break; // Pixel
				case "em":  value *= baseSize;  break; // Em
				case "rem": value *= 16;        break; // Root em (assumed to be 16px)
				case "%":   return `${Math.round(value)}%`; // Percentage of font-size
				default:    throw new TypeError(`Invalid unit: ${unit}`);
			}
			return `${Math.round((value / baseSize) * 100)}%`;
	}
	throw new TypeError(`Invalid type: ${typeof input}`);
}


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
	return sortProps(colours);
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
			src:    [{path, format}],
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
 * @param {Object} [options={}] - Settings governing what to update
 * @param {Boolean} [options.force] - Ignore timestamps when copying
 * @param {Boolean} [options.noLink] - Copy files instead of linking
 * @return {Number} The number of fonts that were updated
 * @private
 */
function updateFonts(fontDefs, targetDir, {force, noLink} = {}){
	let updates = 0;
	for(const font of fontDefs){
		const srcPath = font.src[0].path;
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
			if(noLink || srcStat.dev !== dstStat.dev){
				if(!force && dstStat.mtimeNs >= srcStat.mtimeNs){
					console.info(`Already up-to-date: ${dstPath}`);
					continue;
				}
				console.info(`Copying: ${srcPath} -> ${dstPath}`);
				unlinkSync(dstPath);
				copyFileSync(srcPath, dstPath);
				++updates;
			}
			else if(srcStat.ino !== dstStat.ino){
				console.info(`Linking: ${srcPath} -> ${dstPath}`);
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

/**
 * Return a new object with the properties of another sorted alphanumerically.
 * @param {Object} input
 * @return {Object}
 * @internal
 */
function sortProps(input){
	const alnum = /[^A-Za-z0-9]/g;
	input = Object.entries(input).sort(([a], [b]) =>
		a.replace(alnum, "").localeCompare(b.replace(alnum, "")));
	return Object.fromEntries(input);
}

// vim:fdm=marker:noet
