#!/usr/bin/env node

import Less from "less";
import Genex from "genex";
import {copyFileSync, linkSync, lstatSync, statSync, readFileSync, unlinkSync, writeFileSync} from "fs";
import {basename, dirname, join, resolve} from "path";
import {fileURLToPath} from "url";
import {inspect, isDeepStrictEqual} from "util";
import assert from "assert";

const $0    = fileURLToPath(import.meta.url);
const root  = dirname($0).replace(/\/scripts$/i, "");
const isObj = obj => "object" === typeof obj && null !== obj;
const isKey = key => "string" === typeof key || "symbol" === typeof key;
const isEnt = obj => Array.isArray(obj) && 2 === obj.length && isKey(obj[0]);
const isOwn = Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty);

const source  = resolve(process.argv[2] || join(root, "..", "atom"));
const output  = resolve(process.argv[3] || join(root, "icons"));
const missing = resolve(process.argv[4] || join(root, "scripts", "missing-filenames.txt"));
const iconDB  = join(source, "lib", "icons", ".icondb.js");
const icons   = join(source, "styles", "icons.less");
const fonts   = join(source, "styles", "fonts.less");
const colours = join(source, "styles", "colours.less");
assertDir(source, output);
assertFile(fonts, colours);

export default Promise.all([
	loadDB(iconDB, missing),
	loadIcons(icons),
	loadFonts(fonts),
	loadColours(colours),
]).then(async ([iconDB, icons, fonts, colours]) => {
	const count = updateFonts(fonts, output);
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
	
	// Icons provided by Octicons and/or Atom's core stylesheets
	const defaultIcons = {
		_file:   {fontId: "octicons", fontCharacter: "\\f011", fontSize: "114%"},
		_folder: {fontId: "octicons", fontCharacter: "\\f016", fontSize: "114%"},
		_repo:   {fontId: "octicons", fontCharacter: "\\f001", fontSize: "114%"},
	};
	const unlistedIcons = {
		"circuit-board": {fontId: "octicons", fontCharacter: "\\f0d6", fontSize: "114%"},
		mail:            {fontId: "octicons", fontCharacter: "\\f03b", fontSize: "114%"},
		paintcan:        {fontId: "octicons", fontCharacter: "\\f0d1", fontSize: "114%"},
		pdf:             {fontId: "octicons", fontCharacter: "\\f014", fontSize: "114%"},
		star:            {fontId: "octicons", fontCharacter: "\\f02a", fontSize: "114%"},
		text:            {fontId: "octicons", fontCharacter: "\\f011", fontSize: "114%"},
	};
	({icons} = icons);
	icons = {...unlistedIcons, ...icons};
	
	// Truncate font paths to output directory
	for(const font of fonts)
		font.src.forEach(src => src.path = "./" + basename(src.path));
	
	// Alphabetise font-families, but keep File-Icons at the front of array
	fonts = fonts.sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));
	const index = fonts.findIndex(font => "fi" === font.id);
	if(-1 !== index)
		fonts.unshift(...fonts.splice(index, 1));
	else throw new ReferenceError("Failed to locate font with ID 'fi'");
	
	const colouredTheme = buildTheme({icons, fonts, colours, iconDB});
	colouredTheme.iconDefinitions = {...defaultIcons, ...colouredTheme.iconDefinitions};
	saveJSON(colouredTheme, join(output, "file-icons-icon-theme.json"));
	
	const uncolouredTheme = desaturate(colouredTheme, colours);
	saveJSON(uncolouredTheme, join(output, "file-icons-colourless-icon-theme.json"));
	
}).catch(error => {
	console.error(error);
	process.exit(1);
});


// Section: Icon Database {{{1

/**
 * Generate an icon-theme in the format required by VS Code.
 * @param  {Object}  source
 * @param  {Array}   source.iconDB
 * @param  {Object}  source.icons
 * @param  {Object}  source.fonts
 * @param  {Object}  source.colours
 * @param  {String} [source.prefix="_"]
 * @return {IconTheme}
 * @internal
 */
