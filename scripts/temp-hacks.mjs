/**
 * @fileoverview Stupid hacks to make development a wee bit easier.
 */

import {inspect} from "util";
Object.assign(inspect.defaultOptions, {colors: true, compact: false, depth: Infinity});
for(const name of "log debug dir dirxml info error warning".split(" ")){
	const fn = console[name];
	if("function" !== typeof fn) continue;
	console[name] = function(...args){
		return fn.apply(this, args.map(arg => {
			if("string" === typeof arg)
				return arg;
			return inspect(arg).split("\n").map(line => {
				let offset = 0;
				while("  " === line.slice(offset, offset + 2)) offset += 2;
				return "\t".repeat(offset / 2) + line.slice(offset);
			}).join("\n");
		}));
	};
}

{
	let value = new Array(2).join();
	const desc = {
		get: () => value,
		set: to => value = String(to),
	};
	Object.defineProperties(globalThis, {LIST_SEPARATOR: desc, '$"': desc});
	const {join} = Array.prototype;
	Array.prototype.join = function(separator = value){
		return join.call(this, separator);
	};
}
