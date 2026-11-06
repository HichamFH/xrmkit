// Écriture de fichiers .xlsx et .docx sans dépendance (archive ZIP « store »).
(function (g) {
  'use strict';
  const enc = new TextEncoder();
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const u16 = (n) => [n & 255, (n >>> 8) & 255];
  const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
      parts.push(local, name, data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    const all = [...parts, ...central, end];
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let pos = 0;
    all.forEach((p) => { out.set(p, pos); pos += p.length; });
    return out;
  }

  const xe = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  function sheetXml(rows) {
    if (!rows.length) rows = [['(vide)']];
    const widths = [];
    rows.forEach((r) => r.forEach((v, i) => { widths[i] = Math.min(60, Math.max(widths[i] || 8, String(v ?? '').length + 2)); }));
    const cols = '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    const data = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
      if (v == null || v === '') return '';
      const ref = colName(ci) + (ri + 1), s = ri === 0 ? ' s="1"' : '';
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xe(String(v).slice(0, 32000))}</t></is></c>`;
    }).join('') + '</row>').join('');
    const last = colName(Math.max(0, widths.length - 1)) + rows.length;
    return `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${data}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
  }

  // sheets : [{ name, rows: [[...entêtes], [...], ...] }]
  function xlsxBytes(sheets) {
    const used = new Set();
    const names = sheets.map((s, i) => {
      let n = String(s.name || 'Feuille' + (i + 1)).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Feuille' + (i + 1);
      let k = 2; const base = n;
      while (used.has(n.toLowerCase())) n = base.slice(0, 28) + ' ' + k++;
      used.add(n.toLowerCase());
      return n;
    });
    const files = [
      { name: '[Content_Types].xml', data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xe(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) })),
    ];
    return zip(files);
  }

  // blocs : {t:'title'|'h1'|'h2'|'p'|'table'|'pb', text, header, rows}
  function docxBytes(blocks, opts = {}) {
    const landscape = !!opts.landscape;
    const total = landscape ? 14800 : 9800;
    const run = (text, { b, sz, color } = {}) => {
      const lines = String(text ?? '').split('\n');
      return lines.map((ln, i) => `<w:r><w:rPr>${b ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : ''}</w:rPr>${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xe(ln)}</w:t></w:r>`).join('');
    };
    const para = (text, o = {}, ppr = '') => `<w:p><w:pPr>${ppr}</w:pPr>${run(text, o)}</w:p>`;
    const cell = (text, w, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="DCE6F1"/>' : ''}</w:tcPr>${para(String(text ?? '').slice(0, 4000), { b: head, sz: 18 }, '<w:spacing w:before="20" w:after="20"/>')}</w:tc>`;
    const table = (header, rows) => {
      const n = Math.max(header.length, 1), w = Math.floor(total / n);
      const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>`).join('');
      return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${header.map(() => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
        + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${header.map((x) => cell(x, w, true)).join('')}</w:tr>`
        + rows.map((r) => `<w:tr>${header.map((_, i) => cell(r[i], w, false)).join('')}</w:tr>`).join('') + '</w:tbl>' + para('');
    };
    const body = blocks.map((b) => {
      if (b.t === 'title') return para(b.text, { b: true, sz: 44, color: '0B3D6B' }, '<w:spacing w:after="200"/>');
      if (b.t === 'h1') return para(b.text, { b: true, sz: 32, color: '0063B1' }, '<w:keepNext/><w:spacing w:before="320" w:after="120"/>');
      if (b.t === 'h2') return para(b.text, { b: true, sz: 26 }, '<w:keepNext/><w:spacing w:before="220" w:after="80"/>');
      if (b.t === 'table') return table(b.header, b.rows);
      if (b.t === 'pb') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      return para(b.text, { b: b.bold });
    }).join('');
    const pg = landscape ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
    const doc = `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr>${pg}<w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    return zip([
      { name: '[Content_Types].xml', data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
      { name: '_rels/.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
      { name: 'word/document.xml', data: doc },
    ]);
  }

  // ------------------------------------------------------------------ lecture ZIP (modèles .docx)
  const MAX_ENTRY = 50 * 1024 * 1024, MAX_TOTAL = 100 * 1024 * 1024;
  async function inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(u8).catch(() => {}); w.close().catch(() => {});
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  // Retourne [{ name, data: Uint8Array }]. Gère « stocké » (0) et « deflate » (8) ; refuse ZIP64 et chiffrement.
  async function unzip(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Fichier invalide : ce n\'est pas une archive Word (.docx).');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder(), out = [];
    let total = 0;
    for (let k = 0; k < n; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('Archive corrompue.');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + el + cl;
      if (name.endsWith('/')) continue;
      if (flags & 1) throw new Error('Document chiffré : retirez le mot de passe du modèle.');
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF) throw new Error('Archive ZIP64 non prise en charge.');
      if (usize > MAX_ENTRY || (total += usize) > MAX_TOTAL) throw new Error('Modèle trop volumineux une fois décompressé.');
      if (off + 30 > u8.length) throw new Error('Archive corrompue.');
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      const raw = u8.subarray(start, start + csize);
      let data;
      if (method === 0) data = raw.slice();
      else if (method === 8) data = await inflateRaw(raw);
      else throw new Error('Méthode de compression non prise en charge : ' + method);
      out.push({ name, data });
    }
    return out;
  }

  // ------------------------------------------------------------------ moteur de modèle Word
  // Balises : {{variable}}, {{objet.champ}}, boucles {{#liste}} … {{/liste}} (ligne de tableau, paragraphes ou texte en ligne),
  // la même syntaxe sert de condition quand la valeur n'est pas une liste. Les boucles peuvent s'imbriquer.
  const TAGS_PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/;
  const T_RE = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  const P_RE = /<w:p[ >][\s\S]*?<\/w:p>/g;

  // Word découpe souvent « {{nom}} » en plusieurs <w:t> (changement de style, correcteur…) : on les recolle.
  function mergeSplitTags(xml) {
    return xml.replace(P_RE, (para) => {
      if (!para.includes('{')) return para;
      const nodes = [];
      para.replace(T_RE, (m, txt) => { nodes.push(txt); return m; });
      if (nodes.length < 2) return para;
      const text = nodes.join('');
      const owner = [];
      nodes.forEach((t, i) => { for (let c = 0; c < t.length; c++) owner.push(i); });
      const first = new Array(text.length).fill(-1);
      let changed = false;
      for (const m of text.matchAll(/\{\{[^{}]*\}\}/g)) {
        const s = m.index, e = s + m[0].length;
        if (owner[s] === owner[e - 1]) continue;
        changed = true;
        for (let c = s; c < e; c++) first[c] = owner[s];
      }
      if (!changed) return para;
      const buf = nodes.map(() => []);
      for (let c = 0; c < text.length; c++) buf[first[c] >= 0 ? first[c] : owner[c]].push(text[c]);
      let i = 0;
      return para.replace(T_RE, () => `<w:t xml:space="preserve">${buf[i++].join('')}</w:t>`);
    });
  }

  const openRe = (name) => new RegExp(`\\{\\{\\s*#\\s*${name}\\s*\\}\\}`);
  const closeRe = (name) => new RegExp(`\\{\\{\\s*/\\s*${name}\\s*\\}\\}`);
  const lookup = (scopes, path) => {
    const parts = String(path).split('.');
    for (const sc of scopes) {
      if (sc == null || typeof sc !== 'object' || !(parts[0] in sc)) continue;
      let v = sc;
      for (const k of parts) { if (v == null || typeof v !== 'object' || !(k in v)) return undefined; v = v[k]; }
      return v;
    }
    return undefined;
  };
  const showVal = (v) => (v == null ? '' : v === true ? 'oui' : v === false ? 'non' : Array.isArray(v) ? String(v.length) : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const escVal = (s) => xe(s).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
  const paraStart = (xml, i) => Math.max(xml.lastIndexOf('<w:p>', i), xml.lastIndexOf('<w:p ', i));
  const emptyPara = (p) => p.replace(/<[^>]*>/g, '').trim() === '';

  function renderXml(xml, scopes, missing) {
    let out = '', pos = 0;
    const OPEN = /\{\{\s*#\s*([A-Za-z0-9_.]+)\s*\}\}/g;
    for (;;) {
      OPEN.lastIndex = pos;
      const m = OPEN.exec(xml);
      if (!m) break;
      const name = m[1], i = m.index, afterOpen = i + m[0].length;
      const cm = closeRe(name.replace(/\./g, '\\.')).exec(xml.slice(afterOpen));
      if (!cm) { missing.add(`{{/${name}}} (fermeture manquante)`); out += xml.slice(pos, afterOpen); pos = afterOpen; continue; }
      const closeIdx = afterOpen + cm.index, afterClose = closeIdx + cm[0].length;
      const val = lookup(scopes, name);
      if (val === undefined) missing.add(name);
      const items = Array.isArray(val) ? val : (val && val !== 'non' && val !== '0') ? [null] : [];
      const sub = (seg, item) => renderXml(seg, item && typeof item === 'object' ? [item, ...scopes] : scopes, missing);
      let segStart = i, segEnd = afterClose, rendered;
      const rs = Math.max(xml.lastIndexOf('<w:tr>', i), xml.lastIndexOf('<w:tr ', i));
      const re = xml.indexOf('</w:tr>', i);
      if (rs >= 0 && xml.indexOf('</w:tr>', rs) > i && re >= 0 && closeIdx < re) {
        segStart = rs; segEnd = re + 7;
        const seg = xml.slice(rs, segEnd).replace(openRe(name.replace(/\./g, '\\.')), '').replace(closeRe(name.replace(/\./g, '\\.')), '');
        rendered = items.map((it) => sub(seg, it)).join('');
      } else {
        const ps = paraStart(xml, i), cs = paraStart(xml, closeIdx);
        if (ps >= 0 && cs > ps) {
          const pe = xml.indexOf('</w:p>', i) + 6, ce = xml.indexOf('</w:p>', closeIdx) + 6;
          const o = xml.slice(ps, pe).replace(openRe(name.replace(/\./g, '\\.')), ''), c = xml.slice(cs, ce).replace(closeRe(name.replace(/\./g, '\\.')), '');
          const seg = (emptyPara(o) ? '' : o) + xml.slice(pe, cs) + (emptyPara(c) ? '' : c);
          segStart = ps; segEnd = ce;
          rendered = items.map((it) => sub(seg, it)).join('');
        } else {
          rendered = items.map((it) => sub(xml.slice(afterOpen, closeIdx), it)).join('');
        }
      }
      out += xml.slice(pos, segStart) + rendered;
      pos = segEnd;
    }
    out += xml.slice(pos);
    return out.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (all, name) => {
      const v = lookup(scopes, name);
      if (v === undefined) { missing.add(name); return ''; }
      return escVal(showVal(v));
    });
  }

  // Balises présentes dans un modèle : { vars: [...], loops: [...] }
  async function docxTags(buf) {
    const files = await unzip(buf), dec = new TextDecoder();
    const vars = new Set(), loops = new Set();
    for (const f of files) {
      if (!TAGS_PARTS.test(f.name)) continue;
      const xml = mergeSplitTags(dec.decode(f.data));
      for (const m of xml.matchAll(/\{\{\s*([#/]?)\s*([A-Za-z0-9_.]+)\s*\}\}/g)) (m[1] === '#' ? loops : m[1] === '' ? vars : new Set()).add(m[2]);
    }
    return { vars: [...vars], loops: [...loops] };
  }

  // Remplit un modèle .docx/.dotx avec `data` (objet ; les tableaux deviennent des boucles).
  // Retourne { bytes, missing } : `missing` = balises du modèle sans donnée correspondante.
  async function fillDocx(buf, data) {
    const files = await unzip(buf), dec = new TextDecoder(), missing = new Set();
    if (!files.some((f) => f.name === 'word/document.xml')) throw new Error('Ce fichier n\'est pas un document Word (word/document.xml introuvable).');
    const out = files.map((f) => {
      if (TAGS_PARTS.test(f.name)) return { name: f.name, data: renderXml(mergeSplitTags(dec.decode(f.data)), [data], missing) };
      if (f.name === '[Content_Types].xml') return { name: f.name, data: dec.decode(f.data).replace('wordprocessingml.template.main+xml', 'wordprocessingml.document.main+xml').replace('wordprocessingml.document.macroEnabled.main+xml', 'wordprocessingml.document.main+xml') };
      return f;
    });
    return { bytes: zip(out), missing: [...missing] };
  }

  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  g.Office = {
    zip, unzip, fillDocx, docxTags, xlsxBytes, docxBytes, XLSX_MIME, DOCX_MIME,
    docxFromTemplate: async (buf, data) => { const r = await fillDocx(buf, data); return { blob: new Blob([r.bytes], { type: DOCX_MIME }), missing: r.missing }; },
    xlsx: (sheets) => new Blob([xlsxBytes(sheets)], { type: XLSX_MIME }),
    docx: (blocks, opts) => new Blob([docxBytes(blocks, opts)], { type: DOCX_MIME }),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.Office;
})(typeof window !== 'undefined' ? window : globalThis);
