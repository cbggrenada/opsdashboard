// Readers for the raw operations files used by the Supply Chain Rundown and KPI Scorecard sections:
//   GBL_Line_Downtime_<year>.xlsx      -> downtime by category, daily downtime, Pareto, buckets, failure modes
//   Daily_Bottling_Summary_<year>.xlsx -> one row per product run with planned cases
//   CBG - SCTCM report <Month> <year>  -> the "Production YTD KPI's" scorecard slide (a vector picture whose text is read)
const XLSX = require('xlsx');

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = n => String(n).padStart(2, '0');
const txt = v => (v == null ? '' : v instanceof Date ? v.toISOString() : String(v)).replace(/ /g, ' ').trim();
const num = v => { if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; const s = String(v).replace(/[,\s$%]/g, ''); if (!s || s.startsWith('#')) return null; const n = Number(s); return isFinite(n) ? n : null; };
const monthOf = s => { const i = MON.indexOf(String(s || '').trim().toLowerCase().slice(0, 3)); return i < 0 ? null : i + 1; };
const iso = d => (d instanceof Date && !isNaN(d) ? (x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`)(new Date(d.getTime() + 12 * 3600e3)) : null);
const rows = ws => (ws && ws['!ref'] ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) : []);
const yearIn = s => { const m = String(s).match(/20[2-4]\d/); return m ? +m[0] : null; };

/* ---------------- GBL line downtime ---------------- */
// machine detail sheets -> machine names used on the dashboard
const MACHINE = [[/uncaser/i, 'Uncaser'], [/washer/i, 'Washer'], [/ebi/i, 'EBI'], [/filler/i, 'Filler'], [/pasteur/i, 'Pasteuriser'], [/videojet|coder/i, 'Videojet (Coder)'],
  [/label/i, 'Labeller'], [/packer/i, 'Packer'], [/carton/i, 'Carton Errector'], [/conveyor/i, 'Conveyors']];
function isLineDowntime(wb) { return wb.SheetNames.some(n => /^monthly summary loss$/i.test(n.trim())); }
function parseLineDowntime(wb, file, buckets) {
  const year = yearIn(file) || new Date().getFullYear();
  // 1) hours by category for each month ("Monthly summary loss")
  const a = rows(wb.Sheets[wb.SheetNames.find(n => /^monthly summary loss$/i.test(n.trim()))]);
  const h = a.findIndex(r => r && /^month$/i.test(txt(r[0])));
  const cats = (a[h + 1] || []).map(txt);
  const downtime = [];
  for (let r = h + 2; r < a.length; r++) {
    const row = a[r]; if (!row) continue; const m = monthOf(txt(row[0])); if (!m || /ytd/i.test(txt(row[0]))) continue;
    const vals = [];
    cats.forEach((c, j) => { if (j && c && !/total|avg|average|hls|bottled/i.test(c)) { const v = num(row[j]); if (v != null) vals.push({ Category: c, Hours: v }); } });
    if (!vals.some(v => v.Hours > 0)) continue;   // months not yet reached
    for (const v of vals) downtime.push({ Month: MONTH_L[m - 1].slice(0, 3), Category: v.Category, Hours: Math.round(v.Hours * 1e4) / 1e4, _y: year, _m: m });
  }
  // 2) daily downtime minutes from the month sheets (Jan ... Dec, "Sept")
  const days = {};
  for (const n of wb.SheetNames) {
    const m = monthOf(n); if (!m || n.trim().length > 5) continue;
    const s = rows(wb.Sheets[n]);
    const hr = s.findIndex(r => r && r.some(c => /^total minut/i.test(txt(c)))); if (hr < 0) continue;
    const tc = s[hr].findIndex(c => /^total minut/i.test(txt(c)));
    for (let r = hr + 1; r < s.length; r++) {
      const row = s[r]; if (!row) continue; const d = iso(row[1]); const v = num(row[tc]);
      if (!d || v == null || +d.slice(0, 4) !== year || +d.slice(5, 7) !== m) continue;
      days[d] = (days[d] || 0) + v;
    }
  }
  const daily = Object.entries(days).filter(([, v]) => v > 0).sort().map(([d, v]) => ({ Date: d, DowntimeMinutes: v, DowntimeHours: Math.round(v / 60 * 1000) / 1000, Month: MONTH_L[+d.slice(5, 7) - 1].slice(0, 3), MonthNum: +d.slice(5, 7), _y: +d.slice(0, 4), _m: +d.slice(5, 7) }));
  // 3) Pareto of contributors for each month
  const pareto = [];
  const byM = {}; for (const r of downtime) (byM[r._m] = byM[r._m] || []).push(r);
  for (const [m, rs] of Object.entries(byM)) {
    const list = rs.filter(r => r.Hours > 0).sort((x, y) => y.Hours - x.Hours); const tot = list.reduce((s, r) => s + r.Hours, 0); let cum = 0;
    list.forEach((r, i) => { cum += r.Hours; pareto.push({ Rank: i + 1, Contributor: r.Category, Minutes: Math.round(r.Hours * 60), Hours: Math.round(r.Hours * 1000) / 1000, Percent: r.Hours / tot, 'Cumulative %': cum / tot, Month: r.Month, MonthNum: +m, _y: year, _m: +m }); });
  }
  // 4) downtime buckets for plan attainment, and the equipment Pareto (breakdowns, year to date)
  const ytd = [];
  for (const [m, rs] of Object.entries(byM)) {
    const b = {}; for (const r of rs) { const k = buckets[r.Category] || 'Other'; b[k] = (b[k] || 0) + r.Hours; }
    for (const [k, v] of Object.entries(b)) ytd.push({ Date: `${year}-${pad(m)}-01`, Month: MONTH_L[m - 1].slice(0, 3), MonthNum: +m, Line: 'Line 1', Bucket: k, Hours: Math.round(v * 1e4) / 1e4, _y: year, _m: +m });
  }
  const eq = {}; for (const r of downtime) if (buckets[r.Category] === 'Breakdowns') eq[r.Category] = (eq[r.Category] || 0) + r.Hours;
  const eqList = Object.entries(eq).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]); const eqTot = eqList.reduce((s, x) => s + x[1], 0); let ec = 0;
  const equipment = eqList.map(([k, v]) => { ec += v; return { Equipment: k, Hours: Math.round(v * 100) / 100, '% of Total': Math.round(v / eqTot * 1e4) / 100, 'Cumulative %': Math.round(ec / eqTot * 1e4) / 100, _y: year, _m: null }; });
  // 5) failure modes from the machine detail sheets (minutes per failure mode, year to date)
  const failure = [];
  for (const n of wb.SheetNames) {
    if (!/detail|conveyor downtime/i.test(n)) continue;
    const mach = (MACHINE.find(([re]) => re.test(n)) || [])[1]; if (!mach) continue;
    const s = rows(wb.Sheets[n]); const hr = s.findIndex(r => r && /^date$/i.test(txt(r[0]))); if (hr < 0) continue;
    const names = s[hr].map(txt); const tot = {};
    for (let r = hr + 1; r < s.length; r++) {
      const row = s[r]; if (!row) continue; const d = iso(row[0]); if (!d || +d.slice(0, 4) !== year) continue;
      names.forEach((c, j) => { if (j && c && !/^total/i.test(c)) { const v = num(row[j]); if (v) tot[c] = (tot[c] || 0) + v; } });
    }
    Object.entries(tot).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).forEach(([k, v], i) =>
      failure.push({ Machine: mach, 'Failure Mode': k, 'Hours YTD': Math.round(v / 60 * 100) / 100, 'Minutes YTD': v, 'Rank in Machine': i + 1, _y: year, _m: null }));
  }
  return { Fact_Downtime: downtime, Daily_2Week: daily, Pareto_2Week: pareto, YTD_Summary: ytd, Equipment_Pareto: equipment, Failure_Modes: failure };
}

/* ---------------- Daily bottling summary ---------------- */
function isDailyBottling(wb) { return wb.SheetNames.some(n => /^[A-Za-z]+_\d\d\s*$/.test(n)) && wb.SheetNames.some(n => { const s = rows(wb.Sheets[n]).slice(0, 8); return s.some(r => r && r.some(c => /^product bottled/i.test(txt(c)))); }); }
function parseDailyBottling(wb, file, family) {
  const year = yearIn(file) || new Date().getFullYear(); const yy = String(year).slice(2);
  const out = [];
  for (const n of wb.SheetNames) {
    const mm = n.trim().match(/^([A-Za-z]+)_(\d\d)$/); if (!mm || mm[2] !== yy) continue;   // e.g. "August_26"
    const m = monthOf(mm[1]); if (!m) continue;
    const s = rows(wb.Sheets[n]); const hr = s.findIndex(r => r && r.some(c => /^date$/i.test(txt(c))) && r.some(c => /^product bottled/i.test(txt(c)))); if (hr < 0) continue;
    const H = s[hr].map(txt); const col = re => H.findIndex(c => re.test(c));
    const C = { date: col(/^date$/i), prod: col(/^product bottled/i), plan: col(/^planned/i), cases: col(/^cases bottled/i), bhl: col(/^bott\.? ?hls/i), rej: col(/^no\.? ?of rejects/i), cph: col(/^cases per hour/i), fill: col(/^fill time/i) };
    let last = null;
    for (let r = hr + 1; r < s.length; r++) {
      const row = s[r]; if (!row) continue;
      const prod = txt(row[C.prod]);
      if (/budget|^total/i.test(prod)) break;               // end of the month's runs
      let d = iso(row[C.date]);
      // the sheet decides the year: a date typed with the wrong year (9 Apr 2005 on April_26) still belongs to this sheet
      if (d && +d.slice(5, 7) === m && +d.slice(0, 4) !== year) d = year + d.slice(4);
      if (d) last = d;
      if (!prod || /^[\d\s.]+$/.test(prod) || !last) continue; // skip the history block below the month
      const cases = num(row[C.cases]); if (!(cases > 0)) continue;
      if (+last.slice(0, 4) !== year || +last.slice(5, 7) !== m) continue;
      const [fam, cat] = family(prod);
      out.push({ Date: last, Year: year, Month: MONTH_L[m - 1], MonthNum: m, 'Product Family': fam, Category: cat, 'Cases Planned': num(row[C.plan]), 'Cases Bottled': cases,
        'Bottled HLs': num(row[C.bhl]), Rejects: num(row[C.rej]), 'Cases Per Hour': num(row[C.cph]), 'Fill Minutes': num(row[C.fill]), _y: year, _m: m });
    }
  }
  return out;
}

/* ---------------- SCTCM monthly deck ---------------- */
function zipFiles(buf) { const z = XLSX.CFB.read(buf, { type: 'buffer' }); const o = {}; z.FullPaths.forEach((p, i) => { const f = z.FileIndex[i]; if (f && f.content && f.type === 2) o[p.replace(/^Root Entry\//, '')] = Buffer.from(f.content); }); return o; }
// text drawn in an EMF picture (records EMR_EXTTEXTOUTW / A)
function emfText(b) {
  const out = []; let off = 0;
  if (b.length < 8 || b.readUInt32LE(0) !== 1) return out;
  while (off + 8 <= b.length) {
    const t = b.readUInt32LE(off), size = b.readUInt32LE(off + 4); if (size < 8 || off + size > b.length) break;
    if ((t === 0x54 || t === 0x53) && size >= 76) {
      const x = b.readInt32LE(off + 36), y = b.readInt32LE(off + 40), n = b.readUInt32LE(off + 44), so = b.readUInt32LE(off + 48);
      const s = t === 0x54 ? b.slice(off + so, off + so + n * 2).toString('utf16le') : b.slice(off + so, off + so + n).toString('latin1');
      if (s.trim()) out.push({ x, y, s: s.trim() });
    }
    if (t === 0x0E) break; off += size;
  }
  return out;
}
const KPI_INFO = { // deck label -> scorecard name, department, sort, Production KPIs name, unit, better
  waterhlhl: ['Water hl/hl', 'Utilities', 1, 'Water', 'hl/hl', 'Lower'], fuellhl: ['Fuel L/hl', 'Utilities', 2, 'Fuel', 'L/hl', 'Lower'],
  electricitykwhl: ['Electricity Kw/hl', 'Utilities', 3, 'Electricity', 'Kw/hl', 'Lower'], c02kghl: ['C02 Kg/hl', 'Utilities', 4, 'CO2', 'Kg/hl', 'Lower'], co2kghl: ['C02 Kg/hl', 'Utilities', 4, 'CO2', 'Kg/hl', 'Lower'],
  extractrecovery: ['Extract Recovery %', 'Brewing', 5, 'Extract Recovery', '%', 'Higher'], brewsperday: ['Brews Per Day', 'Brewing', 6, 'Brews Per Day', 'brews', 'Higher'],
  processlossvol: ['Process Loss V%', 'Brewing', 7, 'Process Loss Vol.', '%', 'Lower'], oee: ['OEE %', 'Packaging', 8, 'OEE', '%', 'Higher'],
  totalbottlingloss: ['Total Bottling Loss %', 'Packaging', 10, 'Total Bottling Loss', '%', 'Lower'], productioncases: ['Production cases', 'Packaging', 14, 'Production Cases', 'cases', 'Higher'],
  plantavailability: ['Plant Availability', 'Engineering', 15, 'Plant Availability', '%', 'Higher'], maintenancecompliance: ['Maintenance Compliance', 'Engineering', 16, 'Maintenance Compliance', '%', 'Higher'],
  ftr: ['FTR %', 'Quality', 17, 'FTR', '%', 'Higher'],
};
const DEPTS = /^(utilities|brewing|packaging|engineering|quality|department)$/i;
const deckNum = s => { const neg = /^\(.*\)$/.test(s.trim()); const v = num(s.replace(/[()]/g, '')); return v == null ? null : neg ? -v : v; };
function parseSctcm(buf, file) {
  const z = zipFiles(buf); const out = [];
  for (const [p, b] of Object.entries(z)) {
    if (!/^ppt\/media\/.*\.(emf|wmf)$/i.test(p)) continue;
    const t = emfText(b); if (!t.some(x => /month to date/i.test(x.s)) || !t.some(x => /^kpi$/i.test(x.s))) continue;
    // group text into lines by height
    const lines = []; for (const x of t.sort((a, c) => a.y - c.y || a.x - c.x)) { const l = lines.find(l => Math.abs(l.y - x.y) <= 3); if (l) l.items.push(x); else lines.push({ y: x.y, items: [x] }); }
    lines.forEach(l => l.items.sort((a, c) => a.x - c.x));
    const hdr = lines.find(l => l.items.filter(x => /^[A-Za-z]{3}-\d{2}$/.test(x.s)).length >= 2); if (!hdr) continue;
    const mt = hdr.items.find(x => /^[A-Za-z]{3}-\d{2}$/.test(x.s)).s; const m = monthOf(mt), y = 2000 + +mt.slice(-2);
    for (const l of lines) {
      const words = l.items.map(x => x.s).filter(s => !DEPTS.test(s));
      const label = words.find(s => !/^[\d,().%\s-]+$/.test(s)); if (!label) continue;
      const key = label.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^c02/, 'c02');
      const info = KPI_INFO[key] || KPI_INFO[key.replace(/%$/, '')]; if (!info) continue;
      const v = words.slice(words.indexOf(label) + 1).map(deckNum);
      if (v.length < 9) continue;
      out.push({ info, y, m, mtd: { a: v[0], b: v[1], ly: v[2] }, ytd: { a: v[6], b: v[7], ly: v[8] } });
    }
    if (out.length) break;
  }
  return out;
}

module.exports = { isLineDowntime, parseLineDowntime, isDailyBottling, parseDailyBottling, parseSctcm, KPI_INFO };