function buildTheme({iconDB, icons, fonts, colours, prefix = "_"} = {}){
	const theme = {
		__proto__: null,
		fonts,
		file:            prefix + "file",
		folder:          prefix + "folder",
		rootFolder:      prefix + "repo",
		iconDefinitions: {},
		fileExtensions:  {},
		fileNames:       {},
		folderNames:     {},
		languageIds:     {},
		light:           {},
	};
	
	const getColourValue = colour => {
		if(!colour) return "#000000";
		const index      = colour.indexOf("-");
		const brightness = colour.slice(0, index);
		const name       = colour.slice(index + 1);
		const value      = colours[name]?.[brightness];
		if(null == value)
			throw new ReferenceError(`No such colour ${colour}`);
		return value;
	};
	
	const [directoryIcons, fileIcons] = iconDB;
	for(const iconList of [directoryIcons, fileIcons])
	for(let [
		icon,
		colours,
		match,,
		matchPath,,
		scope,
		language,
		signature,
	] of iconList[0]){
		if(matchPath || !(match instanceof RegExp)) continue;
		
		// HACK
		if(/^\.atom-socket-.+\.\d$/.source === match.source)
			continue;
		
		// HACK: Conflicting file-extension: `.vh` (V, SystemVerilog)
		// Searching GitHub yields mostly Verilog results, so exclude V.
		if("v-icon" === icon && /\.vh$/i.source === match.source)
			continue;
		
		// Normalise icon ID: "pdf-icon" => "pdf", "icon-file-text" => "text"
		if(icon.startsWith("icon-file-")) icon = icon.slice(10);
		else if(icon.startsWith("icon-")) icon = icon.slice(5);
		else if(icon.endsWith("-icon"))   icon = icon.slice(0, -5);
		if(icon.startsWith("_"))          icon = icon.slice(1);
		validateIcon(icon, icons, fonts);
		
		// HACK: Manually add scopes to commonly-used generic formats like XML and YAML
		signature = String(signature);
		if("yaml" === icon && String(match) === String(/\.ya?ml$/i)){
			language ||= /^YA?ML$/i;
			scope    ||= /\.ya?ml$/i;
		}
		else if(signature === String(/^<\?xml /)){
			language ||= /^XML$/i;
			scope    ||= /^text\.xml$/i;
		}
		else if(signature === String(/^\xEF\xBB\xBF|^\xFF\xFE/))
			scope ||= /^(text\.plain|plain[-_ ]?text|fundamental)$/i;
		
		// Normalise dark- and light-motif variants
		colours = Array.isArray(colours) ? [...colours].slice(0, 2) : [colours];
		colours[0] === colours[1] && colours.pop();
		
		const add = (listName, key) => {
			key = key.toLowerCase();
			let list = theme[listName];
			for(const colour of colours){
				const uid = prefix + icon + (colour ? "_" + colour : "");
				list[key] = uid;
				if(null == theme.iconDefinitions[uid]){
					const def = {...icons[icon], fontColor: getColourValue(colour)};
					if("#000000" === def.fontColor)
						delete def.fontColor;
					theme.iconDefinitions[uid] = def;
				}
				list = theme.light[listName] ??= {};
			}
		};
		try{
			match = new RegExp(
				match.source
					.replace(/^\^stdlib\(\?:-\.\+\)\?/, "^stdlib")
					.replace(/(?<!\\)\|\(\?<[!=][^()]+\)/g, "")
					.replace(/(?<!\\)\(\?:(?:\[-\._\]\?|_)\\[wd][+*]\)\?/g, ""),
				match.flags,
			);
			const matches = parseRegExp(match);
			const isDir = directoryIcons === iconList;
			
			if(!isDir)
				for(const ext of matches.suffixes)
					add("fileExtensions", ext.replace(/^\./, ""));
			for(const name of matches.full)
				add(isDir ? "folderNames" : "fileNames", name);
			
			// Convert TextMate scopes to VSCode language IDs
			if(scope){
				match = parseRegExp(scope);
				const iconID = prefix + icon + (colours.length ? "_" + colours[0] : "");
				const langIDs = Object.values(match)
					.map(set => [...set]).flat()
					.map(scope => scope.toLowerCase()
						.replace(/^\.+|\.+$/g, "")
						.replace(/^(?:source|text)\.+/g, ""));
				if(language){
					language = parseRegExp(match = new RegExp(
						language.source,
						language.flags,
					));
					langIDs.push(...Object.values(language).map(set => {
						set = [...set];
						const downcase = set.map(lang => lang.toLowerCase());
						const upcase   = set.map(lang => lang.toUpperCase());
						return set.concat(downcase, upcase);
					}).flat());
				}
				for(const langID of new Set(langIDs))
					theme.languageIds[langID] = iconID;
			}
		}
		catch(error){
			if(error instanceof RangeError
			|| error.message.includes("Unsupported lookbehind")){
				console.warn("Skipping:", match);
				continue;
			}
			console.warn("Stopped at", match);
			throw error;
		}
	}
	
	// Make diffs less chaotic by enforcing alphanumeric order
	for(const obj of [theme, theme.light].filter(Boolean))
	for(const key of "iconDefinitions fileExtensions fileNames folderNames folderNamesExpanded languageIds".split(" ")){
		const value = obj[key];
		if(isOwn(obj, key) && isObj(value))
			obj[key] = sortProps(value);
	}
	return theme;
}


