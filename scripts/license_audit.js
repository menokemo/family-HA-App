const fs = require('fs');
const path = require('path');
const root = '/home/claude/repo/node_modules';

// Collect every package's declared license
function readPkgs(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === '.bin' || e.name === '.cache') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('@')) { readPkgs(full, out); continue; }
      const pj = path.join(full, 'package.json');
      if (fs.existsSync(pj)) {
        try {
          const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
          if (p.name) {
            let lic = p.license || (p.licenses && (Array.isArray(p.licenses) ? p.licenses.map(x => x.type || x).join(' OR ') : (p.licenses.type || p.licenses))) || 'UNKNOWN';
            if (typeof lic === 'object') lic = lic.type || JSON.stringify(lic);
            out[p.name + '@' + (p.version || '?')] = String(lic);
          }
        } catch {}
      }
      // nested node_modules
      const nested = path.join(full, 'node_modules');
      if (fs.existsSync(nested)) readPkgs(nested, out);
    }
  }
}

const out = {};
readPkgs(root, out);

// Classify
const copyleftStrong = /\b(GPL-|GPLv|AGPL|AGPLv)/i;        // strong copyleft (can force open-sourcing)
const copyleftWeak = /\b(LGPL|MPL|EPL|CDDL|CPL)\b/i;        // weak copyleft (file-level, usually OK if unmodified)
const permissive = /\b(MIT|ISC|BSD|Apache|0BSD|Unlicense|WTFPL|CC0|Zlib|Python-2|BlueOak)\b/i;

const strong = [], weak = [], unknown = [], counts = {};
for (const [pkg, lic] of Object.entries(out)) {
  counts[lic] = (counts[lic] || 0) + 1;
  // exclude the LGPL/GPL-with-exception false positives later by eye
  if (copyleftStrong.test(lic)) strong.push([pkg, lic]);
  else if (copyleftWeak.test(lic)) weak.push([pkg, lic]);
  else if (!permissive.test(lic) && lic !== 'UNKNOWN') unknown.push([pkg, lic]);
  else if (lic === 'UNKNOWN') unknown.push([pkg, lic]);
}

console.log('=== إجمالي الحزم المفحوصة:', Object.keys(out).length, '===\n');

console.log('=== 🚨 قوي copyleft (GPL/AGPL) — خطر على منتج تجاري مغلق ===');
console.log(strong.length ? strong.map(x => x[0] + '  →  ' + x[1]).join('\n') : '  ✅ لا يوجد');

console.log('\n=== ⚠️ ضعيف copyleft (LGPL/MPL/EPL...) — عادة مقبول لو مش معدّل ===');
console.log(weak.length ? weak.map(x => x[0] + '  →  ' + x[1]).join('\n') : '  ✅ لا يوجد');

console.log('\n=== ❓ رخصة غير معروفة / غير قياسية — تحتاج مراجعة يدوية ===');
console.log(unknown.length ? unknown.map(x => x[0] + '  →  ' + x[1]).join('\n') : '  ✅ لا يوجد');

console.log('\n=== ملخص كل الرخص (عدد) ===');
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([l, c]) => console.log(String(c).padStart(4), l));
