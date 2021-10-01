#!/usr/bin/env node

import {dirname, join, resolve} from "path";
import {fileURLToPath} from "url";
import Genex from "genex";
import assert from "assert";

// TEMP
import "./temp-hacks.mjs";

const $0   = fileURLToPath(import.meta.url);
const root = dirname($0).replace(/\/scripts$/i, "");
const path = process.argv[2] || resolve(root, join("..", "atom", "lib", "icons", ".icondb.js"));

import(path).then(async ({default: iconDB}) => {
	const [directoryIcons, fileIcons] = iconDB;
	for(let [
		icon,
		colour,
		match,,
		matchPath,
		interpreter,
		scope,
		language,
	] of fileIcons[0]){
		if(matchPath) continue;
		if(match instanceof RegExp){
			try{
				match = new RegExp(
					match.source
						.replace(/(?<!\\)\|\(\?<[!=][^()]+\)/g, "")
						.replace(/(?<!\\)\(\?:(?:\[-\._\]\?|_)\\[wd][+*]\)\?/g, ""),
					match.flags,
				);
				const matches = parseRegExp(match);
				for(let ext of matches.suffixes){
					ext = ext.replace(/^\./, "");
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
	}
	console.log(directoryIcons, fileIcons);
});


/**
 * Extract a list of unique filename/extension matches from a regex.
 * @param {RegExp} input
 * @return {MatchesByType}
 * @internal
 */
export function parseRegExp(input){
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
