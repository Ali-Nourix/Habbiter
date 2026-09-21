/* Test stand-in for the `obsidian` module. Only the two functions the pure
   modules import are needed, and Obsidian's are js-yaml underneath. */
const yaml = require("js-yaml");

exports.parseYaml = (text) => yaml.load(text);
exports.stringifyYaml = (obj) => yaml.dump(obj, { lineWidth: -1 });
