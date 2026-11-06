'use strict';
// Mini-bibliothèque de graphiques SVG sans dépendance (barres, jauge, aire, anneau, progression).
// Les couleurs viennent des variables CSS --c-* (thème clair/sombre). Extensible : Charts.myChart = (…) => Node.
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs = {}, ...kids) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
    kids.flat().forEach((c) => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  };
  const PAL = ['var(--c-teal)', 'var(--c-blue)', 'var(--c-amber)', 'var(--c-red)', 'var(--c-violet)', 'var(--c-cyan)'];
  const niceMax = (v) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
  const fmtN = (n) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} k` : String(Math.round(n * 10) / 10));
  const wrapSvg = (svg) => { const d = document.createElement('div'); d.className = 'chart-wrap'; d.append(svg); return d; };
  const empty = (msg) => { const d = document.createElement('div'); d.className = 'chart-empty'; d.textContent = T(msg || 'Aucune donnée.'); return d; };

  // Barres verticales : items [{ label, value, color? }]
  function bars(items, { height = 220, unit = '', color, width = 560 } = {}) {
    const data = (items || []).filter((i) => Number.isFinite(i.value));
    if (!data.length) return empty();
    const W = width, H = height, L = 38, B = 26, T0 = 10, R = 8;
    const max = niceMax(Math.max(...data.map((d) => d.value)));
    const ticks = 4;
    const y = (v) => T0 + (H - T0 - B) * (1 - v / max);
    const bw = Math.min(46, ((W - L - R) / data.length) * 0.55);
    const step = (W - L - R) / data.length;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', preserveAspectRatio: 'xMidYMid meet' });
    for (let i = 0; i <= ticks; i++) {
      const v = (max / ticks) * i;
      svg.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }), s('text', { x: L - 6, y: y(v) + 3, class: 'tick', 'text-anchor': 'end' }, fmtN(v)));
    }
    data.forEach((d, i) => {
      const x = L + step * i + (step - bw) / 2;
      const top = y(d.value);
      svg.append(
        s('rect', { x: x - 4, y: T0, width: bw + 8, height: H - T0 - B, class: 'ghost', rx: 3 }),
        s('rect', { x, y: top, width: bw, height: Math.max(1, H - B - top), rx: 3, fill: d.color || color || PAL[i % PAL.length] }, s('title', {}, `${d.label} : ${fmtN(d.value)}${unit}`)),
        s('text', { x: x + bw / 2, y: H - 8, class: 'tick', 'text-anchor': 'middle' }, String(d.label).length > 11 ? `${String(d.label).slice(0, 10)}…` : d.label));
    });
    return wrapSvg(svg);
  }

  // Barres horizontales (HTML : étiquettes longues lisibles) : items [{ label, value, color?, sub? }]
  function hbars(items, { unit = '', max, color, format } = {}) {
    const data = (items || []).filter((i) => Number.isFinite(i.value));
    if (!data.length) return empty();
    const m = max || Math.max(...data.map((d) => d.value), 1);
    const wrap = document.createElement('div'); wrap.className = 'hbars';
    data.forEach((d, i) => {
      const row = document.createElement('div'); row.className = 'hbar';
      const lab = document.createElement('div'); lab.className = 'hbar-l'; lab.textContent = d.label; lab.title = d.label;
      const track = document.createElement('div'); track.className = 'hbar-t';
      const fill = document.createElement('div'); fill.className = 'hbar-f'; fill.style.width = `${Math.max(2, (d.value / m) * 100)}%`; fill.style.background = d.color || color || PAL[i % PAL.length];
      track.append(fill);
      const val = document.createElement('div'); val.className = 'hbar-v'; val.textContent = format ? format(d.value) : `${fmtN(d.value)}${unit}`;
      row.append(lab, track, val); wrap.append(row);
    });
    return wrap;
  }

  // Jauge circulaire (comme « 95 » au centre)
  function gauge(value, { max = 100, size = 150, color = 'var(--c-violet)', sub = '', label } = {}) {
    const v = Math.max(0, Math.min(max, Number(value) || 0));
    const r = 52, c = 2 * Math.PI * r, frac = v / max;
    const svg = s('svg', { viewBox: '0 0 140 140', class: 'gauge', style: `width:${size}px;height:${size}px`, role: 'img' },
      s('circle', { cx: 70, cy: 70, r, class: 'gauge-bg', fill: 'none', 'stroke-width': 12 }),
      s('circle', { cx: 70, cy: 70, r, fill: 'none', stroke: color, 'stroke-width': 12, 'stroke-linecap': 'round', 'stroke-dasharray': `${c * frac} ${c}`, transform: 'rotate(-90 70 70)' }),
      s('text', { x: 70, y: 76, 'text-anchor': 'middle', class: 'gauge-v', fill: color }, label != null ? label : String(Math.round(v))));
    const w = document.createElement('div'); w.className = 'gauge-wrap'; w.append(svg);
    if (sub) { const p = document.createElement('div'); p.className = 'gauge-sub'; p.textContent = sub; w.append(p); }
    return w;
  }

  // Aire / courbe : points [{ x: étiquette, y: nombre }]
  function area(points, { height = 190, color = 'var(--c-blue)', unit = '', width = 560 } = {}) {
    const pts = (points || []).filter((p) => Number.isFinite(p.y));
    if (!pts.length) return empty();
    const W = width, H = height, L = 38, B = 26, T0 = 10, R = 10;
    const max = niceMax(Math.max(...pts.map((p) => p.y), 1));
    const x = (i) => L + (pts.length === 1 ? (W - L - R) / 2 : ((W - L - R) * i) / (pts.length - 1));
    const y = (v) => T0 + (H - T0 - B) * (1 - v / max);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
    const fill = `${line} L${x(pts.length - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', preserveAspectRatio: 'xMidYMid meet' });
    for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; svg.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }), s('text', { x: L - 6, y: y(v) + 3, class: 'tick', 'text-anchor': 'end' }, fmtN(v))); }
    svg.append(s('path', { d: fill, fill: color, opacity: 0.18 }), s('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    const every = Math.ceil(pts.length / Math.max(3, Math.floor(W / 70)));
    pts.forEach((p, i) => {
      svg.append(s('circle', { cx: x(i), cy: y(p.y), r: 3.2, fill: color, class: 'dot' }, s('title', {}, `${p.x} : ${fmtN(p.y)}${unit}`)));
      if (i % every === 0 || i === pts.length - 1) svg.append(s('text', { x: x(i), y: H - 8, class: 'tick', 'text-anchor': 'middle' }, String(p.x)));
    });
    return wrapSvg(svg);
  }

  // Anneau + légende : items [{ label, value, color? }]
  function donut(items, { size = 150 } = {}) {
    const data = (items || []).filter((i) => i.value > 0);
    const total = data.reduce((n, d) => n + d.value, 0);
    if (!total) return empty();
    const r = 52, c = 2 * Math.PI * r;
    let off = 0;
    const svg = s('svg', { viewBox: '0 0 140 140', class: 'gauge', style: `width:${size}px;height:${size}px`, role: 'img' }, s('circle', { cx: 70, cy: 70, r, fill: 'none', class: 'gauge-bg', 'stroke-width': 18 }));
    data.forEach((d, i) => {
      const len = (d.value / total) * c;
      svg.append(s('circle', { cx: 70, cy: 70, r, fill: 'none', stroke: d.color || PAL[i % PAL.length], 'stroke-width': 18, 'stroke-dasharray': `${len} ${c - len}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 70 70)' }, s('title', {}, `${d.label} : ${d.value}`)));
      off += len;
    });
    svg.append(s('text', { x: 70, y: 76, 'text-anchor': 'middle', class: 'gauge-v' }, fmtN(total)));
    const legend = document.createElement('ul'); legend.className = 'legend';
    data.forEach((d, i) => { const li = document.createElement('li'); const dot = document.createElement('i'); dot.style.background = d.color || PAL[i % PAL.length]; li.append(dot, document.createTextNode(`${d.label} — ${d.value}`)); legend.append(li); });
    const w = document.createElement('div'); w.className = 'donut'; w.append(svg, legend);
    return w;
  }

  // Barre de progression fine sous un chiffre clé
  function progress(pct, color = 'var(--c-teal)') {
    const t = document.createElement('div'); t.className = 'prog';
    const f = document.createElement('div'); f.style.width = `${Math.max(0, Math.min(100, pct))}%`; f.style.background = color;
    t.append(f); return t;
  }

  // Carte indicateur (étiquette + pastille, grand chiffre, variation, barre)
  const STAT_ICON = { 'Tables': 'table', 'Solutions': 'box', 'Étapes de plug-ins': 'plug', 'Flux cloud': 'repeat' };
  function statBadge(label, color) { const b = document.createElement('span'); b.className = 'stat-ic'; if (color) b.style.setProperty('--ic', color); b.innerHTML = typeof xicon === 'function' ? xicon(STAT_ICON[label] || 'bolt') : ''; return b; }
  function stat({ label, tag, value, delta, deltaGood, pct, color, sub }) {
    const card = document.createElement('div'); card.className = 'stat';
    const top = document.createElement('div'); top.className = 'stat-top';
    const l = document.createElement('span'); l.className = 'stat-l'; l.append(statBadge(label, color), document.createTextNode(T(label)));
    top.append(l);
    if (tag) { const b = document.createElement('span'); b.className = 'stat-tag'; b.textContent = T(tag); top.append(b); }
    const mid = document.createElement('div'); mid.className = 'stat-mid';
    const v = document.createElement('div'); v.className = 'stat-v'; v.textContent = value;
    mid.append(v);
    if (delta != null) { const d = document.createElement('div'); d.className = `stat-d ${deltaGood === false ? 'bad' : deltaGood ? 'good' : ''}`; d.textContent = T(delta); mid.append(d); }
    card.append(top, mid, progress(pct == null ? 0 : pct, color));
    if (sub) { const sb = document.createElement('div'); sb.className = 'stat-sub'; sb.textContent = T(sub); card.append(sb); }
    return card;
  }

  // Carte (titre + sous-titre + contenu)
  function card(title, subtitle, ...content) {
    const c = document.createElement('section'); c.className = 'dcard';
    const h = document.createElement('h3'); h.textContent = T(title);
    c.append(h);
    if (subtitle) { const p = document.createElement('div'); p.className = 'dcard-sub'; p.textContent = T(subtitle); c.append(p); }
    content.flat().forEach((n) => { if (n) c.append(n); });
    return c;
  }

  return { statBadge, s, bars, hbars, gauge, area, donut, progress, stat, card, PAL, fmtN };
})();
