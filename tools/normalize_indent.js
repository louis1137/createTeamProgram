const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'script.js');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split(/\r?\n/);
const out = lines.map(line => {
  const m = line.match(/^[ \t]*/);
  const indent = m ? m[0] : '';
  const rest = line.slice(indent.length);
  // compute total spaces assuming tab size = 4
  let spaces = 0;
  for (const ch of indent) {
    spaces += ch === '\t' ? 4 : 1;
  }
  const tabs = Math.floor(spaces / 4);
  const rem = spaces % 4;
  return '\t'.repeat(tabs) + ' '.repeat(rem) + rest;
});
const outText = out.join('\n');
if (outText !== src) {
  fs.copyFileSync(file, file + '.bak');
  fs.writeFileSync(file, outText, 'utf8');
  console.log('Normalized indentation and wrote file (backup created with .bak)');
} else {
  console.log('No changes needed');
}
