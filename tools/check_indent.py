import re
import sys

def indent_width(s):
    w = 0
    for ch in s:
        if ch == '\t':
            w += 4
        elif ch == ' ':
            w += 1
        else:
            break
    return w

file_path = sys.argv[1] if len(sys.argv) > 1 else r'e:\createTeamProgram\command-console.js'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

prev_idx = -1
results = []

for i, line in enumerate(lines):
    if line.strip() == '':
        continue
    if prev_idx == -1:
        prev_idx = i
        continue
    
    prev = lines[prev_idx]
    cur = line
    prev_trim = prev.strip()
    cur_trim = cur.strip()
    prev_indent = indent_width(prev)
    cur_indent = indent_width(cur)
    diff = cur_indent - prev_indent
    
    prev_ends_with_open = bool(re.search(r'\{\s*$', prev_trim))
    cur_starts_close = cur_trim.startswith('}')
    
    if diff >= 6 and not prev_ends_with_open and not cur_starts_close:
        results.append({
            'line': i + 1,
            'prev_line': prev_idx + 1,
            'prev_indent': prev_indent,
            'cur_indent': cur_indent,
            'diff': diff,
            'content': cur_trim[:80]
        })
    
    prev_idx = i

print(f'Checked: {file_path}')
print(f'Total lines: {len(lines)}')

if len(results) == 0:
    print('OK - No indent issues detected')
else:
    print(f'WARNING - {len(results)} indent issues found:')
    for r in results:
        print(f"  Line {r['line']} (prev {r['prev_line']}) diff={r['diff']} -> {r['content']}")
