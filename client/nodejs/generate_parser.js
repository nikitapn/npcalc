// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

var fs = require("fs");
var jison = require("jison");

var bnf = fs.readFileSync("nodejs/grammar.jison", "utf8");
var parser = new jison.Parser(bnf);
var parserSource = parser.generate();

fs.writeFile("src/parser/parser.js", parserSource, (err) => {
	if (err) throw err;
	console.log('The file has been saved!');
  });

module.exports = parser;