/**
 * Generate a colourless version of a coloured icon-theme.
 * @param  {IconTheme} input
 * @param  {Object} colours
 * @return {IconTheme}
 * @internal
 */
function desaturate(input, colours){
	
	// Construct a regex for stripping the trailing colour name/shade
	const names = new Set();
	for(const [colour, value] of Object.entries(colours))
	for(const [luminosity]    of Object.entries(value))
		names.add([luminosity, colour].join("-"));
	const regex = new RegExp(`[-_]?(?:${[...names].join("|")})$`, "i");
	
	// Start culling
	const result  = JSON.parse(JSON.stringify(input));
	const oldDefs = input.iconDefinitions;
	const newDefs = result.iconDefinitions = {__proto__: null};
	
	for(const [oldID, props] of Object.entries(oldDefs)){
		const newID = oldID.replace(regex, "");
		delete props.fontColor;
		
		// Sanity check
		if(newID in newDefs)
			assert.deepStrictEqual(props, newDefs[newID]);
		else newDefs[newID] = props;
	}
	const remap = from => {
		const to = {__proto__: null};
		for(let [key, iconID] of Object.entries(from)){
			iconID = iconID.replace(regex, "");
			assert(iconID in newDefs);
			to[key] = iconID;
		}
		return to;
	};
	const isEmpty = obj => isObj(obj) && !Object.keys(obj).length;
	const cull = (...listNames) => {
		for(const listName of listNames){
			if(!isObj(result?.light?.[listName])
			|| !isObj(result[listName])) continue;
			const darkIcons  = result[listName];
			const lightIcons = result.light[listName];
			for(const [key, value] of Object.entries(lightIcons)){
				if(key in darkIcons && isDeepStrictEqual(darkIcons[key], value))
					delete lightIcons[key];
			}
			if(isEmpty(result.light[listName]))
				delete result.light[listName];
		}
		if(isEmpty(result.light))
			delete result.light;
	};
	for(const context of [result, result.light]){
		if(!context) continue;
		context.fileExtensions = remap(context.fileExtensions);
		context.fileNames      = remap(context.fileNames);
		context.folderNames    = remap(context.folderNames);
	}
	cull(..."fileExtensions fileNames folderNames".split(" "));
	return result;
}


