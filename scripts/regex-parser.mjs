import Genex from "genex";

const isObj = x => "object" === typeof x && null !== x;
const START = Symbol("^");
const END   = Symbol("$");

/**
 * Extract and organise patterns for matching filenames and file extensions.
 * @param {RegExp} input
 * @return {RegExp[]}
 * @public
 */
export default function parseRegExp(input){
	input = normalise(flatten(genexParse(input)));
	input = distil(input);
	return input;
}

/**
 * Resolve the final list of patterns from a parsed and normalised RegExp tree.
 * @param {Array}
 * @return {RegExp[]}
 * @internal
 */
function distil(input){
	let index = 0;
	const patterns = [];
	const types = ["substring", "prefix", "extension", "filename"];
	for(let item of input){
		let type;
		if("string" === typeof item){
			item = reReg(item);
			type = "substring";
		}
		else if(Array.isArray(item)){
			const anchoredStart = item.includes(START) << 0;
			const anchoredEnd   = item.includes(END)   << 1;
			item = reReg(item);
			type = types[anchoredStart | anchoredEnd];
		}
		else{
			const msg = `Expected array or string, found ${typeof item}`;
			throw new TypeError(msg);
		}
		patterns.push(Object.defineProperties(item, {
			index: {value: index++},
			type:  {value: type},
		}));
	}
	return patterns;
}

/**
 * Convert Genex tokens into a (potentially nested) array of strings and symbols.
 * @param {Genex|Array|Symbol|String} input
 * @param {WeakSet} [refs]
 * @param {Boolean} [inSet=false]
 * @return {Array}
 * @internal
 */
function flatten(input, refs = new WeakSet(), inSet = false){
	if(!isObj(input))
		return "symbol" === typeof input ? input : String(input);
	if(refs.has(input)) return;
	refs.add(input);
	
	const esc = x => x.replace(inSet ? /[-\[\]\\^]/g : /[/\\^$*+?{}[\]().|]/g, "\\$&");
	switch(input?.type){
		default: {
			if("Genex" === input?.constructor?.name)
				return flatten(input.tokens, refs, inSet);
			else if(Array.isArray(input))
				return input.map(x => flatten(x, refs, inSet));
			// Fall-through
		}
		
		// Root
		case 0:
			return flatten(input.options ?? input.stack, refs);
			
		// Group
		case 1: {
			const {remember, notFollowedBy, followedBy} = input;
			const key =
				remember      ? ""   :
				notFollowedBy ? "?!" :
				followedBy    ? "?=" :
				"?:";
			let branches = flatten(input.options ?? input.stack, refs, inSet);
			if(Array.isArray(branches)){
				branches = normalise(branches, true);
				if(branches?.some?.(item => "symbol" === typeof item || Array.isArray(item))){
					return Object.assign(branches, {
						isGroup: true,
						before: "(" + key,
						after:  ")",
						join(sep = "|"){
							return this.toString(sep);
						},
						toString: (function toString(sep = this.isGroup ? "|" : ""){
							return this.before
								+ this.map(item => "symbol" === typeof item
									? item.description
									: Array.isArray(item)
										? toString.call(item, sep)
										: String(item)
								).join(sep)
								+ this.after;
						}),
					});
				}
			}
			return `(${key}${"string" === typeof branches ? branches : branches.join("|")})`;
		}
		
		// Position (Anchor)
		case 2:
			switch(input.value){
				case "^": return START;
				case "$": return END;
				default:  return "";
			}
		
		// "Set" (Bracketed character class)
		case 3: {
			const negated = input.not ? "^" : "";
			const entries = input.set.map(item => flatten(item, refs, true)).join("");
			return `[${negated}${entries}]`;
		}
		
		// Range of characters (inside bracketed class)
		case 4:
			return `${esc(input.from)}-${esc(input.to)}`;
		
		// Quantifier
		case 5: {
			const {min, max} = input;
			const quantifier = !isFinite(max)
				? 1 === min ? "+" : 0 === min ? "*" : `{${min || 0},}`
				: 0 === min && 1 === max ? "?" : `{${min || 0}, ${max}}`;
			return flatten(input.value, refs, inSet) + quantifier;
		}

		// Backreference (TODO)
		case 6:
			throw new TypeError("Backreferences are currently unsupported");

		// Character
		case 7:
			return esc(String.fromCodePoint(input.value));
	}
}

