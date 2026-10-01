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
const uniqArr = a => [...new Set(a)];
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

// ---------- other raw workbooks, read with the same readers as the CBG production dashboard ----------
// Gross_Efficiency (one row per production run), Daily Process Reports, OEE, FTR and PM compliance workbooks.
const RP = require('./raw-parsers');
const RAW_TYPES = new Set(['gross', 'process', 'procvol', 'oee', 'ftr', 'pm', 'util']);
const RAW_LABEL = { gross: 'Gross Efficiency', process: 'Daily Process Report', procvol: 'Monthly process loss', oee: 'OEE workbook', ftr: 'FTR workbook', pm: 'PM compliance', util: 'Utilities Tracking' };
const rawFiles = []; // {file,time,type,res,runs}
const RO = require('./raw-ops');
const BUCKETS = (() => { try { return require('./downtime-buckets.json'); } catch (e) { return {}; } })();
const opsFiles = []; // {file,time,kind:'downtime'|'bottling'|'sctcm',year,res}
const PRODUCT_MAP = (() => { try { return require('./product-map.json'); } catch (e) { return {}; } })();
const pkey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const PMAP = {}; for (const [k, v] of Object.entries(PRODUCT_MAP)) PMAP[pkey(k)] = v;
const unknownProducts = new Set();
function productFamily(raw) {
  const k = pkey(raw);
  if (PMAP[k]) return PMAP[k];
  // try again without pack / market words, e.g. "CARIB FLINT ( EXPORT )" -> "CARIB FLINT"
  const k2 = pkey(String(raw).toUpperCase().replace(/\(.*?\)|\b(EXPORT|EXP|LOCAL|TRIAL|TRAIL|SHORT|MEDIUM|ORG)\b/g, ' '));
  if (PMAP[k2]) return PMAP[k2];
  unknownProducts.add(String(raw).trim());
  const t = String(raw).trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return [t, 'Other'];
}
const rtxt = v => (v == null ? '' : v instanceof Date ? v.toISOString() : String(v)).trim();
// run-level reader for Gross_Efficiency: every production run with its product
function grossRuns(wb) {
  const out = [];
  for (const n of wb.SheetNames) {
    const ws = wb.Sheets[n]; if (!ws || !ws['!ref']) continue;
    const a = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const h = a.findIndex(r => r && r.some(c => rtxt(c).toUpperCase() === 'DATE') && r.some(c => /^FILL/i.test(rtxt(c))));
    if (h < 0) continue;
    const comb = i => `${rtxt(a[h][i])} ${rtxt(a[h + 1] && a[h + 1][i])}`.trim().toUpperCase();
    const C = {};
    for (let i = 0; i < a[h].length; i++) {
      const c = comb(i);
      if (C.date == null && /^DATE/.test(c)) C.date = i;
      else if (C.prod == null && /^PRODUCT/.test(c)) C.prod = i;
      else if (C.avail == null && /^AVAIL/.test(c)) C.avail = i;
      else if (C.fill == null && /^FILL/.test(c)) C.fill = i;
      else if (C.cases == null && /^CASES( BOTTLED)?$/.test(c)) C.cases = i;
      else if (C.eff == null && /^LINE RATED/.test(c)) C.eff = i;
      else if (C.bbt == null && /^BBT/.test(c)) C.bbt = i;
      else if (C.btl == null && /^BOTTLED HLS/.test(c)) C.btl = i;
      else if (C.rej == null && /^REJECTS/.test(c)) C.rej = i;
    }
    if (C.avail == null && C.fill > 0 && /^TIME$/.test(comb(C.fill - 1))) C.avail = C.fill - 1;
    if (C.date == null || C.cases == null || C.prod == null) continue;
    const sm = monthFromText(n.trim().slice(0, 3)); const sy = yearInName(n.replace(/_206\b/, '_2026'));
    for (let r = h + 2; r < a.length; r++) {
      const row = a[r]; if (!row) continue;
      let ds = RP.parseDate(row[C.date]); if (!ds) continue;
      if (sm && +ds.slice(5, 7) !== sm) continue;                       // keep the sheet's own month
      if (sy && +ds.slice(0, 4) !== sy) ds = `${sy}-${ds.slice(5)}`;     // fix a mistyped year
      const g = k => (C[k] == null ? null : parseNum(row[C[k]]));
      const prod = parseText(row[C.prod]); if (!prod) continue;
      out.push({ ds, prod, avail: g('avail'), fill: g('fill'), cases: g('cases'), eff: g('eff'), bbt: g('bbt'), btl: g('btl'), rej: g('rej') });
    }
  }
  return out;
}

