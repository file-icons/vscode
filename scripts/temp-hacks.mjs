/**
 * @fileoverview Stupid hacks to make development a wee bit easier.
 */

import {inspect} from "util";
{
	Object.assign(inspect.defaultOptions, {colors: true, compact: false, depth: Infinity});
	const stdoutMethods = "log debug dir dirxml info".split(" ");
	const stderrMethods = "error warning assert trace".split(" ");
	for(const name of stdoutMethods.concat(stderrMethods)){
		const fn = console[name];
		const isTTY = !!(stderrMethods.includes(name) ? process.stderr : process.stdout).isTTY;
		if("function" !== typeof fn) continue;
		console[name] = function(...args){
			const skipped = [];
			if("assert" === name)
				skipped.push(args.shift());
			args = args.map(arg => {
				if("string" === typeof arg)
					return arg;
				return inspect(arg, {colors: isTTY}).split("\n").map(line => {
					let offset = 0;
					while("  " === line.slice(offset, offset + 2)) offset += 2;
					return "\t".repeat(offset / 2) + line.slice(offset);
				}).join("\n");
			});
			args.unshift(...skipped);
			return fn.apply(this, args);
		};
	}
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
