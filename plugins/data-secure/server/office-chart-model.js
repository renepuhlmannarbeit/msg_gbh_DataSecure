'use strict';

// Cached Office chart data, not an Excel calculator or a visual renderer.
// Every value remains owned by an actual cache channel and its explicit idx.
const { readXml, assertXmlCharacters } = require('./xml-reader');
const { formatXlsxNumber } = require('./xlsx-number-format');
const { isProtectedFieldHeader } = require('./privacy/field-value-coverage');
const { CONTENT_PERSON_FIELD_POLICY } = require('./core/person-field-policy');
const C = new Set(['http://schemas.openxmlformats.org/drawingml/2006/chart', 'http://purl.oclc.org/ooxml/drawingml/chart']);
const A = new Set(['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main']);
const P = new Set(['http://schemas.openxmlformats.org/presentationml/2006/main', 'http://purl.oclc.org/ooxml/presentationml/main']);
const XDR = new Set(['http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing', 'http://purl.oclc.org/ooxml/drawingml/spreadsheetDrawing']);
const W = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main']);
const WP = new Set(['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing','http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing']);
const R = ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships'];
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const MAX_POINTS = 200000, MAX_SERIES = 4096, MAX_LEVELS = 64, MAX_CHARS = 8000000;
const CHARTS = new Set(['areaChart', 'area3DChart', 'barChart', 'bar3DChart', 'bubbleChart', 'doughnutChart', 'lineChart', 'line3DChart', 'ofPieChart', 'pieChart', 'pie3DChart', 'radarChart', 'scatterChart', 'stockChart', 'surfaceChart', 'surface3DChart']);
const AXES = new Set(['catAx', 'dateAx', 'valAx', 'serAx']);
const attr = (node, key) => node?.attributes.get(`{}${key}`);
const is = (node, ns, name) => Boolean(node && ns.has(node.namespaceURI) && node.localName === name);
const children = (node, name) => node?.children.filter(child => is(child, C, name)) || [];
function once(node, name, error) { const values = children(node, name); if (values.length > 1) throw error(); return values[0]; }
function uint(value, error) { if (typeof value !== 'string' || !/^[0-9]+$/u.test(value) || Number(value) > 4294967295) throw error(); return Number(value); }
function relationId(node) { const ids = R.map(ns => node.attributes.get(`{${ns}}id`)).filter(value => value !== undefined); return ids.length === 1 && ids[0] ? ids[0] : null; }

function selectedTree(xml, decode, error, understoodNamespaces, visitor) {
  const ignored = new WeakSet(), selected = new WeakMap(), models = new WeakMap(), leaves = new WeakSet();
  const understood = understoodNamespaces || new Set([...C, ...A, ...P, ...XDR]); let result, nodes = 0, chars = 0;
  const active = node => { for (let owner = node; owner; owner = owner.parent) if (ignored.has(owner)) return false; return true; };
  readXml(xml, { decode, error, start(node) {
    if(!node.parent&&node.namespaceURI===MC)throw error();
    if (node.parent && !active(node.parent)) { ignored.add(node); return; }
    if (node.parent && leaves.has(node.parent)) throw error();
    if (node.parent?.namespaceURI === MC && node.parent.localName === 'AlternateContent' &&
        !(node.namespaceURI === MC && ['Choice', 'Fallback'].includes(node.localName))) { ignored.add(node); return; }
    if (node.namespaceURI === MC && node.localName === 'AlternateContent') { selected.set(node, false); return; }
    if (node.namespaceURI === MC && ['Choice', 'Fallback'].includes(node.localName)) {
      if (node.parent?.namespaceURI !== MC || node.parent.localName !== 'AlternateContent') throw error();
      const requires = (attr(node, 'Requires') || '').trim().split(/\s+/u).filter(Boolean);
      const usable = node.localName === 'Fallback' || (requires.length && requires.every(prefix => understood.has(node.namespaces.get(prefix))));
      if (selected.get(node.parent) || !usable) ignored.add(node); else selected.set(node.parent, true);
      return;
    }
    if (!visitor && ++nodes > 200000) throw error(true);
    const model = { namespaceURI: node.namespaceURI, localName: node.localName, attributes: node.attributes, children: [], childrenCount:0, text: '', parent: null };
    let owner = node.parent; while (owner && !models.has(owner)) owner = owner.parent;
    if (owner) { model.parent = models.get(owner);model.parent.childrenCount++;if(!visitor)model.parent.children.push(model); } else result = model;
    models.set(node, model);
    if (!visitor && ((C.has(node.namespaceURI) && ['v', 'f', 'formatCode'].includes(node.localName)) || is(node, A, 't'))) leaves.add(node);
    visitor?.start?.(model,result);
  }, text(value, node) {
    if(visitor)return;
    if (!active(node) || !models.has(node)) return;
    chars += value.length; if (chars > MAX_CHARS) throw error(true);
    models.get(node).text += value;
  },end(node){const model=models.get(node);if(model)visitor?.end?.(model,result);} });
  return result;
}

