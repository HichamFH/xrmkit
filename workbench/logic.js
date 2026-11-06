// Logique pure (sans DOM, sans appel réseau) : testable sous Node.
(function (g) {
  'use strict';
  const DK = {};

  DK.xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  DK.chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

  // ---------------------------------------------------------------- CSV
  DK.parseCsv = (text) => {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ';': 0, ',': 0, '\t': 0 };
    let inQ = false;
    for (const ch of first) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
    const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === delimiter) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    const clean = rows.filter((r) => r.some((v) => v.trim() !== ''));
    const headers = (clean.shift() || []).map((s) => s.trim());
    return { headers, rows: clean, delimiter };
  };

  // ------------------------------------------------- conversion de valeurs
  DK.convertValue = (type, raw) => {
    const s = String(raw).trim();
    if (s.toUpperCase() === 'NULL') return null;
    switch (type) {
      case 'Integer': case 'BigInt': case 'Picklist': case 'State': case 'Status':
        if (!/^-?\d+$/.test(s)) throw new Error(`entier attendu : « ${s} »`);
        return parseInt(s, 10);
      case 'Decimal': case 'Double': case 'Money': {
        const n = Number(s.replace(/\s/g, '').replace(',', '.'));
        if (!isFinite(n) || s === '') throw new Error(`nombre attendu : « ${s} »`);
        return n;
      }
      case 'Boolean':
        if (/^(true|vrai|oui|yes|1)$/i.test(s)) return true;
        if (/^(false|faux|non|no|0)$/i.test(s)) return false;
        throw new Error(`booléen attendu : « ${s} »`);
      case 'DateTime': {
        const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
        if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d = new Date(s);
        if (isNaN(d)) throw new Error(`date attendue : « ${s} »`);
        return d.toISOString();
      }
      case 'Uniqueidentifier':
        if (!/^\{?[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}\}?$/i.test(s)) throw new Error(`GUID attendu : « ${s} »`);
        return s.replace(/[{}]/g, '');
      default:
        return s;
    }
  };

  DK.buildRecord = (headers, row, attrMap, pk) => {
    const body = {}, errors = [];
    let id = null;
    headers.forEach((hd, i) => {
      const v = row[i];
      if (v == null || String(v).trim() === '') return;
      if (hd.toLowerCase() === 'id' || hd === pk) { id = String(v).trim().replace(/[{}]/g, '').toLowerCase(); return; }
      if (hd.endsWith('@odata.bind')) { const t = String(v).trim(); body[hd] = t.startsWith('/') ? t : '/' + t; return; }
      const a = attrMap[hd];
      if (!a) { errors.push(`colonne inconnue : ${hd}`); return; }
      if (['Lookup', 'Customer', 'Owner'].includes(a.AttributeType)) { errors.push(`${hd} : utiliser une colonne « nav@odata.bind » pour les liaisons`); return; }
      try { body[hd] = DK.convertValue(a.AttributeType, v); } catch (e) { errors.push(`${hd} : ${e.message}`); }
    });
    return { body, id, errors };
  };

  // ------------------------------------------------------------------ RGPD
  // [regex, catégorie, risque, portée]
  const RGPD = [
    [/(ssn|socialsecurity|nationalid|national_id|passport|iban|taxid|tax_id|governmentid|idnumber|identitycard|identitynumber|driverlicen|siret|siren|numsecu|(^|_)nir($|_))/i, 'Identifiant officiel / financier', 'Élevé', 'name'],
    [/(passeport|s[ée]curit[ée] sociale|iban|siret|siren|carte d'identit|permis de conduire)/i, 'Identifiant officiel / financier', 'Élevé', 'label'],
    [/(gender|maritalstatus|familystatus|spousesname|religion|ethnic|nationality|health|medical|disabilit|political|union|sexual)/i, 'Donnée sensible potentielle', 'Élevé', 'name'],
    [/(religion|nationalit|handicap|sant[ée]|situation familiale|genre|origine|syndica)/i, 'Donnée sensible potentielle', 'Élevé', 'label'],
    [/(birthdate|birthday|anniversary)/i, 'Date de naissance', 'Moyen', 'name'],
    [/(naissance|anniversaire)/i, 'Date de naissance', 'Moyen', 'label'],
    [/^(firstname|lastname|middlename|fullname|nickname|salutation|suffix|yomi(first|last|middle|full)name)$/i, 'Identité', 'Moyen', 'name'],
    [/^pr[ée]nom$|^nom (de famille|complet)$/i, 'Identité', 'Moyen', 'label'],
    [/^(?!donot|followemail)(.*_)?emailaddress\d?$|^(?!donot|followemail)(.*_)?email\d?$/i, 'E-mail', 'Moyen', 'name'],
    [/courriel|e-?mail/i, 'E-mail', 'Moyen', 'label'],
    [/^(?!donot)(.*_)?(telephone\d?|mobilephone|fax|pager|homephone|home2|assistantphone)$/i, 'Téléphone', 'Moyen', 'name'],
    [/t[ée]l[ée]phone|mobile|portable/i, 'Téléphone', 'Moyen', 'label'],
    [/^address\d_(line\d|city|postalcode|stateorprovince|country|county|composite|name|postofficebox)$/i, 'Adresse', 'Moyen', 'name'],
    [/(ipaddress|ip_address|latitude|longitude|linkedin|twitter|facebook|instagram|skype)/i, 'Réseaux / localisation', 'Faible', 'name'],
  ];
  DK.rgpdClassify = (logicalName, label) => {
    const n = String(logicalName || ''), l = String(label || '');
    for (const [re, cat, risk, scope] of RGPD) {
      if ((scope === 'name' ? re.test(n) : re.test(l))) return { category: cat, risk };
    }
    return null;
  };

  DK.fillFetch = (entity, pk, names) =>
    `<fetch aggregate="true"><entity name="${entity}"><attribute name="${pk}" alias="total" aggregate="count"/>`
    + names.map((n, i) => `<attribute name="${n}" alias="c${i}" aggregate="countcolumn"/>`).join('')
    + '</entity></fetch>';

  // ---------------------------------------------- noms / types (génération)
  const RESERVED = new Set(['abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while', 'function', 'var', 'let', 'delete', 'export', 'import', 'type']);
  DK.pascal = (s) => String(s).replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_m, _p, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '');
  DK.camel = (s) => {
    const p = DK.pascal(s);
    let r = p.charAt(0).toLowerCase() + p.slice(1);
    if (/^\d/.test(r)) r = '_' + r;
    return RESERVED.has(r) ? r + '_' : r;
  };
  DK.enumName = (label, value, used) => {
    let n = String(label || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim()
      .split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
    if (!n) n = 'Value' + value;
    if (/^\d/.test(n)) n = '_' + n;
    if (used.has(n)) n += '_' + value;
    used.add(n);
    return n;
  };

  const CS = { String: 'string', Memo: 'string', Integer: 'int?', BigInt: 'long?', Double: 'double?', Decimal: 'decimal?', Money: 'Money', Boolean: 'bool?', DateTime: 'DateTime?', Lookup: 'EntityReference', Customer: 'EntityReference', Owner: 'EntityReference', Picklist: 'OptionSetValue', State: 'OptionSetValue', Status: 'OptionSetValue', Uniqueidentifier: 'Guid?', Virtual: 'OptionSetValueCollection' };
  DK.csType = (a) => CS[a.AttributeType] || 'object';
  const TSA = { String: 'StringAttribute', Memo: 'StringAttribute', Integer: 'NumberAttribute', BigInt: 'NumberAttribute', Double: 'NumberAttribute', Decimal: 'NumberAttribute', Money: 'NumberAttribute', Boolean: 'BooleanAttribute', DateTime: 'DateAttribute', Lookup: 'LookupAttribute', Customer: 'LookupAttribute', Owner: 'LookupAttribute', Picklist: 'OptionSetAttribute', State: 'OptionSetAttribute', Status: 'OptionSetAttribute', Virtual: 'MultiSelectOptionSetAttribute' };
  DK.tsAttr = (a) => TSA[a.AttributeType] || 'Attribute';
  const CS_DEFAULT = { String: '""', Memo: '""', Integer: '0', BigInt: '0L', Double: '0d', Decimal: '0m', Money: 'new Money(0m)', Boolean: 'false', DateTime: 'DateTime.UtcNow', Picklist: 'new OptionSetValue(0)', State: 'new OptionSetValue(0)', Status: 'new OptionSetValue(1)', Uniqueidentifier: 'Guid.NewGuid()', Virtual: 'new OptionSetValueCollection { new OptionSetValue(0) }' };

  DK.genPluginCs = (entity, attrs) => {
    const cls = DK.pascal(entity) + 'Plugin';
    const vars = attrs.map((a) => `            var ${DK.camel(a.LogicalName)} = target.GetAttributeValue<${DK.csType(a)}>("${a.LogicalName}");${a.Label ? ' // ' + a.Label : ''}`).join('\n');
    return `using System;
using Microsoft.Xrm.Sdk;

namespace Contoso.Plugins
{
    /// <summary>Plug-in sur la table ${entity} (enregistrer sur Create / Update, phase Pre/Post-Operation).</summary>
    public class ${cls} : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            if (!(context.InputParameters["Target"] is Entity target) || target.LogicalName != "${entity}") return;
            if (context.Depth > 1) return; // évite les boucles infinies

            tracing.Trace("${cls} : début, message {0}, profondeur {1}", context.MessageName, context.Depth);
            try
            {
${vars || '            // sélectionnez des colonnes pour générer les lectures'}

                // Image avant (à déclarer sur l'étape : alias "PreImage")
                var pre = context.PreEntityImages.Contains("PreImage") ? context.PreEntityImages["PreImage"] : null;

                // TODO : logique métier
            }
            catch (Exception ex)
            {
                tracing.Trace("${cls} : erreur {0}", ex);
                throw new InvalidPluginExecutionException("Une erreur est survenue : " + ex.Message, ex);
            }
        }
    }
}
`;
  };

  DK.genCsEntity = (entity, attrs) => {
    const v = DK.camel(entity);
    const lines = attrs.map((a) => {
      let val = CS_DEFAULT[a.AttributeType];
      if (['Lookup', 'Customer', 'Owner'].includes(a.AttributeType)) val = `new EntityReference("${(a.Targets && a.Targets[0]) || 'TODO'}", Guid.Empty)`;
      return `${v}["${a.LogicalName}"] = ${val || 'null'};${a.Label ? ' // ' + a.Label : ''}`;
    }).join('\n');
    return `var ${v} = new Entity("${entity}");\n${lines}\nvar id = service.Create(${v});\n\n// Mise à jour\nvar upd = new Entity("${entity}", id);\n// upd["colonne"] = valeur;\nservice.Update(upd);\n`;
  };

  DK.genTsForm = (entity, attrs) => {
    const ns = DK.pascal(entity);
    const fields = attrs.map((a) => `    ${DK.pascal(a.LogicalName)}: "${a.LogicalName}",`).join('\n');
    const getters = attrs.map((a) => `    const ${DK.camel(a.LogicalName)} = formContext.getAttribute<Xrm.Attributes.${DK.tsAttr(a)}>(Fields.${DK.pascal(a.LogicalName)})?.getValue();${a.Label ? ' // ' + a.Label : ''}`).join('\n');
    const regs = attrs.slice(0, 25).map((a) => `    formContext.getAttribute(Fields.${DK.pascal(a.LogicalName)})?.addOnChange(on${DK.pascal(a.LogicalName)}Change);`).join('\n');
    const stubs = attrs.slice(0, 25).map((a) => `  function on${DK.pascal(a.LogicalName)}Change(ctx: Xrm.Events.EventContext): void {\n    const formContext = ctx.getFormContext();\n    // TODO\n  }`).join('\n\n');
    return `namespace Contoso.${ns} {
  const Fields = {
${fields}
  } as const;

  export function onLoad(executionContext: Xrm.Events.EventContext): void {
    const formContext = executionContext.getFormContext() as Xrm.FormContext;
${regs}
${getters}
  }

${stubs}
}
`;
  };

  DK.genTsWebApi = (entity, set, attrs) => {
    const sel = attrs.map((a) => (['Lookup', 'Customer', 'Owner'].includes(a.AttributeType) ? `_${a.LogicalName}_value` : a.LogicalName)).join(',');
    const body = attrs.filter((a) => !['Lookup', 'Customer', 'Owner'].includes(a.AttributeType)).map((a) => `    ${a.LogicalName}: ${a.AttributeType === 'Boolean' ? 'false' : ['Integer', 'BigInt', 'Double', 'Decimal', 'Money', 'Picklist', 'State', 'Status'].includes(a.AttributeType) ? '0' : '""'},`).join('\n');
    return `// Lecture (${set})
const result = await Xrm.WebApi.retrieveMultipleRecords("${entity}", "?$select=${sel || 'name'}&$top=50");
result.entities.forEach((r) => console.log(r));

// Lecture d'un enregistrement
const rec = await Xrm.WebApi.retrieveRecord("${entity}", id, "?$select=${sel || 'name'}");

// Création
const created = await Xrm.WebApi.createRecord("${entity}", {
${body}
});

// Mise à jour
await Xrm.WebApi.updateRecord("${entity}", created.id, { /* colonnes */ });
`;
  };

  DK.genPayload = (entity, attrs, sets) => {
    const o = {};
    attrs.forEach((a) => {
      const t = a.AttributeType;
      if (['Lookup', 'Customer', 'Owner'].includes(t)) {
        const targets = a.Targets || [];
        const tg = targets[0] || (t === 'Owner' ? 'systemuser' : 'account');
        const suffix = t === 'Owner' ? '' : (t === 'Customer' || targets.length > 1 ? '_' + tg : '');
        o[`${a.SchemaName || a.LogicalName}${suffix}@odata.bind`] = `/${sets[tg] || tg + 's'}(00000000-0000-0000-0000-000000000000)`;
      } else if (['Integer', 'BigInt', 'Double', 'Decimal', 'Money', 'Picklist', 'State', 'Status'].includes(t)) o[a.LogicalName] = 0;
      else if (t === 'Boolean') o[a.LogicalName] = false;
      else if (t === 'DateTime') o[a.LogicalName] = '2024-01-01T00:00:00Z';
      else if (t === 'Uniqueidentifier') o[a.LogicalName] = '00000000-0000-0000-0000-000000000000';
      else o[a.LogicalName] = '';
    });
    return `POST [org]/api/data/v9.2/${sets[entity] || entity + 's'}\n\n` + JSON.stringify(o, null, 2) + '\n';
  };

  DK.genOData = (set, attrs) => {
    const sel = attrs.map((a) => (['Lookup', 'Customer', 'Owner'].includes(a.AttributeType) ? `_${a.LogicalName}_value` : a.LogicalName)).join(',');
    return `GET [org]/api/data/v9.2/${set}?$select=${sel}&$top=50&$orderby=createdon desc\n`;
  };

  DK.genFetch = (entity, attrs) =>
    `<fetch top="50">\n  <entity name="${entity}">\n${attrs.map((a) => `    <attribute name="${a.LogicalName}" />`).join('\n')}\n    <order attribute="createdon" descending="true" />\n  </entity>\n</fetch>\n`;

  // optionRows : [{Champ, Valeur, Libellé}]
  DK.genEnums = (lang, entity, optionRows, only) => {
    const byField = new Map();
    optionRows.forEach((r) => {
      if (only && only.length && !only.includes(r.Champ)) return;
      if (!byField.has(r.Champ)) byField.set(r.Champ, []);
      byField.get(r.Champ).push(r);
    });
    const blocks = [];
    for (const [field, list] of byField) {
      const used = new Set();
      const name = DK.pascal(entity) + DK.pascal(field);
      const items = list.map((o) => `  ${DK.enumName(o['Libellé'], o.Valeur, used)} = ${o.Valeur}`).join(',\n');
      blocks.push(lang === 'ts' ? `export enum ${name} {\n${items},\n}` : `public enum ${name}\n{\n${items.replace(/^ {2}/gm, '    ')}\n}`);
    }
    return blocks.join('\n\n') + (blocks.length ? '\n' : '// Aucun option set pour la sélection.\n');
  };

  // ------------------------------------------------ Mermaid / diagramme SVG
  DK.mermaid = (nodes, edges, keys) => {
    const lines = ['erDiagram'];
    edges.forEach((e) => {
      const lab = String(e.label || 'rel').replace(/"/g, "'");
      lines.push(e.nn ? `  ${e.from} }o--o{ ${e.to} : "${lab}"` : `  ${e.to} ||--o{ ${e.from} : "${lab}"`);
    });
    if (keys) {
      nodes.forEach((n) => {
        lines.push(`  ${n.name} {`);
        if (n.pk) lines.push(`    uniqueidentifier ${n.pk} PK`);
        if (n.primaryName) lines.push(`    string ${n.primaryName}`);
        lines.push('  }');
      });
    } else {
      nodes.forEach((n) => { if (!edges.some((e) => e.from === n.name || e.to === n.name)) lines.push(`  ${n.name}`); });
    }
    return lines.join('\n') + '\n';
  };

  DK.svgDiagram = (nodes, edges) => {
    const n = nodes.length;
    const W = 170, H = 46;
    const R = n <= 1 ? 0 : Math.max(150, n * 38);
    const size = 2 * R + W + 120, cx0 = size / 2, cy0 = size / 2 - 10;
    const pos = {};
    nodes.forEach((nd, i) => {
      const ang = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      pos[nd.name] = { x: cx0 + R * Math.cos(ang), y: cy0 + R * Math.sin(ang) };
    });
    const edgePoint = (p, dx, dy) => {
      const ax = Math.abs(dx) || 1e-6, ay = Math.abs(dy) || 1e-6;
      const t = Math.min((W / 2) / ax, (H / 2) / ay);
      return { x: p.x + dx * t, y: p.y + dy * t };
    };
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" font-family="Segoe UI, Arial, sans-serif" font-size="12">`,
      '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>',
      `<rect width="${size}" height="${size}" fill="#ffffff"/>`];
    edges.forEach((e) => {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) return;
      if (e.from === e.to) {
        parts.push(`<path d="M ${a.x + W / 2 - 20} ${a.y - H / 2} c 10 -40 70 -40 60 0" fill="none" stroke="#555" marker-end="url(#arr)"/>`);
        parts.push(`<text x="${a.x + W / 2 + 10}" y="${a.y - H / 2 - 30}" fill="#333">${DK.xmlEsc(e.label || '')}</text>`);
        return;
      }
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const s = edgePoint(a, dx / len, dy / len), t = edgePoint(b, -dx / len, -dy / len);
      parts.push(`<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${t.x.toFixed(1)}" y2="${t.y.toFixed(1)}" stroke="#555" ${e.nn ? 'marker-start="url(#arr)" ' : ''}marker-end="url(#arr)"/>`);
      parts.push(`<text x="${((s.x + t.x) / 2).toFixed(1)}" y="${((s.y + t.y) / 2 - 4).toFixed(1)}" text-anchor="middle" fill="#333" stroke="#fff" stroke-width="3" paint-order="stroke">${DK.xmlEsc(e.label || '')}</text>`);
    });
    nodes.forEach((nd) => {
      const p = pos[nd.name];
      parts.push(`<rect x="${(p.x - W / 2).toFixed(1)}" y="${(p.y - H / 2).toFixed(1)}" width="${W}" height="${H}" rx="6" fill="#eef4fb" stroke="#0063b1"/>`);
      parts.push(`<text x="${p.x.toFixed(1)}" y="${(p.y - 3).toFixed(1)}" text-anchor="middle" font-weight="600" fill="#0b3d6b">${DK.xmlEsc(nd.name)}</text>`);
      if (nd.label) parts.push(`<text x="${p.x.toFixed(1)}" y="${(p.y + 13).toFixed(1)}" text-anchor="middle" fill="#555">${DK.xmlEsc(String(nd.label).slice(0, 26))}</text>`);
    });
    parts.push('</svg>');
    return parts.join('\n');
  };

  // ----------------------------------------------------- privilèges de rôles
  const DEPTH = { 0: 'Basic', 1: 'Local', 2: 'Deep', 3: 'Global' };
  const RANK = { basic: 1, local: 2, deep: 3, global: 4 };
  DK.depthName = (d) => (/^\d+$/.test(String(d)) ? DEPTH[Number(d)] || String(d) : String(d));
  DK.diffPrivileges = (A, B) => {
    const m = (arr) => new Map(arr.map((p) => [p.name, DK.depthName(p.depth)]));
    const a = m(A), b = m(B);
    const out = [];
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(k), y = b.get(k);
      if (x === y) continue;
      let st;
      if (!x) st = 'Seulement dans B';
      else if (!y) st = 'Seulement dans A';
      else st = (RANK[x.toLowerCase()] || 0) > (RANK[y.toLowerCase()] || 0) ? 'A plus large' : 'B plus large';
      out.push({ 'Privilège': k, A: x || '—', B: y || '—', Statut: st });
    }
    return out.sort((p, q) => p['Privilège'].localeCompare(q['Privilège']));
  };

  // -------------------------------------------------------- données de test
  DK.TAG = 'Xrmkit test data';
  const FIRST = ['Camille', 'Lucas', 'Emma', 'Hugo', 'Léa', 'Nathan', 'Chloé', 'Louis', 'Manon', 'Jules', 'Sarah', 'Adam', 'Inès', 'Yanis', 'Sofia', 'Ethan', 'Jade', 'Mehdi', 'Zoé', 'Karim'];
  const LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier'];
  const COMP = ['Atlas', 'Horizon', 'Vertex', 'Nordic', 'Alpha', 'Orion', 'Delta', 'Zenith', 'Nova', 'Lumen'];
  const SUFX = ['Conseil', 'Industrie', 'Services', 'Logistique', 'Solutions', 'Groupe', 'Digital', 'Énergie'];
  const CITY = [['Nantes', '44000'], ['Paris', '75008'], ['Lyon', '69002'], ['Rennes', '35000'], ['Bordeaux', '33000'], ['Lille', '59000']];
  const ascii = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  DK.fake = (kind, i, rnd = Math.random) => {
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
    const [city, zip] = pick(CITY);
    if (kind === 'account') {
      return { name: `${pick(COMP)} ${pick(SUFX)} ${i + 1}`, telephone1: `+33 2 40 ${digits(2)} ${digits(2)} ${digits(2)}`, emailaddress1: `contact${i + 1}@example.com`, address1_city: city, address1_postalcode: zip, address1_country: 'France', description: DK.TAG };
    }
    const fn = pick(FIRST), ln = pick(LAST);
    const base = { firstname: fn, lastname: ln, emailaddress1: `${ascii(fn)}.${ascii(ln)}${i + 1}@example.com`, description: DK.TAG };
    if (kind === 'contact') return { ...base, mobilephone: `+33 6 ${digits(2)} ${digits(2)} ${digits(2)} ${digits(2)}`, address1_city: city, address1_postalcode: zip };
    if (kind === 'lead') return { ...base, subject: `Prospect ${i + 1}`, companyname: `${pick(COMP)} ${pick(SUFX)}` };
    throw new Error('Type inconnu : ' + kind);
  };

  g.DK = DK;
  if (typeof module !== 'undefined' && module.exports) module.exports = DK;
})(typeof window !== 'undefined' ? window : globalThis);