/**
 * Tokenise a regular expression using Genex.
 * @param {RegExp|String}
 * @return {Genex}
 * @internal
 */
function genexParse(value){
	const genex = Genex(value);
	Object.defineProperty(genex.tokens, "source", {value: genex});
	return genex;
}

/**
 * Stringify a parsed token or token-tree.
 * @param {String|Object|Symbol} value
 * @param {WeakSet} [refs]
 * @return {String}
 * @internal
 */
function genexUnparse(value, refs = new WeakSet()){
	switch(typeof value){
		default:
			return String(value);
		case "object":
		case "function":
			if(null === value) return "";
			refs.add(value);
			if(Array.isArray(value))
				return value.isGroup
					? value.toString()
					: value.map(x => genexUnparse(x, refs));
			else return String(value);
		case "symbol":
			return value.description;
	}
}

/**
 * Merge adjacent strings in an array.
 * @param {*} input - An array to operate on; non-arrays (except for symbols) are stringified
 * @param {Boolean} [unwrap=false] - Unbox single-element arrays after normalising
 * @param {Boolean} [recurse=true] - Merge adjacent strings in subarrays
 * @param {WeakSet} [refs] - List of normalised objects used internally to avoid infinite loops
 * @return {Array|String}
 */
function normalise(input, unwrap = false, recurse = true, refs = new WeakSet()){
	if(!isObj(input))
		return "symbol" === typeof input ? input : String(input);
	
	if(refs.has(input)) return;
	refs.add(input);
	
	// Merge adjacent strings together
	for(let i = input.length - 1, j = 0; i >= -1; --i){
		if("string" !== typeof input[i]){
			if(j > 1){
				const chars = input.splice(i + 1, j, "");
				input[i + 1] = chars.join("");
			}
			j = 0;
			
			// Recurse
			if(recurse && Array.isArray(input[i]))
				input[i] = normalise(input[i], unwrap, true, refs);
		}
		else ++j;
	}
	
	if(unwrap)
		while(Array.isArray(input) && 1 === input.length)
			input = input[0];
	return input;
}

/**
 * Reconstruct a parsed and flattened regex.
 * @param  {Array}  input
 * @param  {Map}    [refs]
 * @param  {Number} [depth=0]
 * @param  {Array}  [parent]
 * @return {RegExp}
 * @internal
 */
function reReg(input, refs = new WeakSet(), depth = 0, parent = null){
	if("symbol" === typeof input) return input.description;
	if("string" === typeof input) return input;
	if(input instanceof RegExp)   return input;
	if(!Array.isArray(input)){
		const type = input?.constructor?.name ?? (null == input ? input : typeof input);
		throw new TypeError(`Array expected, given ${type}`);
	}
	if(refs.has(input)) return;
	refs.add(input);
	
	// HACK
	if(input.isGroup){
		if(!Array.isArray(parent) || parent === input || !parent.includes(input))
			throw new ReferenceError("Invalid parent");
		const template  = parent.splice(0, parent.length);
		const index     = template.indexOf(input);
		template[index] = null;
		
		let childIndex = 0;
		for(const item of input){
			const branch = template.slice();
			
			// Resolve pattern type
			let type = "substring";
			if(START === item || END === item){
				const cohort = {[START]: END, [END]: START}[item];
				if(template.includes(cohort)) type = "filename";
				else if(START === item)       type = "prefix";
				else if(END   === item)       type = "extension";
			}
			branch[index] = item;
			parent.push(Object.defineProperties(reReg(branch), {
				index:    {value: childIndex++},
				type:     {value: type, enumerable: true},
				toString: {value(){ return this.source; }},
			}));
		}
	}
	else{
		const src = input.slice().map(item => reReg(item, refs, depth + 1, input));
		return new RegExp(src.join(""));
	}
}

/**
 * Remove bracket pairs surrounding a string.
 * @example unwrap("((Foo))") == "Foo";
 * @example unwrap("(?:Foo)") == "Foo";
 * @param {String} input
 * @return {String}
 */
function unwrap(input){
	while(input.endsWith(")") && !input.endsWith("\\)"))
		if(/^\((?:\?:|\?<?[=!]|\?<[^-\w]+>)?/.test(input))
			input = input.slice(RegExp.lastMatch.length, -1);
		else break;
	return input;
}
