const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'script.js');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split(/\r?\n/);

function indentWidth(s){
  let w=0; for(const ch of s){ if(ch==='\t') w+=4; else if(ch===' ') w++; else break; } return w;
}

let prevIdx = -1;
let results = [];
for(let i=0;i<lines.length;i++){
  const line = lines[i];
  if(line.trim()==='') continue;
  if(prevIdx===-1){ prevIdx=i; continue; }
  const prev = lines[prevIdx];
  const cur = line;
  const prevTrim = prev.trim();
  const curTrim = cur.trim();
  const prevIndent = indentWidth(prev);
  const curIndent = indentWidth(cur);
  const diff = curIndent - prevIndent;
  // flag if current is indented more than previous by 8+ spaces (2 tabs) but previous doesn't open a block
  const prevEndsWithOpen = /\{\s*$/.test(prevTrim);
  const curStartsClose = /^\}/.test(curTrim);
  if(diff >= 6 && !prevEndsWithOpen && !curStartsClose){
    results.push({ line: i+1, prevLine: prevIdx+1, prev: prev, cur: cur, prevIndent, curIndent, diff });
  }
  prevIdx = i;
}

if(results.length===0){
  console.log('No obvious misaligned indent issues detected.');
} else {
  console.log('Potential misaligned indent lines:');
  results.forEach(r=>{
    console.log(`L${r.line} (prev L${r.prevLine}) diff=${r.diff} -> ${r.cur.trim().slice(0,120)}`);
  });
}

fs.writeFileSync(path.join(__dirname,'misaligned_report.json'), JSON.stringify(results,null,2));
console.log('\nReport written to tools/misaligned_report.json');
