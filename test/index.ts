import testRunner from "vscode/lib/testrunner";

// You can directly control Mocha options by uncommenting the following lines
// See https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically#set-options for more info
testRunner.configure({
	ui: "tdd",       // The TDD UI is being used in extension.test.ts (suite, test, etc.)
	useColors: true, // Coloured output from test results
});