function readOfficeChart(xml, decode, error) {
  const root = selectedTree(xml, decode, error);
  if (!is(root, C, 'chartSpace')) throw error();
  const used = new WeakSet(), issues = new Set(); let points = 0, seriesCount = 0;
  const scalar = (node, xstring = false) => {
    if (!node) return '';
    if (node.children.length) throw error(); used.add(node);
    const value = xstring ? node.text.replace(/_x([0-9a-fA-F]{4})_/gu, (_, code) => String.fromCharCode(Number.parseInt(code, 16))) : node.text;
    assertXmlCharacters(value, error); return value;
  };
  function pointMap(node) {
    const values = new Map();
    for (const pt of children(node, 'pt')) {
      if (++points > MAX_POINTS) throw error(true);
      const index = uint(attr(pt, 'idx'), error), valueNode = once(pt, 'v', error);
      if (values.has(index) || !valueNode) throw error();
      values.set(index, scalar(valueNode, true));
    }
    return values;
  }
  function cache(node, numeric, multilevel = false) {
    if (!node) { issues.add('CACHE_MISSING'); return { levels: [new Map()], numeric, count: null, format: null, source: null }; }
    const countNode = once(node, 'ptCount', error), count = countNode ? uint(attr(countNode, 'val'), error) : null;
    const formatNode = once(node, 'formatCode', error), format = formatNode ? scalar(formatNode) : null;
    const levelNodes = multilevel ? children(node, 'lvl') : [node];
    if (!levelNodes.length || levelNodes.length > MAX_LEVELS) throw error(levelNodes.length > MAX_LEVELS);
    const levels = levelNodes.map(pointMap);
    for (const level of levels) for (const index of level.keys()) if (count !== null && index >= count) throw error();
    if (count !== null && levels.some(level => level.size < count)) issues.add('CACHE_GAPS');
    return { levels, numeric, count, format, source: null };
  }
  function channel(node) {
    if (!node) return null;
    const alternatives = node.children.filter(value => C.has(value.namespaceURI) && ['strRef', 'numRef', 'strLit', 'numLit', 'multiLvlStrRef'].includes(value.localName));
    if (alternatives.length !== 1) { issues.add('DATA_SOURCE_UNMODELED'); return null; }
    const source = alternatives[0], numeric = ['numRef', 'numLit'].includes(source.localName), multi = source.localName === 'multiLvlStrRef';
    const kind = multi ? 'multiLvlStrCache' : numeric ? 'numCache' : 'strCache';
    const model = cache(source.localName.endsWith('Lit') ? source : once(source, kind, error), numeric, multi);
    const formula = once(source, 'f', error); model.source = formula ? scalar(formula) : null;
    return model;
  }
  function rich(node) {
    if (!node) return '';
    const paragraphs = node.children.filter(value => is(value, A, 'p')).map(paragraph => {
      const parts = [];
      for (const run of paragraph.children) {
        if (is(run, A, 'br')) parts.push('\n');
        else if (is(run, A, 'r') || is(run, A, 'fld')) for (const text of run.children.filter(value => is(value, A, 't'))) parts.push(scalar(text));
      }
      return parts.join('');
    });
    return paragraphs.join('\n\n');
  }
  function text(node) {
    if (!node) return { value: '', source: null };
    const direct = once(node, 'v', error), richNode = once(node, 'rich', error), ref = once(node, 'strRef', error);
    if ([direct, richNode, ref].filter(Boolean).length > 1) throw error();
    if (direct) return { value: scalar(direct, true), source: null };
    if (richNode) return { value: rich(richNode), source: null };
    if (ref) {
      const model = cache(once(ref, 'strCache', error), false), formula = once(ref, 'f', error);
      if (model.levels[0].size > 1) issues.add('TEXT_CACHE_MULTIPLE');
      // A title/series reference is a single value, not an arbitrary first
      // cache point. Preserve all actual indexed values explicitly otherwise.
      return { value: model.levels[0].size === 1 && model.levels[0].has(0) ? model.levels[0].get(0) : '',
        indexed: model.levels[0], source: formula ? scalar(formula) : null };
    }
    if (node.children.length) issues.add('TEXT_UNMODELED');
    return { value: '', source: null };
  }
  const dateNode = once(root, 'date1904', error), dateValue = dateNode ? attr(dateNode, 'val') ?? '1' : '0';
  if (!['0', '1', 'true', 'false'].includes(dateValue)) throw error();
  const chart = once(root, 'chart', error), plot = once(chart, 'plotArea', error), groups = [], axes = [];
  const title = text(once(once(chart, 'title', error), 'tx', error));
  for (const axis of plot?.children || []) if (C.has(axis.namespaceURI) && AXES.has(axis.localName)) {
    const idNode = once(axis, 'axId', error), id = idNode ? uint(attr(idNode, 'val'), error) : null;
    if (id !== null && axes.some(value => value.id === id)) throw error();
    const format = once(axis, 'numFmt', error), cross = once(axis, 'crossAx', error),positionNode=once(axis,'axPos',error);
    const position=positionNode?attr(positionNode,'val'):null;
    if(position!==null&&!['b','t','l','r'].includes(position))throw error();
    axes.push({ kind: axis.localName, id, title: text(once(once(axis, 'title', error), 'tx', error)),
      position,format: format ? attr(format, 'formatCode') ?? null : null, cross: cross ? uint(attr(cross, 'val'), error) : null });
  }
  for (const group of plot?.children || []) {
    if (!C.has(group.namespaceURI) || !CHARTS.has(group.localName)) continue;
    const series = [], ids = new Set(), orders = new Set();
    for (const source of children(group, 'ser')) {
      if (++seriesCount > MAX_SERIES) throw error(true);
      const idNode = once(source, 'idx', error), orderNode = once(source, 'order', error);
      const index = idNode ? uint(attr(idNode, 'val'), error) : null, order = orderNode ? uint(attr(orderNode, 'val'), error) : null;
      if ((index !== null && ids.has(index)) || (order !== null && orders.has(order))) throw error();
      if (index === null || order === null) issues.add('SERIES_ID_MISSING');
      if (index !== null) ids.add(index); if (order !== null) orders.add(order);
      const item = { index, order, ordinal: series.length, title: text(once(source, 'tx', error)), channels: new Map() };
      const allowed = group.localName === 'scatterChart' ? ['xVal', 'yVal'] : group.localName === 'bubbleChart' ? ['xVal', 'yVal', 'bubbleSize'] : ['cat', 'val'];
      for (const kind of allowed) { const parsed = channel(once(source, kind, error)); if (parsed) item.channels.set(kind, parsed); else issues.add('CACHE_MISSING'); }
      series.push(item);
    }
    series.sort((left, right) => (left.order ?? left.ordinal) - (right.order ?? right.ordinal));
    const axisIds = children(group, 'axId').map(node => uint(attr(node, 'val'), error));
    groups.push({ kind: group.localName, axisIds, series });
  }
  if (!chart || !plot || !groups.length) issues.add('CHART_UNMODELED');
  // Unknown value/text-bearing paths are not swept into a flat value list or
  // silently counted as covered. Known independent cached series still work.
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    for (const child of node.children) pending.push(child);
    if (((is(node, C, 'v') || is(node, A, 't')) && node.text && !used.has(node)) ||
        (is(node, C, 'externalData')) || (C.has(node.namespaceURI) && /(?:Chart|Ref)$/u.test(node.localName) && !used.has(node) &&
          !CHARTS.has(node.localName) && !['strRef', 'numRef', 'multiLvlStrRef'].includes(node.localName))) issues.add('CONTENT_UNMODELED');
  }
  return { title, groups, axes, date1904: dateValue === '1' || dateValue === 'true', issues, points };
}

