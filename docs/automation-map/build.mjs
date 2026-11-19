// Builds the automation map page from docs/automations.md.
//   node docs/automation-map/build.mjs [output.html]
// The page draws every diagram as inline SVG at build time (so it reads without JavaScript) and offers
// each one as a PNG: through the artifact viewer's downloads capability when published on claude.ai,
// or a plain download link when the file is opened directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, '..', 'automations.md');
const output = process.argv[2] || path.join(here, 'automation-map.html');

// ---------- Reading docs/automations.md ----------

function sections(md) {
  const out = {};
  let name = '_intro';
  for (const line of md.split('\n')) {
    const m = line.match(/^## (.+)$/);
    if (m) { name = m[1].trim(); out[name] = []; continue; }
    (out[name] ??= []).push(line);
  }
  return out;
}

function table(lines = []) {
  const rows = lines.filter((l) => l.trim().startsWith('|')).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  return rows.filter((r, i) => i !== 1 && !r.every((c) => /^-+$/.test(c))).slice(1);
}

const inline = (s) => s.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');

function parse(md) {
  const s = sections(md);
  const intro = (s._intro || []).filter((l) => l.trim() && !l.startsWith('# ')).map(inline);
  const statuses = Object.fromEntries(table(s.Statuses).map(([key, label, meaning]) => [key, { label, meaning }]));
  const stages = table(s.Stages).map(([name, what]) => ({ name, what }));
  const actors = table(s.Actors).map(([name, who, where]) => ({ name, who: inline(who), where }));
  const systems = table(s.Systems).map(([name, holds, notes]) => ({ name, holds: inline(holds), notes: inline(notes) }));
  const never = (s['Never leaves the app'] || []).filter((l) => l.startsWith('- ')).map((l) => inline(l.slice(2)));
  const questions = table(s['Open questions']).map(([q, change]) => ({ q: inline(q), change }));
  const workflows = [];
  let w = null;
  for (const line of s.Workflows || []) {
    const h = line.match(/^### (W\d+) · (.+)$/);
    if (h) { w = { id: h[1], name: h[2].trim(), steps: [] }; workflows.push(w); continue; }
    if (!w) continue;
    const f = line.match(/^- \*\*(.+?):\*\* (.*)$/);
    if (f) { w[f[1].toLowerCase().replace(/ /g, '_')] = inline(f[2].trim()); continue; }
    const st = line.match(/^\d+\. ([^:]+): (.+)$/);
    if (st) w.steps.push({ who: st[1].trim(), text: inline(st[2].trim()) });
  }
  const kinds = new Map([['CFP app', 'app'], ['n8n', 'n8n']]);
  for (const a of actors) kinds.set(a.name, 'actor');
  for (const x of systems) if (!kinds.has(x.name)) kinds.set(x.name, 'system');
  const problems = [];
  for (const wf of workflows) {
    if (!statuses[wf.status]) problems.push(`${wf.id}: unknown status "${wf.status}"`);
    if (!stages.some((st) => st.name === wf.stage)) problems.push(`${wf.id}: unknown stage "${wf.stage}"`);
    for (const st of wf.steps) if (!kinds.has(st.who)) problems.push(`${wf.id}: "${st.who}" is not in the Actors or Systems table`);
    if (!wf.steps.length) problems.push(`${wf.id}: no steps`);
  }
  if (problems.length) throw new Error(`docs/automations.md:\n  ${problems.join('\n  ')}`);
  return { intro, statuses, stages, actors, systems, never, questions, workflows, kinds };
}

// ---------- Drawing ----------

// Diagrams use one fixed light palette so the PNGs look the same in slides whatever the viewer's theme.
const C = {
  ink: '#020616', muted: '#5B6170', line: '#9AA0AE', stripe: '#F7F6F3', paper: '#FFFFFF', rule: '#E4E2DE',
  orange: '#F28C1B', orangeDark: '#A55F12', geranium: '#DD312A',
  kind: {
    actor: { fill: '#FEF4E8', stroke: '#F28C1B', text: '#020616', label: 'Person' },
    app: { fill: '#020616', stroke: '#020616', text: '#FFFFFF', label: 'CFP app' },
    n8n: { fill: '#EEFCCA', stroke: '#8DB82A', text: '#020616', label: 'n8n' },
    system: { fill: '#F3F4F6', stroke: '#B9BDC7', text: '#020616', label: 'Outside system' },
  },
  status: {
    live: { fill: '#E8F9EE', text: '#10823A' },
    ready: { fill: '#FEF4E8', text: '#A55F12' },
    planned: { fill: '#EEF0F4', text: '#4B5160' },
    question: { fill: '#FEEBF6', text: '#A32570' },
  },
};
const FONT = "Inter, 'Helvetica Neue', Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text, max) {
  const lines = [];
  let cur = '';
  for (const word of String(text).split(/\s+/)) {
    if (!cur) cur = word;
    else if ((cur + ' ' + word).length <= max) cur += ' ' + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

const textLines = (lines, x, y, { size = 13, weight = 400, fill = C.ink, anchor = 'start', lh = 17 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${lines
    .map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join('')}</text>`;

const svgOpen = (w, h, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><rect width="${w}" height="${h}" fill="${C.paper}"/>` +
  `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/></marker></defs>`;

function pill(x, y, label, key) {
  const st = C.status[key];
  const w = label.length * 6.6 + 20;
  return { w, svg: `<rect x="${x}" y="${y}" width="${w}" height="22" rx="11" fill="${st.fill}"/>${textLines([label], x + w / 2, y + 15, { size: 11.5, weight: 600, fill: st.text, anchor: 'middle' })}` };
}

function footer(w, h, note) {
  return `<line x1="24" y1="${h - 34}" x2="${w - 24}" y2="${h - 34}" stroke="${C.rule}"/>` +
    textLines([`FOST Call for Speakers · automation map${note ? ' · ' + note : ''}`], 24, h - 14, { size: 11, fill: C.muted });
}

// One workflow: a swimlane per participant, in the order they first act; one column per step.
function workflowSvg(wf, data, built) {
  const parts = [...new Set(wf.steps.map((s) => s.who))];
  const LABEL = 180, COL = 214, BOX = 188, TOP = 112, FOOT = 46;
  const n = wf.steps.length;
  const W = Math.max(LABEL + n * COL + 24, 720);
  const steps = wf.steps.map((s, i) => ({ ...s, i, lines: wrap(s.text, 25), row: parts.indexOf(s.who) }));
  const rowH = parts.map((_, r) => Math.max(70, ...steps.filter((s) => s.row === r).map((s) => 34 + s.lines.length * 17 + 20)));
  const rowY = [];
  rowH.reduce((y, h, r) => { rowY[r] = y; return y + h; }, TOP);
  const H = TOP + rowH.reduce((a, b) => a + b, 0) + FOOT + 10;
  let svg = svgOpen(W, H, `${wf.id} ${wf.name}`);
  // Heading: id and name, status, trigger.
  svg += textLines([`${wf.id} · ${wf.name}`], 24, 38, { size: 20, weight: 700 });
  const p = pill(24, 52, `${data.statuses[wf.status].label} · change ${wf.change}`, wf.status);
  svg += p.svg;
  svg += textLines(wrap(`Starts when: ${wf.trigger}`, Math.floor((W - p.w - 64) / 6.7)).slice(0, 2), 24 + p.w + 14, 67, { size: 12.5, fill: C.muted, lh: 16 });
  // Lanes.
  parts.forEach((who, r) => {
    const k = C.kind[data.kinds.get(who)];
    if (r % 2 === 0) svg += `<rect x="16" y="${rowY[r]}" width="${W - 32}" height="${rowH[r]}" fill="${C.stripe}"/>`;
    svg += `<rect x="28" y="${rowY[r] + rowH[r] / 2 - 9}" width="12" height="12" rx="3" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.5"/>`;
    svg += textLines(wrap(who, 17), 48, rowY[r] + rowH[r] / 2 + 2, { size: 13, weight: 600 });
  });
  // Step boxes and the arrows between them.
  const box = (s) => {
    const h = 34 + s.lines.length * 17;
    const x = LABEL + s.i * COL + (COL - BOX) / 2;
    const y = rowY[s.row] + (rowH[s.row] - h) / 2;
    return { x, y, h, cx: x + BOX / 2, cy: y + h / 2 };
  };
  steps.forEach((s, i) => {
    if (i === 0) return;
    const a = box(steps[i - 1]), b = box(s);
    const x1 = a.x + BOX, x2 = b.x - 2;
    const mid = (x1 + b.x) / 2;
    const d = Math.abs(a.cy - b.cy) < 1 ? `M${x1},${a.cy} L${x2},${b.cy}` : `M${x1},${a.cy} L${mid},${a.cy} L${mid},${b.cy} L${x2},${b.cy}`;
    svg += `<path d="${d}" fill="none" stroke="${C.line}" stroke-width="1.6" marker-end="url(#arrow)"/>`;
  });
  for (const s of steps) {
    const k = C.kind[data.kinds.get(s.who)];
    const b = box(s);
    svg += `<rect x="${b.x}" y="${b.y}" width="${BOX}" height="${b.h}" rx="9" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.5"/>`;
    svg += `<circle cx="${b.x + 16}" cy="${b.y + 16}" r="10" fill="${k.text === '#FFFFFF' ? C.orange : C.ink}"/>`;
    svg += textLines([String(s.i + 1)], b.x + 16, b.y + 20, { size: 11, weight: 700, fill: k.text === '#FFFFFF' ? C.ink : '#FFFFFF', anchor: 'middle' });
    svg += textLines(s.lines, b.x + 12, b.y + 46, { size: 13, fill: k.text });
  }
  svg += footer(W, H, built);
  return svg + '</svg>';
}

// Where data lives: people use the app; the app talks only to n8n; n8n talks to every outside system.
function dataMapSvg(data, built) {
  const W = 1440;
  const people = data.actors.map((a) => a.name);
  const outside = data.systems.filter((s) => !['CFP app', 'n8n'].includes(s.name));
  const app = data.systems.find((s) => s.name === 'CFP app');
  let svg = '';
  let y = 92;
  // People.
  svg += textLines(['People'], 24, y - 12, { size: 12, weight: 700, fill: C.muted });
  const perRow = 6, pw = (W - 48 - (perRow - 1) * 12) / perRow;
  people.forEach((name, i) => {
    const x = 24 + (i % perRow) * (pw + 12), yy = y + Math.floor(i / perRow) * 50;
    const k = C.kind.actor;
    svg += `<rect x="${x}" y="${yy}" width="${pw}" height="38" rx="19" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.5"/>`;
    svg += textLines([name], x + pw / 2, yy + 24, { size: 13, weight: 600, anchor: 'middle' });
  });
  y += Math.ceil(people.length / perRow) * 50 + 22;
  // App and what never leaves it.
  const appW = 760, appX = 24 + 40, appLines = wrap(`Holds: ${app.holds}`, 92);
  const appH = 64 + appLines.length * 18;
  svg += `<path d="M${appX + appW / 2},${y - 18} L${appX + appW / 2},${y - 2}" stroke="${C.line}" stroke-width="1.6" marker-end="url(#arrow)"/>`;
  svg += textLines(['sign in, submit, review, decide'], appX + appW / 2 + 10, y - 6, { size: 11.5, fill: C.muted });
  svg += `<rect x="${appX}" y="${y + 4}" width="${appW}" height="${appH}" rx="12" fill="${C.kind.app.fill}"/>`;
  svg += textLines(['CFP app: the record'], appX + 22, y + 36, { size: 17, weight: 700, fill: '#FFFFFF' });
  svg += textLines(appLines, appX + 22, y + 60, { size: 13, fill: '#D9DCE3', lh: 18 });
  const nvX = appX + appW + 40, nvW = W - 24 - nvX;
  const nvLines = data.never.flatMap((t) => wrap('• ' + t, 46));
  const nvH = Math.max(appH, 44 + nvLines.length * 17);
  svg += `<rect x="${nvX}" y="${y + 4}" width="${nvW}" height="${nvH}" rx="12" fill="#FFFFFF" stroke="${C.geranium}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  svg += textLines(['Never leaves the app'], nvX + 18, y + 32, { size: 14, weight: 700, fill: C.geranium });
  svg += textLines(nvLines, nvX + 18, y + 54, { size: 12.5, lh: 17 });
  y += Math.max(appH, nvH) + 4;
  // n8n.
  const n8 = data.systems.find((s) => s.name === 'n8n');
  const nX = appX + appW / 2 - 230, nW = 460, nY = y + 54;
  svg += `<path d="M${appX + appW / 2 - 60},${y + 2} L${appX + appW / 2 - 60},${nY - 4}" stroke="${C.line}" stroke-width="1.6" marker-end="url(#arrow)"/>`;
  svg += textLines(['signed events'], appX + appW / 2 - 70, y + 32, { size: 11.5, fill: C.muted, anchor: 'end' });
  svg += `<path d="M${appX + appW / 2 + 60},${nY - 2} L${appX + appW / 2 + 60},${y + 6}" stroke="${C.line}" stroke-width="1.6" marker-end="url(#arrow)"/>`;
  svg += textLines(['API calls back'], appX + appW / 2 + 70, y + 32, { size: 11.5, fill: C.muted });
  svg += `<rect x="${nX}" y="${nY}" width="${nW}" height="58" rx="12" fill="${C.kind.n8n.fill}" stroke="${C.kind.n8n.stroke}" stroke-width="1.5"/>`;
  svg += textLines(['n8n: moves data, keeps nothing'], nX + nW / 2, nY + 25, { size: 15, weight: 700, anchor: 'middle' });
  svg += textLines([n8.notes.split('.')[0]], nX + nW / 2, nY + 44, { size: 12, fill: C.muted, anchor: 'middle' });
  y = nY + 58;
  // Outside systems on a bus below n8n.
  const cols = 4, gap = 14, sw = (W - 48 - (cols - 1) * gap) / cols;
  const busY = y + 30;
  svg += `<path d="M${nX + nW / 2},${y} L${nX + nW / 2},${busY}" stroke="${C.line}" stroke-width="1.6"/>`;
  svg += `<path d="M${24 + sw / 2},${busY} L${24 + (cols - 1) * (sw + gap) + sw / 2},${busY}" stroke="${C.line}" stroke-width="1.6"/>`;
  const cards = outside.map((s) => ({ s, lines: wrap(s.holds, 40), notes: wrap(s.notes, 44) }));
  let rowTop = busY + 22;
  for (let r = 0; r * cols < cards.length; r++) {
    const row = cards.slice(r * cols, r * cols + cols);
    const h = Math.max(...row.map((c) => 50 + c.lines.length * 16 + c.notes.length * 15 + 8));
    row.forEach((c, i) => {
      const x = 24 + i * (sw + gap);
      if (r === 0) svg += `<path d="M${x + sw / 2},${busY} L${x + sw / 2},${rowTop - 2}" stroke="${C.line}" stroke-width="1.6" marker-end="url(#arrow)"/>`;
      const k = C.kind.system;
      svg += `<rect x="${x}" y="${rowTop}" width="${sw}" height="${h}" rx="10" fill="${k.fill}" stroke="${k.stroke}" stroke-width="1.2"/>`;
      svg += textLines([c.s.name], x + 14, rowTop + 24, { size: 14, weight: 700 });
      svg += textLines(c.lines, x + 14, rowTop + 44, { size: 12.5, lh: 16 });
      svg += textLines(c.notes, x + 14, rowTop + 48 + c.lines.length * 16, { size: 11.5, fill: C.muted, lh: 15 });
    });
    rowTop += h + gap;
  }
  if (cards.length > cols) svg += textLines(['n8n connects to each of these'], W - 24, busY - 8, { size: 11.5, fill: C.muted, anchor: 'end' });
  const H = rowTop + 50;
  return svgOpen(W, H, 'Where data lives') + textLines(['Where data lives'], 24, 40, { size: 22, weight: 700 }) +
    textLines(['People use the app. The app talks only to n8n, and n8n to everything else.'], 24, 62, { size: 13, fill: C.muted }) +
    svg + footer(W, H, built) + '</svg>';
}

// Every workflow by stage, coloured by status: the coverage picture.
function journeySvg(data, built) {
  const cols = data.stages.length, CW = 206, GAP = 12, TOP = 120;
  const W = 24 * 2 + cols * CW + (cols - 1) * GAP;
  const byStage = data.stages.map((st) => data.workflows.filter((w) => w.stage === st.name));
  const cardH = (w) => 30 + wrap(w.name, 24).length * 16 + 12;
  const colH = byStage.map((ws) => ws.reduce((h, w) => h + cardH(w) + 10, 0));
  const H = TOP + Math.max(...colH) + 120;
  let svg = svgOpen(W, H, 'Every workflow, stage by stage');
  svg += textLines(['Every workflow, stage by stage'], 24, 40, { size: 22, weight: 700 });
  const counts = Object.keys(data.statuses).map((k) => `${data.workflows.filter((w) => w.status === k).length} ${data.statuses[k].label.toLowerCase()}`);
  svg += textLines([`${data.workflows.length} workflows: ${counts.join(', ')}`], 24, 62, { size: 13, fill: C.muted });
  data.stages.forEach((st, i) => {
    const x = 24 + i * (CW + GAP);
    svg += `<rect x="${x}" y="78" width="${CW}" height="30" rx="6" fill="${C.ink}"/>`;
    svg += textLines([st.name], x + 12, 98, { size: 13, weight: 700, fill: '#FFFFFF' });
    let y = TOP;
    for (const w of byStage[i]) {
      const st2 = C.status[w.status];
      const h = cardH(w);
      svg += `<rect x="${x}" y="${y}" width="${CW}" height="${h}" rx="8" fill="${st2.fill}"/>`;
      svg += `<rect x="${x}" y="${y}" width="5" height="${h}" rx="2" fill="${st2.text}"/>`;
      svg += textLines([`${w.id} · change ${w.change.replace(/\s*\(.*\)\s*/g, '')}`], x + 14, y + 20, { size: 11.5, weight: 700, fill: st2.text });
      svg += textLines(wrap(w.name, 24), x + 14, y + 38, { size: 12.5, lh: 16 });
      y += h + 10;
    }
  });
  // Legend.
  let lx = 24;
  const ly = H - 76;
  for (const [k, v] of Object.entries(data.statuses)) {
    const p = pill(lx, ly, v.label, k);
    svg += p.svg;
    lx += p.w + 12;
  }
  svg += footer(W, H, built);
  return svg + '</svg>';
}

// ---------- The page ----------

function page(data) {
  const built = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const diagrams = [
    { id: 'where-data-lives', file: '00-where-data-lives.png', svg: dataMapSvg(data, built) },
    { id: 'by-stage', file: '00-every-workflow-by-stage.png', svg: journeySvg(data, built) },
    ...data.workflows.map((w) => ({ id: w.id.toLowerCase(), file: `${w.id}-${w.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}.png`, svg: workflowSvg(w, data, built), wf: w })),
  ];
  const fig = (d, caption) => `
    <figure class="diagram" data-file="${esc(d.file)}">
      <div class="scroll"><div class="paper">${d.svg}</div></div>
      <figcaption><span>${caption}</span><button type="button" class="png" data-file="${esc(d.file)}">Download PNG</button></figcaption>
    </figure>`;
  const counts = Object.entries(data.statuses).map(([k, v]) => ({ k, v, n: data.workflows.filter((w) => w.status === k).length }));
  const wfCards = diagrams.filter((d) => d.wf).map((d) => {
    const w = d.wf;
    return `
    <article class="wf" id="${d.id}">
      <header>
        <h3><span class="wid">${w.id}</span> ${esc(w.name)}</h3>
        <p class="meta"><span class="status s-${w.status}">${esc(data.statuses[w.status].label)}</span><span>${esc(w.stage)}</span><span>Change ${esc(w.change)}</span></p>
      </header>
      <dl>
        <div><dt>Starts when</dt><dd>${esc(w.trigger)}</dd></div>
        <div><dt>Back to the app</dt><dd>${esc(w.back_to_the_app)}</dd></div>
        ${w.notes ? `<div><dt>Notes</dt><dd>${esc(w.notes)}</dd></div>` : ''}
      </dl>
      ${fig(d, `${w.id} as a picture`)}
    </article>`;
  }).join('');
  const rows = data.workflows.map((w) => {
    const people = [...new Set(w.steps.map((s) => s.who).filter((n) => data.kinds.get(n) === 'actor'))];
    const systems = [...new Set(w.steps.map((s) => s.who).filter((n) => data.kinds.get(n) === 'system'))];
    return `<tr><td><a href="#${w.id.toLowerCase()}">${w.id}</a></td><td>${esc(w.name)}</td><td>${esc(w.stage)}</td><td>${esc(people.join(', ') || '–')}</td><td>${esc(systems.join(', ') || '–')}</td><td><span class="status s-${w.status}">${esc(data.statuses[w.status].label)}</span></td><td class="num">${esc(w.change)}</td></tr>`;
  }).join('');
  return `<title>FOST Automation Map</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<style>
/* Layout: one reading column for words; diagrams sit on white "paper" (the same in both themes, as in the PNGs). */
:root {
  --bg: #FFFFFF; --fg: #020616; --muted: #5B6170; --rule: #E4E2DE; --surface: #FEF4E8; --accent: #A55F12; --brand: #F28C1B;
  --head-bg: #020616; --head-fg: #FFFFFF; --button-bg: #F28C1B; --button-fg: #020616;
  --live-bg: #E8F9EE; --live-fg: #10823A; --ready-bg: #FEF4E8; --ready-fg: #A55F12; --planned-bg: #EEF0F4; --planned-fg: #4B5160; --question-bg: #FEEBF6; --question-fg: #A32570;
  --font: "Inter", "Helvetica Neue", Arial, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #020616; --fg: #FFFFFF; --muted: #A3A9B8; --rule: #232A40; --surface: #111832; --accent: #F28C1B; --brand: #F28C1B;
  --head-bg: #0A0F20; --head-fg: #FFFFFF; --button-bg: #F28C1B; --button-fg: #020616;
  --live-bg: #0F2A1B; --live-fg: #70D796; --ready-bg: #2A1C0B; --ready-fg: #F7B872; --planned-bg: #1A2034; --planned-fg: #C3C8D4; --question-bg: #2C0F21; --question-fg: #F683C7;
  color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #020616; --fg: #FFFFFF; --muted: #A3A9B8; --rule: #232A40; --surface: #111832; --accent: #F28C1B; --brand: #F28C1B;
  --head-bg: #0A0F20; --head-fg: #FFFFFF; --button-bg: #F28C1B; --button-fg: #020616;
  --live-bg: #0F2A1B; --live-fg: #70D796; --ready-bg: #2A1C0B; --ready-fg: #F7B872; --planned-bg: #1A2034; --planned-fg: #C3C8D4; --question-bg: #2C0F21; --question-fg: #F683C7;
  color-scheme: dark; }
body { background: var(--bg); color: var(--fg); font: 15px/1.55 var(--font); }
.band { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.inner { max-width: 1180px; margin: 0 auto; }
.top { background: var(--head-bg); color: var(--head-fg); padding-block: 36px 30px; border-bottom: 4px solid transparent; border-image: linear-gradient(90deg, #F28C1B, #DD312A) 1; }
.top .kicker { color: #F28C1B; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 12px; margin: 0 0 6px; }
.top h1 { font-size: clamp(28px, 4vw, 40px); line-height: 1.1; margin: 0 0 12px; text-wrap: balance; }
.top p { max-width: 68ch; margin: 0; color: #D9DCE3; }
.counts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.counts span { border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 600; }
nav.toc { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); border-bottom: 1px solid var(--rule); padding-block: 10px; }
nav.toc .inner { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; }
nav.toc a { color: var(--fg); text-decoration: none; font-weight: 600; font-size: 14px; }
nav.toc a:hover, nav.toc a:focus-visible { color: var(--accent); }
nav.toc .spacer { flex: 1; }
main section { padding-block: 34px 8px; }
h2 { font-size: 24px; margin: 0 0 6px; text-wrap: balance; }
h2 + .lead { color: var(--muted); margin: 0 0 18px; max-width: 70ch; }
.rules { margin: 0; padding-left: 20px; max-width: 75ch; }
.rules li + li { margin-top: 4px; }
.diagram { margin: 0 0 8px; }
.scroll { overflow-x: auto; border: 1px solid var(--rule); border-radius: 10px; }
.paper { background: #FFFFFF; width: max-content; }
.paper svg { display: block; max-width: none; }
figcaption { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 8px; color: var(--muted); font-size: 13px; }
button { font: 600 14px var(--font); border-radius: 8px; padding: 7px 14px; cursor: pointer; border: 1.5px solid var(--fg); background: transparent; color: var(--fg); }
button.primary { background: var(--button-bg); color: var(--button-fg); border-color: var(--button-bg); }
button:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
button[disabled] { opacity: .6; cursor: progress; }
.wf { border-top: 1px solid var(--rule); padding-block: 22px 10px; }
.wf h3 { font-size: 19px; margin: 0 0 6px; }
.wid { color: var(--accent); font-variant-numeric: tabular-nums; margin-right: 4px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin: 0 0 10px; color: var(--muted); font-size: 13.5px; }
.status { border-radius: 999px; padding: 2px 10px; font-weight: 600; font-size: 12.5px; white-space: nowrap; }
.s-live { background: var(--live-bg); color: var(--live-fg); } .s-ready { background: var(--ready-bg); color: var(--ready-fg); }
.s-planned { background: var(--planned-bg); color: var(--planned-fg); } .s-question { background: var(--question-bg); color: var(--question-fg); }
dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px 24px; margin: 0 0 14px; }
dl div { min-width: 0; }
dt { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
dd { margin: 2px 0 0; }
.table-wrap { overflow-x: auto; border: 1px solid var(--rule); border-radius: 10px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th { background: var(--head-bg); color: var(--head-fg); text-align: left; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; padding: 10px 12px; white-space: nowrap; }
td { padding: 9px 12px; border-top: 1px solid var(--rule); vertical-align: top; }
td a { color: var(--accent); font-weight: 700; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
.two > div { min-width: 0; }
.note { color: var(--muted); font-size: 13px; }
#toast { position: fixed; right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); background: var(--head-bg); color: var(--head-fg); padding: 10px 16px; border-radius: 8px; font-size: 14px; z-index: 20; }
footer.end { color: var(--muted); font-size: 13px; padding-block: 30px 40px; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>

<header class="top band"><div class="inner">
  <p class="kicker">FOST Call for Speakers</p>
  <h1>Automation map</h1>
  <p>${esc(data.intro[0] || '')} Generated from <code>docs/automations.md</code> on ${built}.</p>
  <div class="counts">${counts.map((c) => `<span class="status s-${c.k}">${c.n} ${esc(c.v.label.toLowerCase())}</span>`).join('')}</div>
</div></header>

<nav class="toc band" aria-label="Sections"><div class="inner">
  <a href="#where">Where data lives</a><a href="#stages">By stage</a><a href="#workflows">Workflows</a><a href="#coverage">Coverage</a><a href="#people">People and systems</a><a href="#questions">Open questions</a>
  <span class="spacer"></span><button type="button" class="primary" id="all">Download all PNGs</button>
</div></nav>

<main class="band"><div class="inner">
  <section id="where">
    <h2>Where data lives</h2>
    <p class="lead">The app is the record. It announces what happens; n8n does the follow-up work in the outside systems and reports back.</p>
    ${fig(diagrams[0], 'The whole system on one page')}
    <ul class="rules">${data.intro.filter((l) => l.startsWith('- ')).map((l) => `<li>${esc(l.slice(2))}</li>`).join('')}</ul>
  </section>

  <section id="stages">
    <h2>Every workflow, stage by stage</h2>
    <p class="lead">Each card is one workflow, coloured by how far it has got. The picture to show when the question is "have we thought of everything?".</p>
    ${fig(diagrams[1], 'All workflows by stage and status')}
  </section>

  <section id="workflows">
    <h2>The workflows</h2>
    <p class="lead">One picture per workflow: a lane for each person or system, and the steps in order from left to right.</p>
    ${wfCards}
  </section>

  <section id="coverage">
    <h2>Coverage</h2>
    <p class="lead">${Object.entries(data.statuses).map(([k, v]) => `<b>${esc(v.label)}</b>: ${esc(v.meaning)}.`).join(' ')}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Workflow</th><th>Stage</th><th>People</th><th>Outside systems</th><th>Status</th><th>Change</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>

  <section id="people">
    <h2>People and systems</h2>
    <div class="two">
      <div><div class="table-wrap"><table><thead><tr><th>Person</th><th>Who</th></tr></thead><tbody>${data.actors.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.who)}</td></tr>`).join('')}</tbody></table></div></div>
      <div><div class="table-wrap"><table><thead><tr><th>System</th><th>Holds</th></tr></thead><tbody>${data.systems.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.holds)}<br><span class="note">${esc(s.notes)}</span></td></tr>`).join('')}</tbody></table></div></div>
    </div>
  </section>

  <section id="questions">
    <h2>Open questions</h2>
    <div class="table-wrap"><table><thead><tr><th>Question</th><th>Change</th></tr></thead><tbody>${data.questions.map((q) => `<tr><td>${esc(q.q)}</td><td class="num">${esc(q.change)}</td></tr>`).join('')}</tbody></table></div>
  </section>

  <footer class="end">Built from <code>docs/automations.md</code> in the fost-cfp repository on ${built}. To change it, edit that file and rebuild.</footer>
</div></main>
<div id="toast" role="status" hidden></div>

<script>
(function () {
  // PNGs at twice the drawn size, for sharp slides.
  var SCALE = 2;
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function pngOf(svg) {
    var w = +svg.getAttribute('width'), h = +svg.getAttribute('height');
    var xml = new XMLSerializer().serializeToString(svg);
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = w * SCALE; c.height = h * SCALE;
        var ctx = c.getContext('2d');
        ctx.scale(SCALE, SCALE); ctx.drawImage(img, 0, 0, w, h);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('no image')); }, 'image/png');
      };
      img.onerror = function () { reject(new Error('could not draw')); };
      img.src = url;
    });
  }
  var downloads = null;
  function save(filename, blob) {
    if (downloads) {
      return downloads.save({ filename: filename, data: blob }).then(function () { toast('Saved ' + filename); }, function (e) {
        if (e && e.code === 'declined') return;
        toast(e && e.code === 'rate_limited' ? 'One moment, then try again.' : 'Could not save ' + filename + '.');
      });
    }
    // Opened as a plain file: an ordinary download link works.
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    return Promise.resolve();
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('button.png');
    if (!b) return;
    var svg = b.closest('figure').querySelector('svg');
    b.disabled = true;
    pngOf(svg).then(function (blob) { return save(b.dataset.file, blob); }).catch(function () { toast('Could not make the PNG.'); }).then(function () { b.disabled = false; });
  });
  document.getElementById('all').addEventListener('click', function () {
    var btn = this;
    if (!window.JSZip) { toast('The ZIP tool did not load. Download the PNGs one at a time.'); return; }
    btn.disabled = true; btn.textContent = 'Preparing…';
    var zip = new JSZip();
    var figs = Array.prototype.slice.call(document.querySelectorAll('figure.diagram'));
    figs.reduce(function (p, f) {
      return p.then(function () { return pngOf(f.querySelector('svg')).then(function (blob) { zip.file(f.dataset.file, blob); }); });
    }, Promise.resolve())
      .then(function () { return zip.generateAsync({ type: 'blob' }); })
      .then(function (blob) { return save('fost-automation-map.zip', blob); })
      .catch(function () { toast('Could not make the ZIP.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Download all PNGs'; });
  });
  if (window.claude && window.claude.use) {
    window.claude.use('downloads').then(function (d) { downloads = d; }, function () {});
  }
})();
</script>
`;
}

const data = parse(fs.readFileSync(source, 'utf8'));
fs.writeFileSync(output, page(data));
console.log(`Wrote ${output}: ${data.workflows.length} workflows, ${data.actors.length} people, ${data.systems.length} systems.`);