// ---------- read everything ----------
const files = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter(f => /\.(xlsx|xlsm|xls|csv|pptx)$/i.test(f) && !f.startsWith('~$')).sort() : [];
const candidates = {}; // table -> [{file,time,rows}]
const sources = [];
for (const f of files) {
  const abs = path.join(RAW, f);
  const src = { file: f, time: fileTime(abs), tables: [], ignored: [] };
  sources.push(src);
  const fy = yearInName(f);
  let sheets = [];
  if (/\.pptx$/i.test(f)) {
    try {
      const res = RO.parseSctcm(fs.readFileSync(abs), f);
      if (res.length) { opsFiles.push({ file: f, time: src.time, kind: 'sctcm', res }); src.raw = `SCTCM report, KPI scorecard for ${[...new Set(res.map(r => MON[r.m - 1].toUpperCase().slice(0, 1) + MON[r.m - 1].slice(1) + ' ' + r.y))].join(', ')}`; }
      else src.ignored.push('no KPI scorecard slide found');
    } catch (e) { src.error = e.message; say(`! ${f}: ${e.message}`); }
    continue;
  }
  try {
    if (/\.csv$/i.test(f)) sheets = [{ name: f, rows: readCSV(fs.readFileSync(abs, 'utf8').replace(/^﻿/, '')) }];
    else {
      const wb = XLSX.readFile(abs, { cellDates: false, raw: true });
      sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }) }));
    }
  } catch (e) { src.error = e.message; say(`! ${f}: could not be read (${e.message})`); continue; }
  // raw workbooks (not the Power BI model workbooks, which have sheets named after their tables)
  const isModel = sheets.some(sh => SCHEMA_NAMES.some(t => norm(t) === norm(sh.name)) || OTHER_SHEETS.has(norm(sh.name)));
  if (!isModel && !/\.csv$/i.test(f)) {
    try {
      const wbd = RP.XLSX.read(fs.readFileSync(abs), { type: 'buffer', cellDates: true });
      if (RO.isLineDowntime(wbd)) {
        const res = RO.parseLineDowntime(wbd, f, BUCKETS);
        opsFiles.push({ file: f, time: src.time, kind: 'downtime', year: yearInName(f), res });
        src.raw = `Line downtime log, ${new Set(res.Fact_Downtime.map(r => r._m)).size} months`; continue;
      }
      if (RO.isDailyBottling(wbd)) {
        const res = RO.parseDailyBottling(wbd, f, productFamily);
        opsFiles.push({ file: f, time: src.time, kind: 'bottling', year: yearInName(f), res });
        src.raw = `Daily bottling summary, ${res.length} runs`; continue;
      }
      const type = RP.detectType(wbd, f);
      if (RAW_TYPES.has(type)) {
        const res = RP.parseKnown(wbd, f);
        const runs = type === 'gross' ? grossRuns(wbd) : null;
        rawFiles.push({ file: f, time: src.time, type, res, runs });
        if (type !== 'util') {
          const months = uniqArr([...Object.keys(res.rows || {}).map(d => d.slice(0, 7)), ...Object.keys(res.monthly || {})]).sort();
          src.raw = `${RAW_LABEL[type]}${months.length ? `, ${months[0]} to ${months[months.length - 1]}` : ''}`;
          continue;
        }
      }
    } catch (e) { src.error = e.message; say(`! ${f}: ${e.message}`); continue; }
  }
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

