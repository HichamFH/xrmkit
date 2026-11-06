'use strict';
// Rendu de la documentation de solutions : HTML autonome (design + diagrammes SVG), Markdown, Word, Excel.
// Fonctions pures : elles ne lisent que le « modèle » produit par soldoc.js.
(function (g) {
  const R = {};
  const E = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fdate = (d) => { try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };

  const LAYERS = [
    { key: 'data', label: 'Données', color: '#0a6fa8', icon: '🗂️', types: [['tables', 'Tables'], ['globalOptionSets', 'Listes de choix globales']] },
    { key: 'logic', label: 'Logique métier', color: '#0e9f8e', icon: '⚙️', types: [['flows', 'Flux cloud'], ['rules', 'Règles métier'], ['workflows', 'Workflows'], ['actions', 'Actions'], ['bpf', 'Processus métier']] },
    { key: 'ext', label: 'Extensions', color: '#d9820a', icon: '🔌', types: [['assemblies', 'Assemblies'], ['steps', 'Étapes de plug-ins'], ['webresources', 'Web resources'], ['customControls', 'Contrôles personnalisés']] },
    { key: 'ui', label: 'Interface', color: '#6b5bd2', icon: '🖥️', types: [['apps', 'Applications'], ['forms', 'Formulaires'], ['views', 'Vues'], ['dashboards', 'Tableaux de bord'], ['charts', 'Graphiques'], ['sitemaps', 'Plans de site'], ['canvasApps', 'Applications canevas']] },
    { key: 'integ', label: 'Intégration & configuration', color: '#3b9c4f', icon: '🔗', types: [['envVars', 'Variables d\'environnement'], ['connRefs', 'Références de connexion'], ['connectors', 'Connecteurs'], ['emailTemplates', 'Modèles d\'e-mail'], ['reports', 'Rapports']] },
    { key: 'sec', label: 'Sécurité', color: '#c8423a', icon: '🔐', types: [['roles', 'Rôles de sécurité'], ['fieldProfiles', 'Profils de sécurité de champ']] },
  ];
  R.LAYERS = LAYERS;
  const count = (m, k) => (k === 'tables' ? m.tables.length : k === 'steps' ? m.plugins.steps.length : k === 'assemblies' ? m.plugins.assemblies.length : (m[k] || []).length);
  R.count = count;

  // ------------------------------------------------------------------ diagrammes SVG
  R.svgLayers = (m) => {
    const W = 980, rowH = 78, gap = 16, left = 190;
    const rows = LAYERS.map((L) => ({ L, items: L.types.map(([k, lab]) => [lab, count(m, k)]).filter(([, n]) => n > 0) })).filter((r) => r.items.length);
    if (!rows.length) return '';
    const H = rows.length * (rowH + gap) + 20;
    let y = 10, out = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Architecture de la solution" class="diagram">`;
    out += '<defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#8a94a8"/></marker></defs>';
    rows.forEach(({ L, items }, i) => {
      out += `<rect x="10" y="${y}" width="${W - 20}" height="${rowH}" rx="14" fill="${L.color}" fill-opacity=".08" stroke="${L.color}" stroke-opacity=".35"/>`;
      out += `<rect x="10" y="${y}" width="${left - 20}" height="${rowH}" rx="14" fill="${L.color}"/>`;
      out += `<text x="${(left - 20) / 2 + 10}" y="${y + rowH / 2 - 4}" text-anchor="middle" font-size="24">${L.icon}</text>`;
      out += `<text x="${(left - 20) / 2 + 10}" y="${y + rowH / 2 + 20}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${E(L.label)}</text>`;
      let x = left + 6;
      const cw = Math.min(150, Math.floor((W - left - 30) / Math.max(items.length, 1)) - 8);
      items.forEach(([lab, n]) => {
        out += `<g><rect x="${x}" y="${y + 12}" width="${cw}" height="${rowH - 24}" rx="10" fill="#fff" stroke="${L.color}" stroke-opacity=".5"/>`
          + `<text x="${x + cw / 2}" y="${y + 38}" text-anchor="middle" font-size="22" font-weight="800" fill="${L.color}">${n}</text>`
          + `<text x="${x + cw / 2}" y="${y + 56}" text-anchor="middle" font-size="10.5" fill="#44506a">${E(lab.length > 22 ? lab.slice(0, 21) + '…' : lab)}</text></g>`;
        x += cw + 8;
      });
      if (i < rows.length - 1) out += `<line x1="${W / 2}" y1="${y + rowH + 1}" x2="${W / 2}" y2="${y + rowH + gap - 1}" stroke="#8a94a8" stroke-width="1.6" marker-end="url(#ah)"/>`;
      y += rowH + gap;
    });
    return out + '</svg>';
  };

  R.erEdges = (m) => {
    const names = new Set(m.tables.map((t) => t.logical));
    const seen = new Set(), edges = [];
    m.tables.forEach((t) => (t.relations || []).forEach((r) => {
      if (r.kind === 'N-N') { if (names.has(r.other) && names.has(t.logical)) { const k = [t.logical, r.other].sort().join('~nn'); if (!seen.has(k)) { seen.add(k); edges.push({ a: t.logical, b: r.other, kind: 'N-N', label: r.attr || '' }); } } return; }
      if (r.kind === 'N-1' && names.has(r.other)) { const k = `${t.logical}>${r.other}>${r.attr}`; if (!seen.has(k)) { seen.add(k); edges.push({ a: t.logical, b: r.other, kind: 'N-1', label: r.attr }); } }
    }));
    return edges.filter((e) => e.a !== e.b || true);
  };

  R.svgER = (m) => {
    const tabs_ = m.tables.slice(0, 40);
    if (tabs_.length < 1) return '';
    const edges = R.erEdges({ tables: tabs_ });
    const n = tabs_.length, bw = 196, bh = 62;
    let pos = {}, W, H;
    if (n <= 9) {
      const R_ = Math.max(150, n * 34);
      W = Math.max(760, 2 * R_ + bw + 60); H = 2 * R_ + bh + 60;
      tabs_.forEach((t, i) => { const a = (2 * Math.PI * i) / n - Math.PI / 2; pos[t.logical] = { x: W / 2 + R_ * Math.cos(a) * 1.25 - bw / 2, y: H / 2 + R_ * Math.sin(a) - bh / 2 }; });
      W = Math.max(W, 2 * R_ * 1.25 + bw + 60);
      tabs_.forEach((t) => { pos[t.logical].x += (W - Math.max(760, 2 * R_ + bw + 60)) / 2; });
    } else {
      const cols = Math.ceil(Math.sqrt(n * 1.6)), gx = 70, gy = 54;
      W = cols * (bw + gx) + gx; H = Math.ceil(n / cols) * (bh + gy) + gy;
      const order = [...tabs_].sort((a, b) => edges.filter((e) => e.a === b.logical || e.b === b.logical).length - edges.filter((e) => e.a === a.logical || e.b === a.logical).length);
      order.forEach((t, i) => { pos[t.logical] = { x: gx + (i % cols) * (bw + gx), y: gy + Math.floor(i / cols) * (bh + gy) }; });
    }
    const c = (id) => ({ x: pos[id].x + bw / 2, y: pos[id].y + bh / 2 });
    const edgePt = (id, to) => { const p = pos[id], a = c(id); const dx = to.x - a.x, dy = to.y - a.y; const sx = dx ? (bw / 2) / Math.abs(dx) : 1e9, sy = dy ? (bh / 2) / Math.abs(dy) : 1e9; const s = Math.min(sx, sy); return { x: a.x + dx * s, y: a.y + dy * s }; };
    let out = `<svg viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagramme entité-relation" class="diagram">`;
    out += '<defs><marker id="many" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="9" markerHeight="9" orient="auto"><path d="M1 6L11 1M1 6L11 11M1 6H11" stroke="#5a6b8c" fill="none" stroke-width="1.4"/></marker><marker id="one" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto"><path d="M9 1V11" stroke="#5a6b8c" stroke-width="1.6"/></marker></defs>';
    edges.forEach((e) => {
      if (!pos[e.a] || !pos[e.b]) return;
      if (e.a === e.b) { const p = pos[e.a]; out += `<path d="M${p.x + bw} ${p.y + 14} h22 v${bh - 28} h-22" fill="none" stroke="#9aa6bd" stroke-width="1.3" marker-start="url(#many)"/>`; return; }
      const A = edgePt(e.a, c(e.b)), B = edgePt(e.b, c(e.a));
      out += `<line x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}" stroke="#9aa6bd" stroke-width="1.3" ${e.kind === 'N-1' ? 'marker-start="url(#many)" marker-end="url(#one)"' : 'marker-start="url(#many)" marker-end="url(#many)" stroke-dasharray="5 3"'}/>`;
    });
    tabs_.forEach((t) => {
      const p = pos[t.logical];
      const col = t.custom ? '#0a6fa8' : '#6b7a99';
      out += `<g><rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${bw}" height="${bh}" rx="10" fill="#fff" stroke="${col}" stroke-width="1.5"/>`
        + `<rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${bw}" height="26" rx="10" fill="${col}"/><rect x="${p.x.toFixed(1)}" y="${(p.y + 14).toFixed(1)}" width="${bw}" height="12" fill="${col}"/>`
        + `<text x="${(p.x + bw / 2).toFixed(1)}" y="${(p.y + 18).toFixed(1)}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#fff">${E((t.label || t.logical).slice(0, 26))}</text>`
        + `<text x="${(p.x + bw / 2).toFixed(1)}" y="${(p.y + 40).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#44506a">${E(t.logical)}</text>`
        + `<text x="${(p.x + bw / 2).toFixed(1)}" y="${(p.y + 54).toFixed(1)}" text-anchor="middle" font-size="10" fill="#8a94a8">${t.columns.filter((x) => x.custom).length} col. perso · ${(t.relations || []).length} rel.</text></g>`;
    });
    return out + '</svg>';
  };

  R.svgUseCases = (actors, cases) => {
    if (!cases.length) return '';
    const rowH = 54, W = 940, top = 40;
    const H = Math.max(cases.length * rowH + top + 20, actors.length * 120 + 60);
    const bx = 250, bw = 640;
    let out = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagramme des cas d'utilisation" class="diagram">`;
    out += `<rect x="${bx}" y="8" width="${bw}" height="${H - 16}" rx="16" fill="#f4f7fc" stroke="#b9c4da" stroke-dasharray="6 4"/><text x="${bx + bw / 2}" y="28" text-anchor="middle" font-size="12" font-weight="700" fill="#44506a">Système</text>`;
    const ay = {};
    actors.forEach((a, i) => { ay[a] = 80 + i * Math.max(110, (H - 140) / Math.max(actors.length, 1)); });
    const cy = (i) => top + 22 + i * rowH;
    cases.forEach((u, i) => { (u.actors || []).forEach((a) => { if (ay[a] != null) out += `<line x1="${110}" y1="${ay[a]}" x2="${bx + 40}" y2="${cy(i)}" stroke="#9aa6bd" stroke-width="1.2"/>`; }); });
    actors.forEach((a) => { const y = ay[a]; out += `<g><circle cx="80" cy="${y - 22}" r="11" fill="#fff" stroke="#0a6fa8" stroke-width="2"/><path d="M80 ${y - 11}V${y + 14}M60 ${y - 2}H100M80 ${y + 14}L64 ${y + 34}M80 ${y + 14}L96 ${y + 34}" stroke="#0a6fa8" stroke-width="2" fill="none"/><text x="80" y="${y + 52}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#1b2a4a">${E(String(a).slice(0, 24))}</text></g>`; });
    cases.forEach((u, i) => { out += `<g><ellipse cx="${bx + 40 + 270}" cy="${cy(i)}" rx="270" ry="21" fill="#fff" stroke="#0e9f8e" stroke-width="1.6"/><text x="${bx + 310}" y="${cy(i) + 4}" text-anchor="middle" font-size="12" fill="#1b2a4a">${E(`${u.id ? u.id + ' · ' : ''}${String(u.titre).slice(0, 62)}`)}</text></g>`; });
    return out + '</svg>';
  };

  // ------------------------------------------------------------------ HTML
  const CSS = `
:root{--navy:#14225e;--blue:#0a6fa8;--teal:#0e9f8e;--bg:#f3f6fb;--card:#fff;--ink:#1b2236;--mut:#5d6b86;--line:#e0e6f0;--chip:#eef2f9}
:root[data-theme=dark]{--bg:#0f1526;--card:#171f36;--ink:#e6ecfa;--mut:#9aa7c4;--line:#27314d;--chip:#1f2945}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font:14px/1.55 "Segoe UI",system-ui,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--blue)}
.cover{background:#14224f;color:#fff;padding:54px 6vw 46px;position:relative;overflow:hidden;border-bottom:4px solid #3ed1bb}
.cover .brand{display:flex;align-items:center;gap:10px;font-weight:700;opacity:.9;margin-bottom:26px}.cover .brand img{width:34px;height:34px}
.cover h1{font-size:clamp(26px,4.2vw,44px);margin:0 0 8px;line-height:1.15;max-width:900px}
.cover .sub{font-size:17px;opacity:.92;max-width:820px}
.meta{display:flex;flex-wrap:wrap;gap:10px 28px;margin-top:26px;font-size:13px}.meta b{display:block;font-size:12px;opacity:.7;font-weight:600}
.layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:28px;max-width:1500px;margin:0 auto;padding:26px 4vw 80px}
nav.toc{position:sticky;top:12px;align-self:start;max-height:calc(100vh - 24px);overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
nav.toc h3{margin:0 0 8px;font-size:13px;font-weight:650;color:var(--mut)}
nav.toc a{display:block;padding:5px 9px;border-radius:8px;text-decoration:none;color:var(--ink);font-size:13px}nav.toc a:hover{background:var(--chip)}
nav.toc a.sub{padding-left:22px;font-size:12px;color:var(--mut)}
nav.toc .tools{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
nav.toc button{border:1px solid var(--line);background:var(--chip);color:var(--ink);border-radius:8px;padding:5px 9px;cursor:pointer;font:inherit;font-size:12px}
section.sec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px 26px;margin-bottom:22px;box-shadow:0 1px 2px rgba(20,34,94,.04)}
section.sec>h2{margin:0 0 4px;font-size:22px;color:var(--navy);display:flex;align-items:center;gap:10px}:root[data-theme=dark] section.sec>h2{color:#cfe0ff}
section.sec>h2 .n{background:#14224f;color:#fff;border-radius:6px;min-width:34px;height:34px;display:inline-grid;place-items:center;font-size:15px;padding:0 8px}
.lead{color:var(--mut);margin:0 0 16px}
h3{margin:22px 0 8px;font-size:16px}h4{margin:14px 0 6px;font-size:14px;color:var(--mut)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0}
.kpi{border-radius:14px;padding:14px 16px;background:var(--chip);border-left:5px solid var(--c,#0a6fa8)}.kpi b{font-size:28px;display:block;color:var(--c,#0a6fa8);line-height:1.1}.kpi span{font-size:12px;color:var(--mut)}
.diagram{width:100%;height:auto;max-height:760px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px;margin:8px 0 4px}
:root[data-theme=dark] .diagram text{fill:#dbe5ff}:root[data-theme=dark] .diagram rect[fill="#fff"],:root[data-theme=dark] .diagram ellipse{fill:#1b2540}
table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0 14px}
th{background:var(--chip);text-align:left;padding:8px 10px;font-size:12px;font-weight:650;color:var(--mut);position:sticky;top:0}
td{padding:7px 10px;border-top:1px solid var(--line);vertical-align:top}tbody tr:nth-child(even) td{background:rgba(120,140,190,.05)}
.scroll{overflow:auto;border:1px solid var(--line);border-radius:12px}.scroll table{margin:0}
.pill{display:inline-block;padding:1px 9px;border-radius:999px;font-size:11.5px;font-weight:600;background:var(--chip);color:var(--mut);white-space:nowrap}
.pill.ok{background:#e1f5e8;color:#17703a}.pill.off{background:#fde9e7;color:#a8322a}.pill.warn{background:#fff1d1;color:#8a5a00}.pill.blue{background:#e1effa;color:#0a5b8c}.pill.violet{background:#ece9fb;color:#4c3fb0}.pill.teal{background:#dcf5f1;color:#0b7a6c}
.small{font-size:12px;color:var(--mut)}code,.mono{font-family:Consolas,monospace;font-size:12px;background:var(--chip);padding:1px 5px;border-radius:5px}
details.tbl{border:1px solid var(--line);border-radius:14px;margin:12px 0;background:var(--card)}
details.tbl>summary{cursor:pointer;padding:12px 16px;display:flex;align-items:center;gap:10px;font-weight:700;list-style:none}
details.tbl>summary::-webkit-details-marker{display:none}details.tbl>summary:before{content:"▸";color:var(--blue);transition:transform .15s}details.tbl[open]>summary:before{transform:rotate(90deg)}
details.tbl>div{padding:0 16px 14px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}
.card{border:1px solid var(--line);border-radius:14px;padding:14px 16px;background:var(--card)}.card h4{margin:0 0 6px;color:var(--ink);font-size:14px}
.uc{border:1px solid var(--line);border-left:5px solid var(--teal);border-radius:12px;padding:12px 16px;margin:12px 0;background:var(--card)}
.uc h4{margin:0 0 4px;color:var(--ink);font-size:15px}.uc ol,.uc ul{margin:4px 0 6px;padding-left:22px}
.alert{border-radius:12px;padding:10px 14px;margin:8px 0;border:1px solid;font-size:13px}
.alert.high{background:#fdecea;border-color:#f2b8b5;color:#8c1d18}.alert.mid{background:#fff6dc;border-color:#ecc96a;color:#5b4300}.alert.low{background:#e8f3fb;border-color:#b8d8ee;color:#0b4a73}
.heat td.h0{color:var(--mut)}.heat td.h1{background:#dff1ec}.heat td.h2{background:#bfe6dc;font-weight:700}.heat td.h3{background:#8fd2c3;font-weight:800;color:#06433a}
footer.foot{text-align:center;color:var(--mut);font-size:12px;padding:20px}
@media (max-width:980px){.layout{grid-template-columns:1fr}nav.toc{position:static;max-height:none}}
@media print{body{background:#fff;color:#000}nav.toc,.noprint{display:none!important}.layout{display:block;padding:0}.cover{padding:30px 24px;-webkit-print-color-adjust:exact;print-color-adjust:exact}section.sec{break-inside:avoid-page;border:0;box-shadow:none;padding:10px 0}details.tbl{break-inside:avoid}details.tbl>div{display:block}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.scroll{overflow:visible}}
`;
  const JS = `
(function(){var r=document.documentElement;try{var t=localStorage.getItem('xk-theme');if(t)r.dataset.theme=t;}catch(e){}
document.addEventListener('click',function(e){var b=e.target.closest('[data-act]');if(!b)return;var a=b.dataset.act;
if(a==='theme'){r.dataset.theme=r.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('xk-theme',r.dataset.theme);}catch(x){}}
if(a==='print')window.print();
if(a==='open'||a==='close'){document.querySelectorAll('details.tbl').forEach(function(d){d.open=a==='open';});}});
document.addEventListener('input',function(e){var i=e.target.closest('input[data-filter]');if(!i)return;var t=document.getElementById(i.dataset.filter);if(!t)return;var q=i.value.toLowerCase();t.querySelectorAll('tbody tr').forEach(function(tr){tr.style.display=tr.textContent.toLowerCase().indexOf(q)>-1?'':'none';});});})();
`;

  const pill = (t, cls = '') => `<span class="pill ${cls}">${E(t)}</span>`;
  const stPill = (s) => (/actif|activ|publi/i.test(s) && !/inactif|désactiv/i.test(s) ? pill(s, 'ok') : /brouillon|suspend|désactiv|inactif|off/i.test(s) ? pill(s, 'off') : pill(s));
  const table = (head, rows, { id = '', filter = false, cls = '' } = {}) => {
    if (!rows.length) return '<p class="small">Aucun élément.</p>';
    const tid = id || `t${Math.random().toString(36).slice(2, 8)}`;
    return `${filter ? `<input class="noprint" data-filter="${tid}" placeholder="Filtrer…" style="padding:6px 10px;border:1px solid var(--line);border-radius:8px;margin:4px 0;background:var(--card);color:var(--ink)">` : ''}<div class="scroll"><table id="${tid}" class="${cls}"><thead><tr>${head.map((h_) => `<th>${E(h_)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c == null ? '' : (typeof c === 'object' && c.html != null ? c.html : E(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  const H = (html) => ({ html });

  R.sectionList = [
    ['summary', 'Synthèse'], ['arch', 'Architecture'], ['data', 'Modèle de données'], ['logic', 'Logique métier'], ['ext', 'Extensions'],
    ['ui', 'Interface'], ['sec', 'Sécurité'], ['integ', 'Intégration & configuration'], ['usecases', 'Cas d\'utilisation'], ['issues', 'Points d\'attention'], ['inventory', 'Inventaire des solutions'],
  ];

  R.html = (m, opts = {}) => {
    const want = (k) => !opts.sections || opts.sections.includes(k);
    const secs = [];
    let nSec = 0;
    const sec = (id, title, lead, body) => { nSec++; secs.push({ id, title, html: `<section class="sec" id="${id}"><h2><span class="n">${nSec}</span>${E(title)}</h2>${lead ? `<p class="lead">${E(lead)}</p>` : ''}${body}</section>` }); };
    const ai = m.ai || {};

    // --- Synthèse
    if (want('summary')) {
      const kp = LAYERS.map((L) => { const n = L.types.reduce((s, [k]) => s + count(m, k), 0); return n ? `<div class="kpi" style="--c:${L.color}"><b>${n}</b><span>${L.icon} ${E(L.label)}</span></div>` : ''; }).join('');
      const sol = m.meta.solutions.map((s) => `<li><b>${E(s.name)}</b> <span class="small">(${E(s.unique)} · v${E(s.version)} · ${s.managed ? 'gérée' : 'non gérée'}${s.publisher ? ' · ' + E(s.publisher) : ''})</span>${s.description ? `<br><span class="small">${E(s.description)}</span>` : ''}</li>`).join('');
      sec('summary', 'Synthèse', 'Vue d\'ensemble du périmètre documenté.', `${ai.resume ? `<div class="card" style="margin-bottom:12px"><h4>🧭 Résumé fonctionnel</h4><p style="margin:0">${E(ai.resume)}</p></div>` : ''}<div class="kpis">${kp}</div><h3>Solutions couvertes</h3><ul>${sol}</ul>${m.warnings && m.warnings.length ? `<div class="alert mid noprint"><b>Collecte incomplète :</b> ${E(m.warnings.join(' · '))}</div>` : ''}`);
    }
    // --- Architecture
    if (want('arch')) {
      let body = `<h3>Vue en couches</h3>${R.svgLayers(m)}`;
      if (m.tables.length) body += `<h3>Diagramme entité-relation</h3><p class="small">Traits pleins : relations N-1 (lookup) ; pointillés : N-N. Bleu : tables personnalisées ; gris : tables standard.</p>${R.svgER(m)}`;
      if (m.tables.length) {
        const cols = [['Flux', (t) => t.auto.flows], ['Règles', (t) => t.auto.rules], ['Workflows', (t) => t.auto.workflows], ['Plug-ins sync', (t) => t.auto.pluginsSync], ['Plug-ins async', (t) => t.auto.pluginsAsync], ['Scripts de formulaire', (t) => t.auto.scripts]];
        const cls = (n) => (n >= 5 ? 'h3' : n >= 3 ? 'h2' : n >= 1 ? 'h1' : 'h0');
        body += `<h3>Matrice automatisations × tables</h3><p class="small">Combien d'éléments s'exécutent sur chaque table.</p><div class="scroll"><table class="heat"><thead><tr><th>Table</th>${cols.map(([c]) => `<th>${E(c)}</th>`).join('')}</tr></thead><tbody>${m.tables.map((t) => `<tr><td><b>${E(t.label || t.logical)}</b> <code>${E(t.logical)}</code></td>${cols.map(([, f]) => { const n = f(t); return `<td class="${cls(n)}">${n || '·'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
      }
      sec('arch', 'Architecture', 'Comment la solution est structurée.', body);
    }
    // --- Données
    if (want('data')) {
      let body = '';
      if (m.tables.length) {
        body += table(['Table', 'Nom logique', 'Type', 'Propriété', 'Colonnes perso.', 'Relations', 'Description'], m.tables.map((t) => [H(`<b>${E(t.label || t.logical)}</b>`), H(`<code>${E(t.logical)}</code>`), H(pill(t.custom ? 'Personnalisée' : 'Standard', t.custom ? 'blue' : '')), t.ownership || '', t.columns.filter((c) => c.custom).length, (t.relations || []).length, t.desc || '']), { filter: true });
        body += '<h3>Détail par table</h3><p class="small noprint"><button data-act="open" style="cursor:pointer">Tout déplier</button> <button data-act="close" style="cursor:pointer">Tout replier</button></p>';
        m.tables.forEach((t) => {
          const cols = t.columns.filter((c) => (opts.allColumns ? true : c.custom || c.required));
          body += `<details class="tbl"><summary>${E(t.label || t.logical)} <code>${E(t.logical)}</code> ${pill(t.custom ? 'perso' : 'standard', t.custom ? 'blue' : '')}${t.audit ? ' ' + pill('audit', 'teal') : ''}${t.activity ? ' ' + pill('activité', 'violet') : ''}<span class="small" style="margin-left:auto">${cols.length} colonne(s) · ${(t.relations || []).length} relation(s)</span></summary><div>`
            + (t.desc ? `<p class="small">${E(t.desc)}</p>` : '')
            + `<h4>Colonnes${opts.allColumns ? '' : ' (personnalisées et obligatoires)'}</h4>`
            + table(['Libellé', 'Nom logique', 'Type', 'Exigence', 'Description'], cols.map((c) => [c.label || '', H(`<code>${E(c.name)}</code>`), c.type, c.required ? H(pill('obligatoire', 'warn')) : '', c.desc || '']))
            + ((t.options || []).length ? `<h4>Listes de choix</h4>${table(['Colonne', 'Valeurs'], t.options.map((o) => [H(`<code>${E(o.col)}</code>`), o.values]))}` : '')
            + ((t.relations || []).length ? `<h4>Relations</h4>${table(['Type', 'Table liée', 'Colonne / relation'], t.relations.map((r) => [H(pill(r.kind, r.kind === 'N-N' ? 'violet' : 'blue')), H(`<code>${E(r.other)}</code>`), r.attr || r.schema || '']))}` : '')
            + ((t.forms || []).length ? `<h4>Formulaires</h4><p>${t.forms.map((f) => pill(`${f.name} · ${f.typeLabel}`)).join(' ')}</p>` : '')
            + ((t.views || []).length ? `<h4>Vues</h4><p>${t.views.map((v) => pill(v.name + (v.isdefault ? ' ★' : ''))).join(' ')}</p>` : '')
            + '</div></details>';
        });
      }
      if (m.globalOptionSets.length) body += `<h3>Listes de choix globales</h3>${table(['Nom', 'Libellé', 'Valeurs'], m.globalOptionSets.map((o) => [H(`<code>${E(o.name)}</code>`), o.label, o.options]), { filter: true })}`;
      sec('data', 'Modèle de données', 'Tables, colonnes, relations et listes de choix de la solution.', body || '<p class="small">Aucune table dans les solutions sélectionnées.</p>');
    }
    // --- Logique
    if (want('logic')) {
      const kinds = [['Flux cloud', 'flows'], ['Règles métier', 'rules'], ['Workflows', 'workflows'], ['Actions', 'actions'], ['Processus métier (BPF)', 'bpf']];
      let body = '';
      kinds.forEach(([lab, k]) => {
        const l = m[k] || [];
        if (!l.length) return;
        body += `<h3>${lab} (${l.length})</h3>` + table(k === 'flows' ? ['Nom', 'Table', 'Déclencheur', 'État', 'Connecteurs', 'Propriétaire', 'Description'] : ['Nom', 'Table', 'Déclencheur', 'État', 'Propriétaire', 'Description'],
          l.map((a) => (k === 'flows' ? [H(`<b>${E(a.name)}</b>`), a.entity || '', a.trigger || '', H(stPill(a.state)), (a.connectors || []).join(', '), a.owner || '', a.desc || a.ai || ''] : [H(`<b>${E(a.name)}</b>`), a.entity || '', a.trigger || '', H(stPill(a.state)), a.owner || '', a.desc || a.ai || ''])), { filter: l.length > 8 });
      });
      sec('logic', 'Logique métier', 'Automatisations : flux, règles, workflows, actions et processus.', body || '<p class="small">Aucune automatisation.</p>');
    }
    // --- Extensions
    if (want('ext')) {
      let body = '';
      const P = m.plugins;
      if (P.assemblies.length) body += `<h3>Assemblies de plug-ins</h3>${table(['Assembly', 'Version', 'Isolation', 'Types / plug-ins'], P.assemblies.map((a) => [H(`<b>${E(a.name)}</b>`), a.version, a.isolation, (a.types || []).join(', ')]))}`;
      if (P.steps.length) body += `<h3>Étapes de plug-ins (${P.steps.length})</h3>${table(['Étape', 'Message', 'Table', 'Étape pipeline', 'Mode', 'État', 'Colonnes filtrées'], P.steps.map((s) => [H(`<b>${E(s.name)}</b>`), s.message, s.entity, s.stageLabel, H(pill(s.modeLabel, s.mode === 0 ? 'warn' : 'teal')), H(stPill(s.state)), s.filter || '—']), { filter: true })}`;
      if (m.webresources.length) body += `<h3>Web resources (${m.webresources.length})</h3>${table(['Nom', 'Libellé', 'Type', 'Description'], m.webresources.map((w) => [H(`<code>${E(w.name)}</code>`), w.label, w.type, w.desc]), { filter: m.webresources.length > 8 })}`;
      if (m.customControls.length) body += `<h3>Contrôles personnalisés</h3>${table(['Nom', 'Description'], m.customControls.map((c) => [c.name, c.desc]))}`;
      sec('ext', 'Extensions', 'Code personnalisé : plug-ins, scripts et contrôles.', body || '<p class="small">Aucune extension.</p>');
    }
    // --- Interface
    if (want('ui')) {
      let body = '';
      if (m.apps.length) body += `<h3>Applications pilotées par modèle</h3>${table(['Application', 'Nom unique', 'État', 'Description'], m.apps.map((a) => [H(`<b>${E(a.name)}</b>`), H(`<code>${E(a.unique)}</code>`), H(stPill(a.state)), a.desc || a.ai || '']))}`;
      if (m.forms.length) body += `<h3>Formulaires (${m.forms.length})</h3>${table(['Formulaire', 'Table', 'Type', 'Bibliothèques JS', 'Handlers'], m.forms.map((f) => [H(`<b>${E(f.name)}</b>`), f.entity, f.typeLabel, (f.libs || []).join(', ') || '—', f.events]), { filter: m.forms.length > 8 })}`;
      if (m.views.length) body += `<h3>Vues (${m.views.length})</h3>${table(['Vue', 'Table', 'Type', 'Par défaut'], m.views.map((v) => [v.name, v.entity, v.typeLabel, v.isdefault ? '★' : '']), { filter: m.views.length > 8 })}`;
      if (m.dashboards.length) body += `<h3>Tableaux de bord</h3>${table(['Nom', 'Description'], m.dashboards.map((d) => [d.name, d.desc]))}`;
      if (m.charts.length) body += `<h3>Graphiques</h3>${table(['Nom', 'Table', 'Description'], m.charts.map((c) => [c.name, c.entity, c.desc]))}`;
      if (m.sitemaps.length) body += `<h3>Plans de site</h3>${table(['Nom'], m.sitemaps.map((s) => [s.name]))}`;
      if (m.canvasApps.length) body += `<h3>Applications canevas</h3>${table(['Nom', 'Nom unique', 'Description'], m.canvasApps.map((c) => [c.name, c.unique, c.desc]))}`;
      sec('ui', 'Interface', 'Applications, formulaires, vues et tableaux de bord.', body || '<p class="small">Aucun élément d\'interface.</p>');
    }
    // --- Sécurité
    if (want('sec')) {
      let body = '';
      if (m.roles.length) body += `<h3>Rôles de sécurité (${m.roles.length})</h3>${table(['Rôle', 'Privilèges', 'Gérée'], m.roles.map((r) => [H(`<b>${E(r.name)}</b>`), r.privCount ?? '—', r.managed ? 'oui' : 'non']))}`;
      if (m.fieldProfiles.length) body += `<h3>Profils de sécurité de champ</h3>${table(['Profil', 'Description'], m.fieldProfiles.map((p) => [p.name, p.desc]))}`;
      sec('sec', 'Sécurité', 'Rôles et profils qui contrôlent l\'accès.', body || '<p class="small">Aucun élément de sécurité dans le périmètre.</p>');
    }
    // --- Intégration
    if (want('integ')) {
      let body = '';
      if (m.envVars.length) body += `<h3>Variables d'environnement</h3>${table(['Nom', 'Libellé', 'Type', 'Valeur par défaut', 'Valeur actuelle'], m.envVars.map((v) => [H(`<code>${E(v.schema)}</code>`), v.label, v.type, v.default ?? '—', v.current == null ? H(pill('non définie', 'warn')) : v.current]))}`;
      if (m.connRefs.length) body += `<h3>Références de connexion</h3>${table(['Nom logique', 'Libellé', 'Connecteur', 'Connexion'], m.connRefs.map((c) => [H(`<code>${E(c.name)}</code>`), c.label, c.connector, c.connected ? H(pill('liée', 'ok')) : H(pill('non liée', 'warn'))]))}`;
      if (m.connectors.length) body += `<h3>Connecteurs personnalisés</h3>${table(['Nom', 'Description'], m.connectors.map((c) => [c.name, c.desc]))}`;
      if (m.emailTemplates.length) body += `<h3>Modèles d'e-mail</h3>${table(['Titre', 'Table'], m.emailTemplates.map((t) => [t.name, t.entity]))}`;
      if (m.reports.length) body += `<h3>Rapports</h3>${table(['Nom', 'Description'], m.reports.map((t) => [t.name, t.desc]))}`;
      sec('integ', 'Intégration & configuration', 'Éléments à renseigner à chaque déploiement.', body || '<p class="small">Aucun élément d\'intégration.</p>');
    }
    // --- Cas d'utilisation
    if (want('usecases')) {
      const ucs = (ai.cas_usage && ai.cas_usage.length ? ai.cas_usage : m.uc) || [];
      let body = '';
      if (ucs.length) {
        const actors = [...new Set(ucs.flatMap((u) => u.actors || (u.acteur ? [u.acteur] : [])))].slice(0, 6);
        body += `<h3>Diagramme</h3>${R.svgUseCases(actors, ucs.slice(0, 12).map((u, i) => ({ id: u.id || `UC${i + 1}`, titre: u.titre, actors: u.actors || (u.acteur ? [u.acteur] : []) })))}`;
        ucs.forEach((u, i) => {
          body += `<div class="uc"><h4>${E(u.id || `UC${i + 1}`)} — ${E(u.titre)}</h4><div class="small">${u.acteur ? `Acteur : <b>${E(u.acteur)}</b>` : ''}${u.declencheur ? ` · Déclencheur : ${E(u.declencheur)}` : ''}${m.ai && ai.cas_usage && ai.cas_usage.length ? ' · ' + pill('généré par IA', 'violet') : ' · ' + pill('déduit de la configuration', 'teal')}</div>`
            + (u.objectif ? `<p style="margin:6px 0">${E(u.objectif)}</p>` : '')
            + ((u.prerequis || []).length ? `<h4>Prérequis</h4><ul>${u.prerequis.map((p) => `<li>${E(p)}</li>`).join('')}</ul>` : '')
            + ((u.scenario || u.etapes || []).length ? `<h4>Scénario</h4><ol>${(u.scenario || u.etapes).map((p) => `<li>${E(p)}</li>`).join('')}</ol>` : '')
            + (u.resultat ? `<p><b>Résultat attendu :</b> ${E(u.resultat)}</p>` : '')
            + ((u.composants || []).length ? `<p class="small">Composants : ${u.composants.map((c) => pill(c)).join(' ')}</p>` : '') + '</div>';
        });
      } else body = '<p class="small">Aucun cas d\'utilisation détecté.</p>';
      if ((ai.acteurs || []).length) body += `<h3>Acteurs</h3>${table(['Acteur', 'Rôle'], ai.acteurs.map((a) => [a.nom, a.role]))}`;
      sec('usecases', 'Cas d\'utilisation', ai.cas_usage && ai.cas_usage.length ? 'Scénarios fonctionnels rédigés par l\'IA à partir de la configuration (à valider avec le métier).' : 'Scénarios déduits automatiquement des automatisations et des plug-ins.', body);
    }
    // --- Points d'attention
    if (want('issues')) {
      const list = [...(m.issues || []), ...((ai.risques || []).map((t) => ({ level: 'mid', text: t, ai: true }))) ];
      let body = list.length ? list.map((i) => `<div class="alert ${i.level}">${i.level === 'high' ? '🔴' : i.level === 'mid' ? '🟠' : 'ℹ️'} ${E(i.text)}${i.ai ? ' ' + pill('IA', 'violet') : ''}</div>`).join('') : '<p class="small">Aucun point d\'attention détecté.</p>';
      if ((ai.recommandations || []).length) body += `<h3>Recommandations</h3><ul>${ai.recommandations.map((r) => `<li>${E(r)}</li>`).join('')}</ul>`;
      sec('issues', 'Points d\'attention', 'Contrôles automatiques de qualité et de déploiement.', body);
    }
    // --- Inventaire
    if (want('inventory')) {
      sec('inventory', 'Inventaire des solutions', 'Métadonnées des solutions documentées.', table(['Solution', 'Nom unique', 'Version', 'Gérée', 'Éditeur', 'Installée', 'Modifiée'], m.meta.solutions.map((s) => [H(`<b>${E(s.name)}</b>`), H(`<code>${E(s.unique)}</code>`), s.version, s.managed ? 'oui' : 'non', `${s.publisher || ''}${s.prefix ? ' (' + s.prefix + '_)' : ''}`, s.installedon ? fdate(s.installedon) : '', s.modifiedon ? fdate(s.modifiedon) : ''])));
    }

    const toc = secs.map((s) => `<a href="#${s.id}">${E(s.title)}</a>`).join('');
    const title = m.meta.title;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(title)}</title><style>${CSS}</style></head><body>
<header class="cover"><div class="brand">${opts.logo ? `<img alt="" src="${opts.logo}">` : ''}<span>Xrmkit · Documentation de solution</span></div>
<h1>${E(title)}</h1><div class="sub">${E(m.meta.solutions.map((s) => s.name).join(' · '))}</div>
<div class="meta">${m.meta.client ? `<div><b>Client</b>${E(m.meta.client)}</div>` : ''}<div><b>Environnement</b>${E(m.meta.org || '')}</div><div><b>Généré le</b>${E(fdate(m.meta.date))}</div>${m.meta.author ? `<div><b>Auteur</b>${E(m.meta.author)}</div>` : ''}<div><b>Composants</b>${m.total}</div></div></header>
<div class="layout"><nav class="toc"><h3>Sommaire</h3>${toc}<div class="tools noprint"><button data-act="print">🖨 PDF / Imprimer</button><button data-act="theme">🌓 Thème</button></div></nav>
<main>${secs.map((s) => s.html).join('')}</main></div>
<footer class="foot">Document généré par <b>Xrmkit</b> — développé par HichamFH. Les cas d'utilisation et descriptions sont à valider avec les équipes métier.</footer>
<script>${JS}</script></body></html>`;
  };

  // ------------------------------------------------------------------ Markdown
  R.markdown = (m, opts = {}) => {
    const want = (k) => !opts.sections || opts.sections.includes(k);
    const ai = m.ai || {};
    const t = (head, rows) => (rows.length ? `| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`).join('\n')}\n` : '_Aucun élément._\n');
    let md = `# ${m.meta.title}\n\n> ${m.meta.solutions.map((s) => `**${s.name}** v${s.version}`).join(' · ')}  \n> Environnement : ${m.meta.org || ''} · Généré le ${fdate(m.meta.date)} avec Xrmkit${m.meta.author ? ' · ' + m.meta.author : ''}\n\n`;
    if (want('summary')) {
      md += `## Synthèse\n\n${ai.resume ? ai.resume + '\n\n' : ''}${t(['Couche', 'Composants'], LAYERS.map((L) => [`${L.icon} ${L.label}`, L.types.map(([k, lab]) => [lab, count(m, k)]).filter(([, n]) => n).map(([lab, n]) => `${n} ${lab.toLowerCase()}`).join(', ') || '—']))}\n`;
    }
    if (want('arch')) {
      md += '## Architecture\n\n```mermaid\nflowchart TB\n';
      LAYERS.forEach((L) => { const items = L.types.map(([k, lab]) => [lab, count(m, k)]).filter(([, n]) => n); if (items.length) md += `  ${L.key}["${L.icon} ${L.label}<br/>${items.map(([lab, n]) => `${n} ${lab}`).join('<br/>')}"]\n`; });
      md += '  ui --> logic\n  logic --> data\n  ext --> data\n  logic --> integ\n  sec -.-> data\n```\n\n';
      const edges = R.erEdges(m);
      if (edges.length) { md += '```mermaid\nerDiagram\n'; edges.forEach((e) => { md += `  ${e.b} ||--o{ ${e.a} : "${(e.label || 'lie').replace(/"/g, '')}"\n`; }); md += '```\n\n'; }
    }
    if (want('data')) {
      md += '## Modèle de données\n\n' + t(['Table', 'Nom logique', 'Type', 'Colonnes perso.', 'Relations'], m.tables.map((x) => [x.label, x.logical, x.custom ? 'Personnalisée' : 'Standard', x.columns.filter((c) => c.custom).length, (x.relations || []).length])) + '\n';
      m.tables.forEach((x) => { const cols = x.columns.filter((c) => opts.allColumns || c.custom || c.required); md += `### ${x.label || x.logical} (\`${x.logical}\`)\n\n${x.desc ? x.desc + '\n\n' : ''}${t(['Libellé', 'Nom logique', 'Type', 'Exigence', 'Description'], cols.map((c) => [c.label, `\`${c.name}\``, c.type, c.required ? 'obligatoire' : '', c.desc]))}\n`; });
      if (m.globalOptionSets.length) md += '### Listes de choix globales\n\n' + t(['Nom', 'Libellé', 'Valeurs'], m.globalOptionSets.map((o) => [o.name, o.label, o.options])) + '\n';
    }
    if (want('logic')) {
      md += '## Logique métier\n\n';
      [['Flux cloud', 'flows'], ['Règles métier', 'rules'], ['Workflows', 'workflows'], ['Actions', 'actions'], ['Processus métier', 'bpf']].forEach(([lab, k]) => { if ((m[k] || []).length) md += `### ${lab}\n\n${t(['Nom', 'Table', 'Déclencheur', 'État', 'Description'], m[k].map((a) => [a.name, a.entity, a.trigger, a.state, a.desc || a.ai]))}\n`; });
    }
    if (want('ext')) {
      md += '## Extensions\n\n';
      if (m.plugins.assemblies.length) md += '### Assemblies\n\n' + t(['Assembly', 'Version', 'Isolation', 'Types'], m.plugins.assemblies.map((a) => [a.name, a.version, a.isolation, (a.types || []).join(', ')])) + '\n';
      if (m.plugins.steps.length) md += '### Étapes de plug-ins\n\n' + t(['Étape', 'Message', 'Table', 'Pipeline', 'Mode', 'État', 'Filtre'], m.plugins.steps.map((s) => [s.name, s.message, s.entity, s.stageLabel, s.modeLabel, s.state, s.filter])) + '\n';
      if (m.webresources.length) md += '### Web resources\n\n' + t(['Nom', 'Type', 'Description'], m.webresources.map((w) => [w.name, w.type, w.desc])) + '\n';
    }
    if (want('ui')) {
      md += '## Interface\n\n';
      if (m.apps.length) md += '### Applications\n\n' + t(['Application', 'Nom unique', 'État', 'Description'], m.apps.map((a) => [a.name, a.unique, a.state, a.desc])) + '\n';
      if (m.forms.length) md += '### Formulaires\n\n' + t(['Formulaire', 'Table', 'Type', 'Bibliothèques JS'], m.forms.map((f) => [f.name, f.entity, f.typeLabel, (f.libs || []).join(', ')])) + '\n';
      if (m.views.length) md += '### Vues\n\n' + t(['Vue', 'Table', 'Type'], m.views.map((v) => [v.name, v.entity, v.typeLabel])) + '\n';
    }
    if (want('sec') && (m.roles.length || m.fieldProfiles.length)) md += '## Sécurité\n\n' + t(['Rôle', 'Privilèges'], m.roles.map((r) => [r.name, r.privCount])) + '\n' + (m.fieldProfiles.length ? t(['Profil de champ', 'Description'], m.fieldProfiles.map((p) => [p.name, p.desc])) + '\n' : '');
    if (want('integ')) {
      md += '## Intégration & configuration\n\n';
      if (m.envVars.length) md += '### Variables d\'environnement\n\n' + t(['Nom', 'Type', 'Défaut', 'Actuelle'], m.envVars.map((v) => [v.schema, v.type, v.default, v.current == null ? '(non définie)' : v.current])) + '\n';
      if (m.connRefs.length) md += '### Références de connexion\n\n' + t(['Nom', 'Connecteur', 'Liée'], m.connRefs.map((c) => [c.name, c.connector, c.connected ? 'oui' : 'non'])) + '\n';
    }
    if (want('usecases')) {
      const ucs = (ai.cas_usage && ai.cas_usage.length ? ai.cas_usage : m.uc) || [];
      md += '## Cas d\'utilisation\n\n';
      ucs.forEach((u, i) => { md += `### ${u.id || 'UC' + (i + 1)} — ${u.titre}\n\n${u.acteur ? `**Acteur :** ${u.acteur}  \n` : ''}${u.declencheur ? `**Déclencheur :** ${u.declencheur}  \n` : ''}${u.objectif ? `\n${u.objectif}\n` : ''}${(u.prerequis || []).length ? '\n**Prérequis**\n' + u.prerequis.map((p) => `- ${p}`).join('\n') + '\n' : ''}${(u.scenario || u.etapes || []).length ? '\n**Scénario**\n' + (u.scenario || u.etapes).map((p, j) => `${j + 1}. ${p}`).join('\n') + '\n' : ''}${u.resultat ? `\n**Résultat attendu :** ${u.resultat}\n` : ''}\n`; });
    }
    if (want('issues') && ((m.issues || []).length || (ai.risques || []).length)) md += '## Points d\'attention\n\n' + [...(m.issues || []).map((i) => `- ${i.level === 'high' ? '🔴' : i.level === 'mid' ? '🟠' : 'ℹ️'} ${i.text}`), ...(ai.risques || []).map((r) => `- 🟠 ${r} _(IA)_`)].join('\n') + '\n\n' + ((ai.recommandations || []).length ? '### Recommandations\n' + ai.recommandations.map((r) => `- ${r}`).join('\n') + '\n' : '');
    return md;
  };

  // ------------------------------------------------------------------ Word / Excel
  R.docxBlocks = (m, opts = {}) => {
    const want = (k) => !opts.sections || opts.sections.includes(k);
    const ai = m.ai || {};
    const B = [{ t: 'title', text: m.meta.title }, { t: 'p', text: m.meta.solutions.map((s) => `${s.name} (v${s.version})`).join(' · ') }, { t: 'p', text: `Environnement : ${m.meta.org || ''} — généré le ${fdate(m.meta.date)} avec Xrmkit${m.meta.author ? ' — ' + m.meta.author : ''}` }];
    const T = (head, rows) => { if (rows.length) B.push({ t: 'table', header: head, rows: rows.map((r) => r.map((c) => String(c ?? ''))) }); };
    if (want('summary')) { B.push({ t: 'h1', text: 'Synthèse' }); if (ai.resume) B.push({ t: 'p', text: ai.resume }); T(['Couche', 'Composants'], LAYERS.map((L) => [L.label, L.types.map(([k, lab]) => [lab, count(m, k)]).filter(([, n]) => n).map(([lab, n]) => `${n} ${lab.toLowerCase()}`).join(', ')]).filter((r) => r[1])); }
    if (want('data')) {
      B.push({ t: 'h1', text: 'Modèle de données' });
      T(['Table', 'Nom logique', 'Type', 'Colonnes perso.', 'Relations'], m.tables.map((x) => [x.label, x.logical, x.custom ? 'Personnalisée' : 'Standard', x.columns.filter((c) => c.custom).length, (x.relations || []).length]));
      m.tables.forEach((x) => { const cols = x.columns.filter((c) => opts.allColumns || c.custom || c.required); if (!cols.length) return; B.push({ t: 'h2', text: `${x.label || x.logical} (${x.logical})` }); if (x.desc) B.push({ t: 'p', text: x.desc }); T(['Libellé', 'Nom logique', 'Type', 'Exigence', 'Description'], cols.map((c) => [c.label, c.name, c.type, c.required ? 'obligatoire' : '', c.desc])); });
    }
    if (want('logic')) { B.push({ t: 'h1', text: 'Logique métier' }); [['Flux cloud', 'flows'], ['Règles métier', 'rules'], ['Workflows', 'workflows'], ['Actions', 'actions'], ['Processus métier', 'bpf']].forEach(([lab, k]) => { if ((m[k] || []).length) { B.push({ t: 'h2', text: lab }); T(['Nom', 'Table', 'Déclencheur', 'État', 'Description'], m[k].map((a) => [a.name, a.entity, a.trigger, a.state, a.desc || a.ai])); } }); }
    if (want('ext')) { B.push({ t: 'h1', text: 'Extensions' }); T(['Assembly', 'Version', 'Isolation', 'Types'], m.plugins.assemblies.map((a) => [a.name, a.version, a.isolation, (a.types || []).join(', ')])); T(['Étape', 'Message', 'Table', 'Pipeline', 'Mode', 'État', 'Filtre'], m.plugins.steps.map((s) => [s.name, s.message, s.entity, s.stageLabel, s.modeLabel, s.state, s.filter])); T(['Web resource', 'Type', 'Description'], m.webresources.map((w) => [w.name, w.type, w.desc])); }
    if (want('ui')) { B.push({ t: 'h1', text: 'Interface' }); T(['Application', 'Nom unique', 'État'], m.apps.map((a) => [a.name, a.unique, a.state])); T(['Formulaire', 'Table', 'Type', 'Bibliothèques'], m.forms.map((f) => [f.name, f.entity, f.typeLabel, (f.libs || []).join(', ')])); T(['Vue', 'Table', 'Type'], m.views.map((v) => [v.name, v.entity, v.typeLabel])); }
    if (want('sec')) { B.push({ t: 'h1', text: 'Sécurité' }); T(['Rôle', 'Privilèges'], m.roles.map((r) => [r.name, r.privCount])); T(['Profil de champ', 'Description'], m.fieldProfiles.map((p) => [p.name, p.desc])); }
    if (want('integ')) { B.push({ t: 'h1', text: 'Intégration & configuration' }); T(['Variable', 'Type', 'Défaut', 'Actuelle'], m.envVars.map((v) => [v.schema, v.type, v.default, v.current == null ? '(non définie)' : v.current])); T(['Référence de connexion', 'Connecteur', 'Liée'], m.connRefs.map((c) => [c.name, c.connector, c.connected ? 'oui' : 'non'])); }
    if (want('usecases')) {
      B.push({ t: 'h1', text: 'Cas d\'utilisation' });
      ((ai.cas_usage && ai.cas_usage.length ? ai.cas_usage : m.uc) || []).forEach((u, i) => {
        B.push({ t: 'h2', text: `${u.id || 'UC' + (i + 1)} — ${u.titre}` });
        B.push({ t: 'p', text: [u.acteur && `Acteur : ${u.acteur}`, u.declencheur && `Déclencheur : ${u.declencheur}`, u.objectif].filter(Boolean).join(' — ') });
        if ((u.prerequis || []).length) B.push({ t: 'p', text: 'Prérequis : ' + u.prerequis.join(' ; ') });
        (u.scenario || u.etapes || []).forEach((s, j) => B.push({ t: 'p', text: `${j + 1}. ${s}` }));
        if (u.resultat) B.push({ t: 'p', text: 'Résultat attendu : ' + u.resultat });
      });
    }
    if (want('issues') && ((m.issues || []).length || (ai.risques || []).length)) { B.push({ t: 'h1', text: 'Points d\'attention' }); [...(m.issues || []).map((i) => i.text), ...(ai.risques || [])].forEach((x) => B.push({ t: 'p', text: '• ' + x })); (ai.recommandations || []).forEach((x) => B.push({ t: 'p', text: '→ ' + x })); }
    return B;
  };

  R.xlsxSheets = (m) => {
    const S = [];
    const add = (name, head, rows) => { if (rows.length) S.push({ name: name.slice(0, 31), rows: [head, ...rows] }); };
    add('Solutions', ['Nom', 'Nom unique', 'Version', 'Gérée', 'Éditeur'], m.meta.solutions.map((s) => [s.name, s.unique, s.version, s.managed ? 'oui' : 'non', s.publisher]));
    add('Tables', ['Libellé', 'Nom logique', 'Type', 'Propriété', 'Colonnes perso.', 'Relations', 'Description'], m.tables.map((t) => [t.label, t.logical, t.custom ? 'Personnalisée' : 'Standard', t.ownership, t.columns.filter((c) => c.custom).length, (t.relations || []).length, t.desc]));
    add('Colonnes', ['Table', 'Libellé', 'Nom logique', 'Type', 'Exigence', 'Personnalisée', 'Description'], m.tables.flatMap((t) => t.columns.map((c) => [t.logical, c.label, c.name, c.type, c.required ? 'obligatoire' : '', c.custom ? 'oui' : 'non', c.desc])));
    add('Relations', ['Table', 'Type', 'Table liée', 'Colonne'], m.tables.flatMap((t) => (t.relations || []).map((r) => [t.logical, r.kind, r.other, r.attr || r.schema])));
    add('Automatisations', ['Nom', 'Type', 'Table', 'Déclencheur', 'État', 'Propriétaire', 'Description'], [...m.flows, ...m.rules, ...m.workflows, ...m.actions, ...m.bpf].map((a) => [a.name, a.kind, a.entity, a.trigger, a.state, a.owner, a.desc || a.ai]));
    add('Plug-ins', ['Étape', 'Message', 'Table', 'Pipeline', 'Mode', 'État', 'Filtre'], m.plugins.steps.map((s) => [s.name, s.message, s.entity, s.stageLabel, s.modeLabel, s.state, s.filter]));
    add('Web resources', ['Nom', 'Libellé', 'Type', 'Description'], m.webresources.map((w) => [w.name, w.label, w.type, w.desc]));
    add('Formulaires', ['Nom', 'Table', 'Type', 'Bibliothèques', 'Handlers'], m.forms.map((f) => [f.name, f.entity, f.typeLabel, (f.libs || []).join(', '), f.events]));
    add('Vues', ['Nom', 'Table', 'Type', 'Par défaut'], m.views.map((v) => [v.name, v.entity, v.typeLabel, v.isdefault ? 'oui' : '']));
    add('Applications', ['Nom', 'Nom unique', 'État', 'Description'], m.apps.map((a) => [a.name, a.unique, a.state, a.desc]));
    add('Sécurité', ['Rôle', 'Privilèges', 'Gérée'], m.roles.map((r) => [r.name, r.privCount, r.managed ? 'oui' : 'non']));
    add('Configuration', ['Type', 'Nom', 'Libellé', 'Valeur / connecteur'], [...m.envVars.map((v) => ['Variable', v.schema, v.label, v.current ?? v.default ?? '']), ...m.connRefs.map((c) => ['Référence de connexion', c.name, c.label, c.connector])]);
    add('Points d\'attention', ['Niveau', 'Constat'], (m.issues || []).map((i) => [i.level, i.text]));
    return S.length ? S : [{ name: 'Vide', rows: [['Aucun composant']] }];
  };

  g.SolDocRender = R;
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