function renderOfficeChart(model, escape, error) {
  const lines = []; let chars = 0, sourceValues = 0;
  const append = value => { chars += value.length + (lines.length ? 2 : 0); if (chars > MAX_CHARS) throw error(true); lines.push(value); };
  const metadata = (label, value) => {
    if (!value) return; sourceValues++;
    append(`${label}\n\n| Inhalt |\n| --- |\n| ${escape(value)} |`);
  };
  function title(label, item) {
    metadata(label, item.value);
    if (item.indexed && !item.value) for (const [index, value] of [...item.indexed].sort((a, b) => a[0] - b[0])) metadata(`${label} · Cacheindex ${index}`, value);
    metadata(`${label} · Bezug (nicht ausgewertet)`, item.source);
  }
  title('Diagrammtitel', model.title);
  for (const axis of model.axes) {
    title(`Achse ${axis.kind} · ID ${axis.id ?? 'fehlt'}`, axis.title);
    if (axis.format) metadata(`Achse ${axis.id ?? 'fehlt'} · Zahlenformat`, axis.format);
    if(axis.cross!==null)append(`Strukturverweis: Achse ${axis.id ?? 'fehlt'} · Kreuzungsachse ${axis.cross}`);
  }
  for (const [groupIndex, group] of model.groups.entries()) for (const series of group.series) {
    append(`Diagrammtyp ${group.kind} · Gruppe ${groupIndex + 1} · Serie ${series.index ?? 'ID fehlt'} · Reihenfolge ${series.order ?? 'fehlt'}`);
    if(group.axisIds.length)append(`Achsenbezüge dieser Diagrammgruppe: ${group.axisIds.join(', ')}`);
    title('Serientitel', series.title);
    const columns = [], indices = new Set();
    for (const [kind, channel] of series.channels) {
      metadata(`${kind} · Quellbezug (nicht ausgewertet)`, channel.source);
      if (channel.format) metadata(`${kind} · gespeichertes Zahlenformat`, channel.format);
      for (const [level, values] of channel.levels.entries()) {
        for (const index of values.keys()) indices.add(index);
        columns.push({ kind, channel, values, level, label: kind === 'cat' ? (channel.levels.length > 1 ? `Kategorie · Ebene ${level + 1} (Quellreihenfolge)` : 'Kategorie') : kind === 'xVal' ? 'X-Wert' : kind === 'yVal' ? 'Y-Wert' : kind === 'bubbleSize' ? 'Blasengröße' : 'Wert' });
      }
    }
    // An explicitly bound category-axis field name is real source context,
    // not a nearby arbitrary title. Keep its label in the actual value table
    // so ordinary field/PII/residual review can protect short source values.
    const boundAxes=model.axes.filter(axis=>group.axisIds.includes(axis.id));
    const protectedAxes=boundAxes.filter(axis=>isProtectedFieldHeader(axis.title.value,CONTENT_PERSON_FIELD_POLICY));
    const roles=new Map();let ambiguous=false,incompleteAxes=boundAxes.length!==new Set(group.axisIds).size;
    if(['scatterChart','bubbleChart'].includes(group.kind)){
      // Scatter/bubble have two value axes, not a category axis. Real IDs,
      // orientation and reciprocal crossings establish the channel role;
      // neither XML order, magnitude nor a nearby title is role authority.
      const values=boundAxes.filter(axis=>axis.kind==='valAx'),horizontal=values.filter(axis=>['b','t'].includes(axis.position)),vertical=values.filter(axis=>['l','r'].includes(axis.position));
      const x=horizontal[0],y=vertical[0];
      if(group.axisIds.length===2&&new Set(group.axisIds).size===2&&values.length===2&&horizontal.length===1&&vertical.length===1&&x.cross===y.id&&y.cross===x.id){roles.set('xVal',x);roles.set('yVal',y);}
      else {incompleteAxes=true;if(boundAxes.length)ambiguous=true;}
    }else{
      const cats=boundAxes.filter(axis=>['catAx','dateAx'].includes(axis.kind)),values=boundAxes.filter(axis=>axis.kind==='valAx');
      if(cats.length===1)roles.set('cat',cats[0]);else if(cats.length>1)ambiguous=true;
      if(values.length===1)roles.set('val',values[0]);else if(values.length>1)ambiguous=true;
      if(new Set(group.axisIds).size!==group.axisIds.length)ambiguous=true;
      if(!['pieChart','pie3DChart','doughnutChart','ofPieChart'].includes(group.kind)&&(cats.length!==1||values.length!==1))incompleteAxes=true;
    }
    for(const column of columns){const axis=roles.get(column.kind);if(axis?.title.value)column.label=axis.title.value;}
    if(ambiguous||incompleteAxes)model.issues.add('AXIS_ROLE_UNRESOLVED');
    if(ambiguous){
      // This is a real sensitive obligation on this exact chart group, but
      // no proven PERSON/ID assignment to one channel. Preserve all original
      // values under the existing conservative generic field contract.
      if(protectedAxes.length)for(const column of columns)column.label='Geschützter Tabellenwert';
    }
    if (!indices.size) { append('Hinweis: Keine gespeicherten Datenpunkte; Formeln wurden nicht berechnet.'); continue; }
    const missingPoints=[];
    const display = (column, index) => {
      // Absence is not source text. A generated phrase inside a real Name
      // column would itself become a fake PERSON/identity mapping downstream.
      // Retain the empty cell and disclose its exact source channel/index
      // separately, outside the authoritative value table.
      if (!column.values.has(index)) {missingPoints.push([column.kind,column.level,index]);return '';}
      const value = column.values.get(index); if (value) sourceValues++;
      if (!column.channel.numeric || value === '') return escape(value);
      const result = formatXlsxNumber(value, column.channel.format || 'General', { date1904: model.date1904 });
      if (result.unsupported) model.issues.add('NUMBER_FORMAT_UNMODELED');
      return escape(result.text);
    };
    const table = []; let tableChars = 0;
    const row = line => { tableChars += line.length + 1; if (tableChars + chars > MAX_CHARS) throw error(true); table.push(line); };
    if (indices.size * columns.length > MAX_POINTS) {
      // A sparse multilevel cache is not permission to build an N*M matrix.
      // Keep actual channel/index values only; do not allocate to max idx.
      for (const column of columns) {
        row(`Datenkanal ${column.kind} · Ebene ${column.level + 1}\n`);
        row(`| Punktindex | ${escape(column.label)} |`); row('| --- | --- |');
        for (const [index] of [...column.values].sort((a, b) => a[0] - b[0])) row(`| ${index} | ${display(column, index)} |`);
        row('');
      }
    } else {
      row(`| Punktindex | ${columns.map(column => escape(column.label)).join(' | ')} |`);
      row(`| --- | ${columns.map(() => '---').join(' | ')} |`);
      for (const index of [...indices].sort((a, b) => a - b)) row(`| ${index} | ${columns.map(column => display(column, index)).join(' | ')} |`);
    }
    // Blank table separators are compacted in the real Privacy adapter. A
    // non-table structural boundary prevents metadata/source-ref tables from
    // swallowing this differently shaped, authoritative value table.
    append('Gespeicherte Datenpunkte dieser Serie:');
    append(table.join('\n'));
    for(const [kind,level,index]of missingPoints)append(`Hinweis: Fehlender gespeicherter Cachepunkt · Datenkanal ${kind} · Ebene ${level+1} · Punktindex ${index}.`);
    if (columns.some(column => column.channel.levels.length > 1)) append('Mehrstufige Kategorien bleiben je gespeichertem Ebenen-/Punktindex erhalten; fehlende Oberkategorien wurden nicht auf andere Indizes übertragen.');
  }
  const messages = new Map([
    ['CACHE_MISSING', 'Mindestens ein Daten- oder Titelcache fehlt; keine Formel wurde berechnet.'],
    ['CACHE_GAPS', 'Der Cache enthält nicht alle deklarierten Punkte; fehlende Punkte sind keine Nullwerte.'],
    ['DATA_SOURCE_UNMODELED', 'Eine Diagramm-Datenquelle ist nicht eindeutig modelliert.'],
    ['TEXT_CACHE_MULTIPLE', 'Ein Titelcache enthält mehrere Werte; ihre Indizes bleiben separat.'],
    ['TEXT_UNMODELED', 'Ein Titel-/Serientext konnte nicht vollständig modelliert werden.'],
    ['SERIES_ID_MISSING', 'Serienindex oder Reihenfolge fehlt; XML-Reihenfolge wird nur als solche verwendet.'],
    ['CHART_UNMODELED', 'Der Diagrammtyp ist nicht vollständig modelliert.'],
    ['CONTENT_UNMODELED', 'Zusätzliche Diagramminhalte oder externe Daten werden nicht als vollständig gelesen ausgegeben.'],
    ['NUMBER_FORMAT_UNMODELED', 'Ein Zahlenformat oder Zahlenwert ist nur als gespeicherter Rohwert mit Formatcode verfügbar.'],
    ['AXIS_ROLE_UNRESOLVED','Mindestens ein tatsächlicher Achsenbezug fehlt oder erlaubt keine eindeutige Datenkanalrolle; eine gebundene sensible Feldpflicht bleibt konservativ geschützt.']
  ]);
  if (sourceValues) append('Datenstand: gespeicherte Diagramm-Caches, nicht neu berechnet.');
  for (const issue of model.issues) append(`Hinweis: ${messages.get(issue)}`);
  return { markdown: lines.join('\n\n'), hasSource: sourceValues > 0, issues: [...model.issues] };
}