// ---------- tables built from the raw workbooks ----------
const TOP = Number.MAX_SAFE_INTEGER;
const MONTH_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const M3 = m => MONTH_L[m - 1].slice(0, 3);
const pad2 = n => String(n).padStart(2, '0');
function newestPerMonth(type, monthsOf) { // month id -> file entry (newest upload wins)
  const pick = {};
  for (const r of rawFiles.filter(x => x.type === type).sort((a, b) => b.time - a.time || b.file.localeCompare(a.file)))
    for (const id of monthsOf(r)) if (!pick[id]) pick[id] = r;
  return pick;
}
const rawTables = {};
const rawUsed = {}; // table -> Set(files)
const useRaw = (t, f) => (rawUsed[t] = rawUsed[t] || new Set()).add(f);
// Gross Efficiency -> Fact_Efficiency (every run with cases) and Fact_Packaging (every run with a BBT volume)
{
  const pick = newestPerMonth('gross', r => uniqArr(r.runs.map(x => x.ds.slice(0, 7))));
  const eff = [], pkg = [];
  for (const [id, r] of Object.entries(pick)) {
    for (const x of r.runs.filter(x => x.ds.slice(0, 7) === id)) {
      const y = +id.slice(0, 4), m = +id.slice(5, 7), my = `${id}-01`;
      if (!(x.cases > 0) && !(x.bbt > 0)) continue;   // downtime notes such as "WASHER BREAKDOWN" are not production runs
      const [fam, cat] = productFamily(x.prod);
      if (x.cases > 0) eff.push({ Date: x.ds, Year: y, Month: MONTH_L[m - 1], MonthNum: m, MonthYear: my, 'Product Family': fam, Category: cat,
        'Available Time': x.avail, 'Fill Time': x.fill, 'Cases Bottled': x.cases, 'Line Efficiency %': x.eff, 'BBT HLs': x.bbt, 'Bottled HLs': x.btl, _y: y, _m: m });
      if (x.bbt > 0) {
        const loss = x.btl != null ? x.bbt - x.btl : null;
        pkg.push({ Date: x.ds, Year: y, Month: M3(m), MonthNum: m, MonthYear: my, 'Product Raw': x.prod, 'Product Family': fam, Category: cat, 'BBT HLs': x.bbt, 'Bottled HLs': x.btl,
          'Loss HLs': loss == null ? null : Math.round(loss * 10000) / 10000, 'Loss % (run)': loss == null ? null : Math.round(loss / x.bbt * 1e6) / 1e4, Cases: x.cases, Rejects: x.rej, _y: y, _m: m });
      }
      useRaw('Fact_Efficiency', r.file); useRaw('Fact_Packaging', r.file);
    }
  }
  if (eff.length) rawTables.Fact_Efficiency = eff;
  if (pkg.length) rawTables.Fact_Packaging = pkg;
}
// Production KPIs, month to date and year to date, for every month the raw files cover
{
  const gross = newestPerMonth('gross', r => uniqArr(r.runs.map(x => x.ds.slice(0, 7))));
  const util = newestPerMonth('util', r => [r.res.month]);
  const proc = newestPerMonth('process', r => uniqArr(Object.keys(r.res.rows).map(d => d.slice(0, 7))));
  const kfile = t => newestPerMonth(t, r => Object.keys(r.res.monthly || {}));
  const oee = kfile('oee'), ftr = kfile('ftr'), pm = kfile('pm');
  const months = uniqArr([...Object.keys(gross), ...Object.keys(proc), ...Object.keys(util)]).sort();
  const sumRuns = (ids, k) => { let s = 0, n = 0; for (const id of ids) if (gross[id]) for (const x of gross[id].runs) if (x.ds.slice(0, 7) === id && x[k] != null) { s += x[k]; n++; } return n ? s : null; };
  const utilSum = (ids, k) => { let s = 0, n = 0; for (const id of ids) if (util[id]) for (const v of Object.values(util[id].res.rows)) if (v[k] != null) { s += v[k]; n++; } return n ? s : null; };
  const lastOf = (id, k) => { const r = proc[id]; if (!r) return null; const ds = Object.keys(r.res.rows).filter(d => d.slice(0, 7) === id && r.res.rows[d][k] != null).sort().pop(); return ds ? r.res.rows[ds][k] : null; };
  const kv = (src, id, k) => { const r = src[id]; const mo = r && r.res.monthly && r.res.monthly[id]; return mo && mo.kpi ? mo.kpi[k] ?? null : null; };
  const kt = (src, id, k) => { const r = src[id]; const mo = r && r.res.monthly && r.res.monthly[id]; return (mo && mo.targets && mo.targets[k]) ?? (r && r.res.targets && r.res.targets[k]) ?? null; };
  const ut = (id, k) => (util[id] && util[id].res.targets ? util[id].res.targets[k] ?? null : null);
  const rows = [];
  const r1 = v => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
  for (const id of months) {
    const y = +id.slice(0, 4), m = +id.slice(5, 7);
    const ytd = months.filter(x => x.slice(0, 4) === id.slice(0, 4) && x <= id);
    const ratio = (ids, k) => { const a = utilSum(ids, k), b = utilSum(ids, 'utilHl'); return a != null && b ? a / b : null; };
    const loss = ids => { const b = sumRuns(ids, 'bbt'), o = sumRuns(ids, 'btl'); return b ? (b - o) / b * 100 : null; };
    const caseBud = ids => { const v = ids.map(i => ut(i, 'cases')); return v.every(x => x != null) ? v.reduce((a, b) => a + b, 0) : null; };
    const add = (KPI, Unit, dir, mtd, ytdv, bud, budY, files) => {
      for (const [Period, Actual, Budget] of [['MTD', mtd, bud], ['YTD', ytdv, budY === undefined ? bud : budY]])
        if (Actual != null) rows.push({ KPI, Unit, Period, Actual: Unit === 'cases' ? Actual : r1(Actual), Budget: Budget == null ? null : (Unit === 'cases' ? Budget : r1(Budget)), 'Last Year': null, 'Better Direction': dir, Year: y, MonthNum: m, Month: M3(m), _y: y, _m: m, _raw: 1 });
      for (const f of files.filter(Boolean)) useRaw('Production_KPIs', f);
    };
    add('Production Cases', 'cases', 'Higher', sumRuns([id], 'cases'), sumRuns(ytd, 'cases'), ut(id, 'cases'), caseBud(ytd), [gross[id] && gross[id].file]);
    add('OEE', '%', 'Higher', kv(oee, id, 'oeeMtd'), kv(oee, id, 'oeeYtd'), kt(oee, id, 'oee') ?? ut(id, 'oee'), undefined, [oee[id] && oee[id].file]);
    add('FTR', '%', 'Higher', kv(ftr, id, 'ftrMtd'), kv(ftr, id, 'ftrYtd'), kt(ftr, id, 'ftr') ?? ut(id, 'ftr'), undefined, [ftr[id] && ftr[id].file]);
    add('Maintenance Compliance', '%', 'Higher', kv(pm, id, 'pmMtd'), kv(pm, id, 'pmYtd'), kt(pm, id, 'pm') ?? 70, undefined, [pm[id] && pm[id].file]);
    add('Extract Recovery', '%', 'Higher', lastOf(id, 'bwMtd'), lastOf(id, 'bwYtd'), lastOf(id, 'bwTgt'), undefined, [proc[id] && proc[id].file]);
    add('Brews Per Day', 'brews', 'Higher', lastOf(id, 'bpdMtd'), lastOf(id, 'bpdYtd'), lastOf(id, 'bpdTgt'), undefined, [proc[id] && proc[id].file]);
    add('Total Bottling Loss', '%', 'Lower', loss([id]), loss(ytd), null, undefined, [gross[id] && gross[id].file]);
    add('Process Loss Vol.', '%', 'Lower', lastOf(id, 'plMtd'), lastOf(id, 'plYtd'), lastOf(id, 'plTgt'), undefined, [proc[id] && proc[id].file]);
    add('Water', 'hl/hl', 'Lower', ratio([id], 'water'), ratio(ytd, 'water'), ut(id, 'water'), undefined, [util[id] && util[id].file]);
    add('Fuel', 'L/hl', 'Lower', ratio([id], 'fuel'), ratio(ytd, 'fuel'), ut(id, 'fuel'), undefined, [util[id] && util[id].file]);
    add('Electricity', 'Kw/hl', 'Lower', ratio([id], 'elec'), ratio(ytd, 'elec'), ut(id, 'elec'), undefined, [util[id] && util[id].file]);
    add('CO2', 'Kg/hl', 'Lower', ratio([id], 'co2'), ratio(ytd, 'co2'), ut(id, 'co2'), undefined, [util[id] && util[id].file]);
  }
  // last year: the same month a year earlier, when those raw files are uploaded
  for (const r of rows) { const p = rows.find(x => x.KPI === r.KPI && x.Period === r.Period && x._y === r._y - 1 && x._m === r._m); if (p) r['Last Year'] = p.Actual; }
  // a month is shown once its production runs are in (stops a stray early figure, such as FTR on the 1st, opening a new month)
  const done = new Set(rows.filter(r => r.KPI === 'Production Cases' && r.Period === 'MTD').map(r => r._y * 100 + r._m));
  const keep = rows.filter(r => done.has(r._y * 100 + r._m));
  if (keep.length) rawTables.Production_KPIs = keep;
}
// line downtime and daily bottling: newest upload for each year
for (const kind of ['downtime', 'bottling']) {
  const byYear = {};
  for (const o of opsFiles.filter(x => x.kind === kind).sort((a, b) => b.time - a.time)) if (!byYear[o.year]) byYear[o.year] = o;
  for (const o of Object.values(byYear)) {
    const tabs = kind === 'bottling' ? { Fact_Bottling: o.res } : o.res;
    for (const [t, rows] of Object.entries(tabs)) if (rows.length) { (rawTables[t] = rawTables[t] || []).push(...rows); useRaw(t, o.file); }
    // machine or delay for each downtime category (from the Power BI Dim_Category table)
    if (kind === 'downtime' && !rawTables.Dim_Category) { rawTables.Dim_Category = require('./downtime-types.json').map(r => ({ ...r, _y: null, _m: null })); useRaw('Dim_Category', o.file); }
  }
}
// SCTCM decks: the scorecard slide gives every KPI for the month (MTD and YTD, actual, budget, last year)
const deckTables = {};
{
  const pick = {};
  for (const o of opsFiles.filter(x => x.kind === 'sctcm').sort((a, b) => b.time - a.time)) for (const r of o.res) { const k = r.y * 100 + r.m; if (!pick[k]) pick[k] = o; if (pick[k] === o) (o.use = o.use || []).push(r); }
  const add = (t, row, f) => { (deckTables[t] = deckTables[t] || []).push(row); (rawUsed[t] = rawUsed[t] || new Set()).add(f); };
  for (const o of Object.values(pick).filter((v, i, a) => a.indexOf(v) === i)) fromScorecard(o.use, (t, row) => add(t, row, o.file), true);
}
// the same monthly tables, worked out from the raw files; used only for months that neither a deck nor a model workbook covers
const fillTables = {};
if (rawTables.Production_KPIs) {
  const info = Object.values(RO.KPI_INFO); const recs = {};
  for (const r of rawTables.Production_KPIs) {
    const i = info.find(x => x[3] === r.KPI); if (!i) continue;
    const k = `${r._y}-${r._m}-${r.KPI}`; const o = recs[k] = recs[k] || { info: i, y: r._y, m: r._m, mtd: {}, ytd: {} };
    o[r.Period === 'MTD' ? 'mtd' : 'ytd'] = { a: r.Actual, b: r.Budget, ly: r['Last Year'] };
  }
  const full = new Set(Object.values(recs).filter(o => o.info[3] === 'Production Cases' && o.mtd.a != null).map(o => o.y * 100 + o.m)); // complete months only
  fromScorecard(Object.values(recs).filter(o => o.mtd.a != null && full.has(o.y * 100 + o.m)), (t, row) => (fillTables[t] = fillTables[t] || []).push(row), false);
}
function fromScorecard(list, add, withKpis) {
  {
    const byM = {}; for (const r of list) (byM[r.y * 100 + r.m] = byM[r.y * 100 + r.m] || []).push(r);
    for (const rs of Object.values(byM)) {
      const y = rs[0].y, m = rs[0].m, mon = M3(m), sk = y * 100 + m, get = n => rs.find(r => r.info[3] === n);
      for (const r of rs) {
        const [sc, dept, sort, pk, unit, dir] = r.info;
        add('Scorecard_Monthly', { MonthNum: m, Month: mon, SortKey: sk, Department: dept, KPI: sc, 'KPI Sort': sort, Actual: r.mtd.a, 'Prior Year': r.mtd.ly ?? null, YTD: r.ytd.a ?? null, Budget: r.mtd.b ?? null, _y: y, _m: m, ...(withKpis ? {} : { _calc: 1 }) });
        if (withKpis) for (const [Period, v] of [['MTD', r.mtd], ['YTD', r.ytd]])
          add('Production_KPIs', { KPI: pk, Unit: unit, Period, Actual: v.a, Budget: v.b, 'Last Year': v.ly, 'Better Direction': dir, Year: y, MonthNum: m, Month: mon, _y: y, _m: m, _raw: 1, _deck: 1 });
      }
      const er = get('Extract Recovery'), pl = get('Process Loss Vol.'), bl = get('Total Bottling Loss');
      if (er && pl && bl && er.mtd.a != null && pl.mtd.a != null && bl.mtd.a != null) {
        const st = [['Brewhouse', 100 - er.mtd.a, er.mtd.b == null ? null : 100 - er.mtd.b], ['Filtration/Cellars', pl.mtd.a, pl.mtd.b], ['Packaging', bl.mtd.a, bl.mtd.b]];
        st.push(['Overall', st.reduce((a, x) => a + x[1], 0), st.every(x => x[2] != null) ? st.reduce((a, x) => a + x[2], 0) : null]);
        for (const [Stage, a, b] of st) add('Fact_ExtractLoss', { Year: y, MonthNum: m, Month: mon, Stage, LossPct: Math.round(a * 10) / 10, TargetPct: b == null ? null : Math.round(b * 10) / 10, _y: y, _m: m });
      }
      const bpd = get('Brews Per Day'); if (bpd) add('Fact_BrewsPerDay_Monthly', { MonthNum: m, Month: mon, SortKey: sk, 'Brews Per Day': bpd.mtd.a, Budget: bpd.mtd.b, 'Total Brews': null, _y: y, _m: m });
      const pc = get('Production Cases'); if (pc) add('Cases_Monthly', { Year: y, MonthNum: m, Month: mon, MonthYear: `${y}-${pad2(m)}-01`, SortKey: sk, 'Cases Produced': pc.mtd.a, 'Budget Cases': pc.mtd.b, 'Attainment %': pc.mtd.b ? Math.round(pc.mtd.a / pc.mtd.b * 1000) / 10 : null, _y: y, _m: m });
    }
  }
}
for (const [t, rows] of Object.entries(rawTables)) (candidates[t] = candidates[t] || []).push({ file: '(raw)', files: [...(rawUsed[t] || [])], time: TOP - 1, rows, raw: true });
for (const [t, rows] of Object.entries(deckTables)) (candidates[t] = candidates[t] || []).push({ file: '(deck)', files: [...(rawUsed[t] || [])], time: TOP, rows, raw: true });
const deckNames = new Set(opsFiles.filter(o => o.kind === 'sctcm').map(o => o.file));
const fillFiles = [...(rawUsed.Production_KPIs || [])].filter(f => !deckNames.has(f));
for (const [t, rows] of Object.entries(fillTables)) { (candidates[t] = candidates[t] || []).push({ file: '(worked out)', files: fillFiles, time: -1, rows, fill: true }); for (const f of fillFiles) (rawUsed[t] = rawUsed[t] || new Set()).add(f); }
const OPS_LABEL = { downtime: 'Line downtime log', bottling: 'Daily bottling summary', sctcm: 'SCTCM report' };
for (const r of [...rawFiles, ...opsFiles]) for (const [t, fs_] of Object.entries(rawUsed)) if (fs_.has(r.file)) { const s = sources.find(x => x.file === r.file); if (s && !s.tables.some(x => x.name === t)) s.tables.push({ name: t, sheet: RAW_LABEL[r.type] || OPS_LABEL[r.kind], rows: 'raw' }); }