/**
 * Load a compiled icon database.
 *
 * @example await loadDB("/path/to/.icondb.js");
 * @param {String} from - Path to an `.icondb.js` file.
 * @param {String} [filenameList=null]
 *   Path to a line-delimited list of filenames to include in a matching pattern.
 *   This is necessary because some compiled regexes are too complex to be easily
 *   enumerated by {@link parseRegExp}.
 * @return {Array}
 * @internal
 */
async function loadDB(from, filenameList = null){
	const {default: db} = await import(resolve(from));
	if(!filenameList) return db;

	// Add missing filenames to patterns too complex for `parseRegExp` to handle
	const filenames = readFileSync(resolve(filenameList), "utf8")
		.split(/\r?\n|\r|\x85|\u2028|\u2029/)
		.map((line, index) => (line = line.trim()) ? [index + 1, line] : null)
		.filter(Boolean);

	const unmatched = new Set(filenames);
	const matched   = new Map();
	
	for(const filename of filenames){
		for(const icon of db[1][0]){
			if(!icon[4] && icon[2].test(filename[1])){
				unmatched.delete(filename);
				matched.has(icon) || matched.set(icon, new Set());
				matched.get(icon).add(filename);
				break;
			}
		}
	}
	
	// Report any filenames that failed to match any icon whatsoever
	const {size} = unmatched;
	if(size){
		const [prefix, path, dimOn, dimOff] = process.stderr.isTTY
			? ["\x1B[33mWarning:\x1B[39m", `\x1B[4m${filenameList}\x1B[24m`, "\x1B[2m", "\x1B[22m"]
			: ["Warning:", filenameList];
		console.warn(`${prefix} Unmatched ${1 === size ? "entry" : "entries"} in ${path}:`);
		for(const [lineNumber, filename] of unmatched)
			console.warn(`\t${dimOn}line ${lineNumber}:${dimOff} ${filename}`);
	}
	
	// Patch the existing database in-place
	for(const [icon, filenames] of matched){
		const regex = icon[2];
		const additions = [""];
		for(const [, filename] of filenames)
			additions.push(`^${filename.replace(/[/\\^$*+?{}[\]().|]/g, "\\$&")}$`);
		regex.compile(regex.source + additions.join("|"), regex.flags);
	}
	return db;
}


/**
 * Extract a list of unique filename/extension matches from a regex.
 * @param {RegExp} input
 * @return {MatchesByType}
 * @internal
 */