function wordScope(root,node,storyIds) {
  const parents={drawing:['r'],r:['p','hyperlink','sdtContent','customXml','smartTag'],
    p:['body','tc','hdr','ftr','footnote','endnote','comment','sdtContent','customXml'],pPr:['p'],
    tbl:['body','tc','hdr','ftr','footnote','endnote','comment','sdtContent','customXml'],
    tr:['tbl','sdtContent','customXml'],tc:['tr','sdtContent','customXml'],body:['document'],sectPr:['body','pPr'],
    hyperlink:['p','sdtContent','customXml','smartTag'],smartTag:['p','hyperlink','sdtContent','customXml','smartTag'],
    sdtContent:['sdt'],sdt:['body','p','tc','tr','tbl','hdr','ftr','footnote','endnote','comment','sdtContent','customXml','hyperlink'],
    customXml:['body','p','tc','tr','tbl','hdr','ftr','footnote','endnote','comment','sdtContent','customXml','hyperlink','smartTag'],
    footnote:['footnotes'],endnote:['endnotes'],comment:['comments']};
  let body=root.localName!=='document',story=!storyIds;
  for(let owner=node;owner;owner=owner.parent){
    if(!W.has(owner.namespaceURI))return false;
    if(owner.localName==='body')body=owner.parent===root;
    if(storyIds&&['footnote','endnote','comment'].includes(owner.localName)&&owner.parent===root){
      const id=owner.attributes.get(`{${owner.namespaceURI}}id`);story=storyIds.has(id);
    }
    if(owner===root)return body&&story;
    if(!W.has(owner.parent?.namespaceURI)||!parents[owner.localName]?.includes(owner.parent.localName))return false;
  }
  return false;
}
function wordChartStoryReferences(xml,decode,error,understoodNamespaces){
  const result={headers:[],footers:[],comments:new Set(),footnotes:new Set(),endnotes:new Set()};
  const root=selectedTree(xml,decode,error,understoodNamespaces,{start(node,root){
    if(!W.has(node.namespaceURI)||!wordScope(root,node.parent))return;
    if(['headerReference','footerReference'].includes(node.localName)&&is(node.parent,W,'sectPr')&&
        (is(node.parent.parent,W,'body')||is(node.parent.parent,W,'pPr'))){
      const id=relationId(node);if(id)result[node.localName==='headerReference'?'headers':'footers'].push(id);
    }
    const kind={commentReference:'comments',footnoteReference:'footnotes',endnoteReference:'endnotes'}[node.localName];
    if(kind&&is(node.parent,W,'r')){const id=node.attributes.get(`{${node.namespaceURI}}id`);if(id!==undefined)result[kind].add(id);}
  }});
  // A well-formed foreign root has no Word story authority. The existing
  // engineering reader may retain an incomplete empty result for that case;
  // supplement discovery must neither accept it nor invent a new hard stop.
  if(!is(root,W,'document'))return null;
  return result;
}
function officeChartReferences(xml, family, decode, error, scope = {}) {
  if(!['ppt','xl','word'].includes(family))throw error();
  const ns = family === 'ppt' ? P : family==='word'?W:XDR;
  const rootName=family==='ppt'?'sld':family==='xl'?'wsDr':scope.root||'document';
  const result = [];
  const root=selectedTree(xml,decode,error,family==='word'?scope.understoodNamespaces:undefined,{end(node,root){
    if (!is(node, C, 'chart')) return;
    const data = node.parent, graphic = data?.parent, frame = graphic?.parent;
    if (!is(data, A, 'graphicData') || !C.has(attr(data, 'uri')) || !is(graphic, A, 'graphic')) return;
    if(family==='word'){
      if(!WP.has(frame?.namespaceURI)||!['inline','anchor'].includes(frame.localName)||!is(frame.parent,W,'drawing')||
          !is(frame.parent.parent,W,'r')||!wordScope(root,frame.parent,scope.storyIds))return;
    }else if(!is(frame,ns,'graphicFrame'))return;
    let owner = frame.parent; while (is(owner, ns, 'grpSp')) owner = owner.parent;
    if (family === 'ppt') {
      if (!is(owner, P, 'spTree') || !is(owner.parent, P, 'cSld') || owner.parent.parent !== root) return;
    } else if (family==='xl'&&(!owner || !XDR.has(owner.namespaceURI) || !['oneCellAnchor', 'twoCellAnchor', 'absoluteAnchor'].includes(owner.localName) || owner.parent !== root)) return;
    const id = relationId(node); if (!id || node.childrenCount) throw error();
    if (result.length >= 1000) throw error(true);
    if(family==='word'&&scope.storyIds){
      let story=frame;while(story&&story.parent!==root)story=story.parent;
      result.push({id,storyId:story?.attributes.get(`{${story.namespaceURI}}id`)});
    }else result.push(id);
  }});
  if(!is(root,ns,rootName)||family==='word'&&!['document','hdr','ftr','comments','footnotes','endnotes'].includes(rootName))throw error();
  return result;
}

module.exports = Object.freeze({ readOfficeChart, renderOfficeChart, officeChartReferences, wordChartStoryReferences });