// ---------- combine: newest file wins for a year, different years are added together ----------
const tables = {}; const usedFrom = {}; const notes = {};
// a monthly SCTCM deck replaces single months (and single KPIs) of these tables; others are replaced a year at a time
const KEY = {
  Scorecard_Monthly: r => `${r._y}-${r._m}-${r.KPI}`, Fact_ExtractLoss: r => `${r._y}-${r._m}`, Fact_BrewsPerDay_Monthly: r => `${r._y}-${r._m}`,
  Cases_Monthly: r => `${r._y}-${r._m}`, Production_KPIs: r => `${r._y}-${r._m}-${r.KPI}-${r.Period}`,
};
for (const [t, list0] of Object.entries(candidates)) {
  // Production KPIs: when raw or deck rows exist, the model workbook is only used afterwards for what they lack
  const list = t === 'Production_KPIs' && list0.some(c => c.raw) ? list0.filter(c => c.raw) : list0;
  list.sort((a, b) => b.time - a.time || b.file.localeCompare(a.file));
  // a model sheet with no year column counts as the newest year the raw files cover, so the raw rows replace it
  const rawYs = list.filter(c => c.raw).flatMap(c => c.rows.map(r => r._y)).filter(y => y != null);
  const yNull = rawYs.length ? Math.max(...rawYs) : 'none';
  const keyOf = KEY[t] || (r => (r._y == null ? yNull : r._y));
  const taken = new Set(); const rows = []; usedFrom[t] = [];
  for (const c of list) {
    const ys = new Set(c.rows.map(keyOf));
    const fresh = [...ys].filter(y => !taken.has(y));
    if (!fresh.length) continue;
    rows.push(...c.rows.filter(r => fresh.includes(keyOf(r))));
    fresh.forEach(y => taken.add(y));
    usedFrom[t].push(...(c.files || [c.file]));
    if (c.notes && c.notes.length) notes[t] = [...(notes[t] || []), ...c.notes];
  }
  tables[t] = rows;
}
// Production KPIs: the raw files cover most KPIs; plant availability (and any KPI they don't cover) still comes from
// the newest CBG_Production_KPIs workbook, which also gives the budget where the raw files have none
if (rawTables.Production_KPIs || deckTables.Production_KPIs) {
  const model = (candidates.Production_KPIs || []).filter(c => !c.raw).sort((a, b) => b.time - a.time)[0];
  if (model) {
    const rawK = new Set((tables.Production_KPIs || []).map(r => r.KPI));
    const extra = model.rows.filter(r => !rawK.has(r.KPI)).map(r => ({ ...r, _snap: 1, _m: null }));
    for (const r of tables.Production_KPIs || []) if (r._raw && r.Budget == null) { const b = model.rows.find(x => x.KPI === r.KPI && x.Period === r.Period); if (b && b.Budget != null) r.Budget = b.Budget; }
    if (extra.length) { tables.Production_KPIs.push(...extra); usedFrom.Production_KPIs.push(model.file); }
    // last year for raw months from a deck of the same month a year later is not possible; keep what the deck gives
  }
}
// worked-out months have no budget for a few KPIs: use the latest budget the scorecard gave for the same KPI
for (const [t, k, b] of [['Scorecard_Monthly', 'KPI', 'Budget'], ['Fact_ExtractLoss', 'Stage', 'TargetPct'], ['Fact_BrewsPerDay_Monthly', null, 'Budget'], ['Cases_Monthly', null, 'Budget Cases']]) {
  const rows = tables[t] || []; const src = rows.filter(r => r[b] != null).sort((x, y) => (y._y * 100 + y._m) - (x._y * 100 + x._m));
  for (const r of rows) if (r[b] == null && (r._calc || (fillTables[t] || []).includes(r))) { const f = src.find(x => !k || x[k] === r[k]); if (f) r[b] = f[b]; }
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
  if (s.raw) say(`    raw file: ${s.raw}`);
  for (const x of s.tables) say(`    ${x.used ? 'used   ' : 'older  '} ${x.name} (sheet "${x.sheet}", ${x.rows}${typeof x.rows === 'number' ? ' rows' : ''})`);
  if (s.ignored.length) say(`    not needed: ${s.ignored.join(', ')}`);
}
if (unknownProducts.size) say(`\nProducts not in scripts/product-map.json (shown under their own name, category "Other"): ${[...unknownProducts].join(', ')}`);
if (missing.length) say(`\nNot found in any file (those visuals show "No data"): ${missing.join(', ')}`);
fs.writeFileSync(path.join(ROOT, 'data', 'build-report.txt'), log.join('\n') + '\n');