function parseRegExp(input){
	/**
	 * @typedef {Object} MatchesByType
	 * @property {Set} substrings - Substrings appearing anywhere in a filename
	 * @property {Set} prefixes   - Filename prefixes;   i.e., /^foo…/
	 * @property {Set} suffixes   - File extensions;     i.e., /…foo$/
	 * @property {Set} full       - Full-string matches; i.e., /^foo$/
	 */
	const output = {
		__proto__: null,
		substrings: new Set(),
		prefixes:   new Set(),
		suffixes:   new Set(),
		full:       new Set(),
	};
	
	if("genex" !== input?.constructor?.name.toLowerCase())
		input = Genex(input);
	
	const anchors  = new Set();
	const chars    = new Set();
	const killList = new Set();
	const lists    = new Set();
	const walk     = (obj, refs = new WeakSet()) => {
		if("object" !== typeof obj || null === obj || refs.has(obj))
			return;
		refs.add(obj);
		if(Array.isArray(obj)){
			lists.add(obj);
			for(const item of obj){
				try{ walk(item, refs); }
				catch(e){ killList.add(item); }
			}
		}
		else{
			if(Infinity === obj.max){
				if(!obj.min)
					throw new RangeError("Bad range");
				obj.max = ~~obj.min;
			}
			else switch(obj.type){
				case 2: "^$".includes(obj.value) && anchors.add(obj); break;
				case 7: chars.add(obj.value); break;
				default: {
					const {options: opts, stack} = obj;
					if(Array.isArray(opts)){
						lists.add(opts);
						for(const opt of opts)
							try{ walk(opt, refs); }
							catch(e){ killList.add(opt); }
					}
					else if(Array.isArray(stack)){
						lists.add(stack);
						walk(stack, refs);
					}
					else walk(obj.value, refs);
				}
			}
		}
	};
	
	walk(input.tokens);
	for(const token of killList){
		for(const list of lists){
			while(list.includes(token))
				list.splice(list.indexOf(token), 1);
		}
	}
	
	const used   = String.fromCodePoint(...chars);
	const unused = Array.from(getUnusedChar(used + "\\[]{}()?+*", 2))
		.map(char => char.codePointAt(0));
	
	for(const anchor of anchors){
		anchor.type = 7;
		anchor.value = "^" === anchor.value
			? unused[0]
			: unused[1];
	}
	
	const cases = new Set();
	input.generate(result => {
		if(cases.size > 1000) throw new RangeError("Too many cases to generate");
		cases.add(result);
	});
	
	for(let str of cases){
		let anchoredToStart = false;
		let anchoredToEnd   = false;
		str = [...str];
		str = str.map((char, index) => {
			const code = char.codePointAt(0);
			if(code === unused[0]){
				assert.strictEqual(index, 0);
				anchoredToStart = true;
			}
			else if(code === unused[1]){
				assert.strictEqual(index, str.length - 1);
				anchoredToEnd = true;
			}
			else return char;
			return "";
		}).join("");
		const type =
			anchoredToStart && anchoredToEnd ? "full"     :
			anchoredToStart                  ? "prefixes" :
			anchoredToEnd                    ? "suffixes" :
			"substrings";
		output[type].add(str);
	}
	return output;
}


/**
 * Write an object to disk as a JSON file, preserving timestamps if identical.
 * @param {Object} input
 * @param {String} path
 * @return {void}
 * @internal
 */
function saveJSON(input, path){
	path = resolve(path);
	let existingFile = null;
	try{ existingFile = readFileSync(path, "utf8"); }
	catch(e){}
	input = JSON.stringify(input, null, "\t").trim() + "\n";
	input === existingFile
		? console.info(`Theme already up-to-date: ${basename(path)}`)
		: writeFileSync(path, input, "utf8");
}


/**
 * Ensure that a complete icon-definition with the given ID exists.
 * @param {String} name
 * @param {Object} icons
 * @param {Object} fonts
 * @return {void}
 * @internal
 */
function validateIcon(name, icons, fonts){
	if(name in icons){
		for(const key of ["fontCharacter", "fontId"]){
			const value = icons[name][key];
			if("string" !== typeof value || !value)
				throw new TypeError(`Missing "${key}" field in icon "${name}"`);
		}
		const {fontId} = icons[name];
		if(!fonts.some(font => fontId === font.id))
			throw new ReferenceError(`Icon "${name}" references undefined font "${fontId}"`);
	}
	else throw new ReferenceError(`Undefined icon: ${name}`);
}


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
		if(/^\.((?:(?!-|\d)[-a-z0-9]+|_\d+[-a-z0-9]*)(?<!-))(?:::?before)?$/i.test(selector)){
			const name = RegExp.$1.replace(/^_|-icon$/gi, "");
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
		if(!isObj(value) || !isOwn(value, "color")) continue;
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
 * Return one or more characters not contained in a string.
 *
 * @version Alhadis/Utils@c8ee57d
 * @example getUnusedChar("\x00\x02")    == "\x01";
 * @example getUnusedChar("\x00\x02", 2) == "\x01\x03";
 * @param {String} input
 * @param {Number} [count=1]
 * @return {String}
 */
function getUnusedChar(input, count = 1){
	let chars = "";
	let next = "\x00";
	let code = 0;
	for(let i = 0; i < count; ++i){
		while(-1 !== input.indexOf(next) || -1 !== chars.indexOf(next))
			next = String.fromCodePoint(++code);
		chars += next;
	}
	return chars;
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
