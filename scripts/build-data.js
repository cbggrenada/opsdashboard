// Reads every workbook (and shift-report CSV) in data/raw and writes the dashboard data.
// GitHub Actions runs this whenever a file is uploaded. It can also be run by hand: node scripts/build-data.js
//
// How files are recognised
// - Each table the dashboard needs is listed in scripts/schema.json with its column names.
// - A sheet is used for a table when the sheet has the table's name (e.g. "Fact_Downtime"),
//   or when its header row contains nearly all of the table's columns (so a renamed sheet still works).
// - File names do not matter. Uploading a new copy of a workbook replaces the old figures.
// - If two files hold the same table for the same year, the most recently uploaded file wins.
//   Files for different years (e.g. a 2027 copy of a workbook) are added together.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, '_site');
const SCHEMA = require('./schema.json');

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[ \s]+/g, ' ').trim();
const log = [];
const say = s => { log.push(s); console.log(s); };

// ---------- value parsing ----------
function serialToISO(n) {
  const d = XLSX.SSF.parse_date_code(n);
  if (!d || !d.y) return null;
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
}
function monthFromText(s) {
  const t = norm(s).slice(0, 3);
  const i = MON.indexOf(t);
  return i < 0 ? null : i + 1;
}
function parseDate(v, fallbackYear) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? serialToISO(v) : null;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // MM/DD/YYYY (as in the shift report)
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[\s\-\/]*([A-Za-z]{3,9})\.?[\s\-\/,]*(\d{2,5})?$/); // 4-May-2026, 5-May, 12-may-20256
  if (m) {
    const mo = monthFromText(m[2]); if (!mo) return null;
    let y = m[3] ? +m[3] : null;
    if (y != null && y < 100) y += 2000;
    if (y == null || y < 2015 || y > 2040) y = fallbackYear || null; // typo or no year: use the file's year
    return y ? `${y}-${String(mo).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}` : null;
  }
  const n = Number(s);
  if (Number.isFinite(n)) return parseDate(n, fallbackYear);
  return null;
}
function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).replace(/[,\s$]/g, '').replace(/%$/, '');
  if (s === '' || s.startsWith('#') || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseText(v) {
  if (v == null) return null;
  const s = String(v).replace(/ /g, ' ').trim();
  return s === '' ? null : s;
}
function parseBool(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = norm(v);
  return s === 'true' || s === 'yes' || s === '1' ? true : s === 'false' || s === 'no' || s === '0' ? false : null;
}
const PARSE = { num: parseNum, text: parseText, date: parseDate, bool: parseBool };

// ---------- when was each file uploaded? (git history first, file time as a fallback) ----------
function fileTime(abs) {
  try {
    const t = cp.execSync(`git log -1 --format=%ct -- "${abs}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (t) return +t * 1000;
  } catch (e) { /* not a git checkout */ }
  return fs.statSync(abs).mtimeMs;
}
const yearInName = f => { const m = f.match(/20[2-4]\d/); return m ? +m[0] : null; };

// ---------- CSV reader (keeps every value as text, like Power Query does) ----------
function readCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ---------- the shift report (Average cases per hr-shift ... .csv or the same layout in a workbook) ----------
const SHIFT_COLS = {
  Date: ['date ( mm/dd/yyyy)', 'date'], Supervisor: ['supervisor'], Shift: ['shift'], Product: ['product'],
  FillMin: ['fill time/ mins', 'fill time'], Cases: ['cases bottled/cs', 'cases bottled'],
  Efficiency: ['line rated efficiency/%', 'line rated efficiency'], CPH: ['average case per hour/ cs/hr', 'average case per hour'],
  Changeover: ['changeover time/mins', 'changeover time'], ExpChangeover: ['expected changeover time'],
  Downtime: ['total downtime /mins', 'total downtime'], PersonnelDowntime: ['downtime due to personnel'],
};
const SHIFT_JUNK = new Set(['', 'case/hr', 'no bottling', 'ytd output', 'product']);
function shiftHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = rows[i].map(norm);
    if (h.includes('product') && h.some(x => x.startsWith('cases bottled'))) return i;
  }
  return -1;
}
function parseShift(rows, hi, file, fallbackYear) {
  const h = rows[hi].map(norm);
  const idx = {};
  for (const [k, names] of Object.entries(SHIFT_COLS)) {
    let j = -1;
    for (const n of names) { j = h.findIndex(x => x === n); if (j >= 0) break; }
    if (j < 0) for (const n of names) { j = h.findIndex(x => x.startsWith(n)); if (j >= 0) break; }
    idx[k] = j;
  }
  const out = []; let last = {};
  const fy = fallbackYear || yearInName(file);
  const fileMonth = (() => { const m = file.match(/\(([A-Za-z]+)\)/); return m ? monthFromText(m[1]) : null; })();
  for (let r = hi + 1; r < rows.length; r++) {
    const g = k => (idx[k] >= 0 ? rows[r][idx[k]] : null);
    const prod = parseText(g('Product'));
    if (!prod || SHIFT_JUNK.has(norm(prod)) || /^[\d.\s]+$/.test(prod)) continue;
    let date = parseDate(g('Date'), fy);
    const sup = parseText(g('Supervisor')), sh = parseText(g('Shift'));
    // rows without a date continue the shift above (a product change within the shift)
    const cont = !date && !sh;
    if (!date) date = last.Date || null;
    const rec = {
      Date: date, Supervisor: sup || (cont ? last.Supervisor : null) || null, Shift: (sh || (cont ? last.Shift : null) || '').replace(/\s+/g, '') || null,
      Product: prod, FillMin: parseNum(g('FillMin')), Cases: parseNum(g('Cases')), Efficiency: parseNum(g('Efficiency')), CPH: parseNum(g('CPH')),
      Changeover: parseNum(g('Changeover')), ExpChangeover: parseNum(g('ExpChangeover')), Downtime: parseNum(g('Downtime')),
      PersonnelDowntime: parseNum(g('PersonnelDowntime')),
    };
    if (rec.Date) { const [y, m] = rec.Date.split('-'); rec._y = +y; rec._m = +m; }
    else { rec._y = fy; rec._m = fileMonth; }
    if (rec.Date || rec.Shift) last = rec;
    out.push(rec);
  }
  return out;
}

// ---------- match a sheet to a table ----------
const SCHEMA_NAMES = Object.keys(SCHEMA);
// sheets in the same workbooks that the dashboard does not use (so they are never mistaken for a needed table)
const OTHER_SHEETS = new Set(['monthly_summary', 'product_summary', 'category_map', 'dim_product', 'dim_month', 'dim_monthyear', 'dim_year',
  'scorecard', 'fact_brewsperday', 'fact_utilities', 'cases_ytd', 'fact_extractloss_monthly', 'daily_summary', 'monthly_kpis', 'fact_brews',
  'fact_filtration', 'fact_brewerperf', 'dim_brand', 'dim_operator', 'readme', 'notes']);
function findHeader(rows, cols) {
  const want = Object.keys(cols).map(norm);
  let best = { i: -1, hit: 0 };
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = new Set((rows[i] || []).map(norm));
    const hit = want.filter(c => h.has(c)).length;
    if (hit > best.hit) best = { i, hit };
  }
  return { ...best, share: best.hit / want.length };
}
function readTable(rows, hi, cols, file, fallbackYear, notes) {
  const h = rows[hi].map(norm);
  const map = Object.keys(cols).map(c => [c, h.indexOf(norm(c)), PARSE[cols[c]] || parseText, cols[c]]);
  const hasNum = map.some(m => m[3] === 'num' && m[1] >= 0);
  const out = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const filled = row.filter(v => v != null && String(v).trim() !== '');
    // a single line of text under the table is a note (e.g. "Source: ..."), not a data row
    if (filled.length === 1 && typeof filled[0] === 'string' && filled[0].trim().length > 20) { notes.push(filled[0].trim()); continue; }
    const o = {}; let any = false, anyNum = false;
    for (const [c, j, p, t] of map) {
      const v = j >= 0 ? p(row[j], fallbackYear) : null;
      o[c] = v; if (v != null) { any = true; if (t === 'num') anyNum = true; }
    }
    if (any && (!hasNum || anyNum)) out.push(o);
  }
  return out;
}
function stampYM(rows, fileYear) {
  for (const o of rows) {
    let y = parseNum(o.Year);
    const d = o.Date || o.MonthYear;
    if (y == null && typeof d === 'string') y = +d.slice(0, 4);
    if (y == null) y = fileYear;
    let m = parseNum(o.MonthNum);
    if (m == null && o.Month) m = monthFromText(o.Month);
    if (m == null && typeof d === 'string') m = +d.slice(5, 7);
    o._y = y == null ? null : y; o._m = m == null ? null : m;
  }
  return rows;
}

// ---------- monthly Utilities Tracking workbooks (raw): sheet "Utility Analysis <Month> <Year>" ----------
// Replaces CBG_Utilities_Weekly_2026: the weekly and monthly utility tables are built straight from the daily rows.
const UT_COLS = [['Electricity', /^ELECTRICITY TOTAL/, 'kWh'], ['Solar', /^SOLAR/, 'kWh'], ['Water', /^WATER$/, 'Hl'], ['Fuel', /^FUEL$/, 'L'], ['CO2', /^CO2/, 'kg']];
function parseUtilTracking(rows, sheetName, file) {
  let m = monthFromText((sheetName.match(/utility analysis\s+([A-Za-z]+)/i) || [])[1] || '');
  let y = yearInName(sheetName);
  if (!m) { const mm = file.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i); m = mm ? monthFromText(mm[1]) : null; }
  if (!y) y = yearInName(file);
  if (!m || !y) return null;
  const h = rows.findIndex(r => r && r.some(c => /^electricity total/i.test(String(c || '').trim())));
  if (h < 0) return null;
  const head = rows[h].map(c => String(c || '').trim().toUpperCase());
  const col = {}; for (const [k, re] of UT_COLS) { const j = head.findIndex(c => re.test(c)); if (j >= 0) col[k] = j; }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = {}; let seen = false;
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const first = String(row[0] == null ? '' : row[0]).trim();
    if (/^total$/i.test(first) || row.some(c => /^mtd$/i.test(String(c || '').trim()))) break;
    let d = parseNum(row[0]);
    if (d == null && seen) d = last;          // unlabelled rows under the day list are part of the sheet totals: count them on the last day
    if (d == null || d < 1 || d > 31 || d % 1) continue;
    seen = true; d = Math.min(d, last);       // rows past the month end (e.g. 29-31 in February) also count in the totals
    const v = {}; let any = false;
    for (const k in col) { const x = parseNum(row[col[k]]); if (x != null) { v[k] = x; if (x) any = true; } }
    if (!any) continue;
    const t = days[d] || (days[d] = {}); for (const k in v) t[k] = (t[k] || 0) + v[k];
  }
  return Object.keys(days).length ? { y, m, days } : null;
}
function utilityTables(months) {
  const weekly = [], monthly = [];
  const latest = months.reduce((a, b) => (b.y * 100 + b.m > a ? b.y * 100 + b.m : a), 0);
  for (const u of months.sort((a, b) => a.y - b.y || a.m - b.m)) {
    const last = new Date(Date.UTC(u.y, u.m, 0)).getUTCDate();
    const lastData = Math.max(...Object.keys(u.days).map(Number));
    const upto = u.y * 100 + u.m === latest && lastData < last ? lastData : last; // the current month is month to date
    const mon = MON[u.m - 1][0].toUpperCase() + MON[u.m - 1].slice(1);
    for (const [k, , unit] of UT_COLS) {
      let tot = 0, has = false; const wk = [0, 0, 0, 0, 0], wh = [false, false, false, false, false];
      for (const [d, v] of Object.entries(u.days)) if (v[k] != null) { tot += v[k]; has = true; const w = Math.min(5, Math.ceil(d / 7)) - 1; wk[w] += v[k]; wh[w] = true; }
      if (!has) continue;
      const r4 = x => Math.round(x * 10000) / 10000;
      monthly.push({ Year: u.y, MonthNum: u.m, Month: mon, SortKey: u.y * 100 + u.m, Utility: k, Unit: unit, Value: r4(tot), Days: upto, _y: u.y, _m: u.m });
      for (let w = 0; w < 5; w++) {
        const from = w * 7 + 1, to = w === 4 ? upto : Math.min(upto, w * 7 + 7);
        if (from > upto || !wh[w]) continue;
        weekly.push({ Year: u.y, MonthNum: u.m, Month: mon, Week: 'W' + (w + 1), WeekLabel: `${mon} W${w + 1}`, SortKey: u.y * 1000 + u.m * 10 + w + 1, Utility: k, Unit: unit, Value: r4(wk[w]), Days: to - from + 1, _y: u.y, _m: u.m });
      }
    }
  }
  return { weekly, monthly };
}
const utilMonths = []; // {file,time,y,m,days}

// ---------- read everything ----------
const files = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter(f => /\.(xlsx|xlsm|xls|csv)$/i.test(f) && !f.startsWith('~$')).sort() : [];
const candidates = {}; // table -> [{file,time,rows}]
const sources = [];
for (const f of files) {
  const abs = path.join(RAW, f);
  const src = { file: f, time: fileTime(abs), tables: [], ignored: [] };
  sources.push(src);
  const fy = yearInName(f);
  let sheets = [];
  try {
    if (/\.csv$/i.test(f)) sheets = [{ name: f, rows: readCSV(fs.readFileSync(abs, 'utf8').replace(/^﻿/, '')) }];
    else {
      const wb = XLSX.readFile(abs, { cellDates: false, raw: true });
      sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }) }));
    }
  } catch (e) { src.error = e.message; say(`! ${f}: could not be read (${e.message})`); continue; }
  const isTracking = sheets.some(sh => /^\s*utility analysis/i.test(sh.name));
  for (const sh of sheets) {
    if (isTracking) {
      const u = /^\s*utility analysis/i.test(sh.name) ? parseUtilTracking(sh.rows, sh.name, f) : null;
      if (u) {
        utilMonths.push({ file: f, time: src.time, ...u });
        src.tables.push({ name: 'Fact_Utilities_Monthly', sheet: sh.name, rows: Object.keys(u.days).length + ' days' }, { name: 'Fact_Utilities_Weekly', sheet: sh.name, rows: Object.keys(u.days).length + ' days' });
      } else src.ignored.push(sh.name);
      continue;
    }
    const hiShift = shiftHeader(sh.rows);
    if (hiShift >= 0) {
      const rows = parseShift(sh.rows, hiShift, f, fy).map(r => ({ ...r, _file: f }));
      (candidates.ShiftLog = candidates.ShiftLog || []).push({ file: f, time: src.time, rows });
      src.tables.push({ name: 'ShiftLog', sheet: sh.name, rows: rows.length });
      continue;
    }
    const exact = SCHEMA_NAMES.find(t => norm(t) === norm(sh.name));
    let pick = null;
    if (exact) { const hd = findHeader(sh.rows, SCHEMA[exact]); if (hd.share >= 0.6) pick = { t: exact, ...hd }; }
    else if (!OTHER_SHEETS.has(norm(sh.name))) {
      // a renamed sheet is used only when its header has every column of the table
      for (const t of SCHEMA_NAMES) {
        const hd = findHeader(sh.rows, SCHEMA[t]);
        if (hd.share === 1 && (!pick || Object.keys(SCHEMA[t]).length > Object.keys(SCHEMA[pick.t]).length)) pick = { t, ...hd };
      }
    }
    if (!pick) { src.ignored.push(sh.name); continue; }
    const tnotes = [];
    const rows = stampYM(readTable(sh.rows, pick.i, SCHEMA[pick.t], f, fy, tnotes), fy);
    (candidates[pick.t] = candidates[pick.t] || []).push({ file: f, time: src.time, rows, notes: tnotes });
    src.tables.push({ name: pick.t, sheet: sh.name, rows: rows.length });
  }
}

// raw Utilities Tracking workbooks: one month per file (newest upload wins for a month); they take priority
// over CBG_Utilities_Weekly_2026 for every year they cover
if (utilMonths.length) {
  const byMonth = {};
  for (const u of utilMonths.sort((a, b) => b.time - a.time || b.file.localeCompare(a.file))) { const k = u.y * 100 + u.m; if (!byMonth[k]) byMonth[k] = u; }
  const picked = Object.values(byMonth);
  const { weekly, monthly } = utilityTables(picked);
  const files = [...new Set(picked.map(u => u.file))];
  const top = Number.MAX_SAFE_INTEGER;
  (candidates.Fact_Utilities_Monthly = candidates.Fact_Utilities_Monthly || []).push({ file: files[0], files, time: top, rows: monthly });
  (candidates.Fact_Utilities_Weekly = candidates.Fact_Utilities_Weekly || []).push({ file: files[0], files, time: top, rows: weekly });
}

// ---------- combine: newest file wins for a year, different years are added together ----------
const tables = {}; const usedFrom = {}; const notes = {};
for (const [t, list] of Object.entries(candidates)) {
  list.sort((a, b) => b.time - a.time || b.file.localeCompare(a.file));
  const taken = new Set(); const rows = []; usedFrom[t] = [];
  for (const c of list) {
    const ys = new Set(c.rows.map(r => r._y == null ? 'none' : r._y));
    const fresh = [...ys].filter(y => !taken.has(y));
    if (!fresh.length) continue;
    rows.push(...c.rows.filter(r => fresh.includes(r._y == null ? 'none' : r._y)));
    fresh.forEach(y => taken.add(y));
    usedFrom[t].push(...(c.files || [c.file]));
    if (c.notes && c.notes.length) notes[t] = [...(notes[t] || []), ...c.notes];
  }
  tables[t] = rows;
}
const missing = [...SCHEMA_NAMES, 'ShiftLog'].filter(t => !tables[t] || !tables[t].length);

// compact form: column list + rows of values
const packed = {};
for (const [t, rows] of Object.entries(tables)) {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  packed[t] = { cols, rows: rows.map(r => cols.map(c => (r[c] === undefined ? null : r[c]))) };
}
for (const s of sources) for (const x of s.tables) x.used = (usedFrom[x.name] || []).includes(s.file);

// latest date seen anywhere, for the "data up to" line
let latest = null;
for (const rows of Object.values(tables)) for (const r of rows) {
  const d = typeof r.Date === 'string' ? r.Date : (r._y && r._m ? `${r._y}-${String(r._m).padStart(2, '0')}-01` : null);
  if (d && (!latest || d > latest) && d <= new Date().toISOString().slice(0, 10)) latest = d;
}

const data = { generatedAt: new Date().toISOString(), latest, sources, missing, notes, tables: packed };
const json = JSON.stringify(data);

// ---------- write the outputs ----------
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'ops-data.json'), json);
fs.writeFileSync(path.join(ROOT, 'data', 'ops-data.js'), 'window.OPS_DATA=' + json + ';\n');
const htmlPath = path.join(ROOT, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/\/\*OPS_DATA_START\*\/[\s\S]*?\/\*OPS_DATA_END\*\//, () => '/*OPS_DATA_START*/window.OPS_DATA_EMBED=' + json.replace(/<\/script/gi, '<\\/script') + ';/*OPS_DATA_END*/');
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.copyFileSync(path.join(ROOT, 'data', 'ops-data.json'), path.join(OUT, 'data', 'ops-data.json'));
fs.copyFileSync(path.join(ROOT, 'data', 'ops-data.js'), path.join(OUT, 'data', 'ops-data.js'));

// build report: what was read from where
say(`\nBuilt ${data.generatedAt} from ${files.length} file(s). Latest data: ${latest || 'none'}`);
for (const s of sources) {
  say(`- ${s.file}${s.error ? '  ERROR: ' + s.error : ''}`);
  for (const x of s.tables) say(`    ${x.used ? 'used   ' : 'older  '} ${x.name} (sheet "${x.sheet}", ${x.rows}${typeof x.rows === 'number' ? ' rows' : ''})`);
  if (s.ignored.length) say(`    not needed: ${s.ignored.join(', ')}`);
}
if (missing.length) say(`\nNot found in any file (those visuals show "No data"): ${missing.join(', ')}`);
fs.writeFileSync(path.join(ROOT, 'data', 'build-report.txt'), log.join('\n') + '\n');
