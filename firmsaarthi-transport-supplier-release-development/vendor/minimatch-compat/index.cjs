// Older glob/ExcelJS tooling calls require('minimatch') directly; modern callers
// use named exports. Both delegate to the SAME patched upstream implementation.
const modern = require('minimatch-modern');
class CompatMinimatch extends modern.Minimatch {
  constructor(pattern,options){super(pattern,options);for(const alternative of this.set)for(const part of alternative)if(part&&typeof part==='object'&&typeof part.pattern==='string'){
    part._glob=part.pattern;
    // glob7 uses String#match on each portion; route that operation to the
    // patched nonrecursive matcher rather than constructing a regular expression.
    part[Symbol.match]=function(value){return this.test(value)?[value]:null;};
  }}
}
module.exports = modern.minimatch;
module.exports.minimatch = modern.minimatch;
module.exports.Minimatch = CompatMinimatch;
module.exports.GLOBSTAR = modern.GLOBSTAR;
module.exports.filter = modern.filter;
module.exports.defaults = modern.defaults;
module.exports.braceExpand = modern.braceExpand;
module.exports.match = modern.match;
module.exports.escape = modern.escape;
module.exports.unescape = modern.unescape;
module.exports.sep = modern.sep;
