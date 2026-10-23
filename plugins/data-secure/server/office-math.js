'use strict';

// Closed native OMML -> visible Markdown-safe text. No TeX/Office execution,
// external resolver, generic XML fallback, renderer or new runtime dependency.
const { readXml, assertXmlCharacters } = require('./xml-reader');
const MATH_NAMESPACES = Object.freeze(['http://schemas.openxmlformats.org/officeDocument/2006/math',
  'http://purl.oclc.org/ooxml/officeDocument/math']);
const M = new Set(MATH_NAMESPACES);
const W = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main']);
const A = new Set(['http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main']);
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const UNDERSTOOD = new Set([...M, ...W, 'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main', 'http://schemas.microsoft.com/office/drawing/2010/main',
  'http://schemas.openxmlformats.org/presentationml/2006/main', 'http://purl.oclc.org/ooxml/presentationml/main']);
const LIMITS = Object.freeze({ bytes: 1024 * 1024, nodes: 10000, depth: 64, text: 262144, output: 524288,
  rows: 256, columns: 256, cells: 10000 });
const ROOTS = new Set(['oMath', 'oMathPara']);
const ARGS = new Set(['e', 'num', 'den', 'sub', 'sup', 'deg', 'lim', 'fName']);
const ARG_OWNERS = Object.freeze({ num:['f'],den:['f'],sub:['sSub','sSubSup','sPre','nary'],sup:['sSup','sSubSup','sPre','nary'],
  deg:['rad'],lim:['limLow','limUpp'],fName:['func'],e:['rad','sSub','sSup','sSubSup','sPre','nary','limLow','limUpp','d','func','acc','bar','groupChr','mr','eqArr','box','borderBox','phant'] });
const PR = new Set(['rPr','ctrlPr','argPr','oMathParaPr','fPr','radPr','sSubPr','sSupPr','sSubSupPr','sPrePr',
  'naryPr','limLowPr','limUppPr','dPr','funcPr','accPr','barPr','groupChrPr','mPr','eqArrPr','boxPr','borderBoxPr','phantPr']);
const FORMAT = new Set(['aln','brk','lit','nor','scr','sty','argSz','jc','baseJc','plcHide','rSp','rSpRule',
  'cGp','cGpRule','cSp','mcs','mc','mcPr','count','mcJc','maxDist','objDist','opEmu','noBreak','diff']);
const INVALID = 'OFFICE_MATH_INVALID', LIMITED = 'OFFICE_MATH_LIMIT';
function failure(limit = false) { return Object.assign(new Error(limit ? LIMITED : INVALID), { code: limit ? LIMITED : INVALID }); }
function safe(value) { assertXmlCharacters(value, failure); return value; }
function escape(value) { return safe(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
  .replace(/[\\`*_{}\[\]()#+!|$]/gu, '\\$&'); }
// Exact inverse of this module's own escaping, not a source/Markdown decoder.
function rawProjection(value) { return value.replace(/\\([\\`*_{}\[\]()#+!|$])/gu, '$1')
  .replace(/&(amp|lt|gt);/gu, (_match,key)=>({amp:'&',lt:'<',gt:'>'})[key]); }
// XML 1.0 cannot contain NUL, even via a numeric character reference. These
// boundaries exist only in the reader's private render buffer, never in its
// public text, source values, diagnostics or serialized contracts. Adjacent
// text/run leaves stay one source segment; generated operand roles separate
// arguments rather than concealing an authored Name/value field in prose.
const SOURCE_END='\0e\0', SOURCE_MARKERS=/\0(?:s[0-9]+|e)\0/gu;
const results = new WeakSet(),sourceScopes=new WeakMap();
function source(value,scope) { const text=escape(value); return text ? '\0s'+scope+'\0'+text+SOURCE_END : ''; }
function bounded(parts) {
  const n=parts.reduce((sum,part)=>sum+part.replace(SOURCE_MARKERS,'').length,0);
  if(n>LIMITS.output)throw failure(true);return parts.join('');
}
function sourceSegments(tagged) {
  const chunks=[];let source=null,cursor=0;
  function append(value) {
    if(!value)return;
    const kind=source!==null?'source':'generated',last=chunks.at(-1);
    if(last?.kind===kind&&last.scope===source)last.parts.push(value);else chunks.push({kind,scope:source,parts:[value]});
  }
  while(cursor<tagged.length){
    const next=tagged.indexOf('\0',cursor);
    if(next<0){append(tagged.slice(cursor));cursor=tagged.length;break;}
    append(tagged.slice(cursor,next));
    const end=tagged.indexOf('\0',next+1);if(end<0)throw failure();
    const marker=tagged.slice(next+1,end);
    if(/^s(?:0|[1-9][0-9]*)$/u.test(marker)&&source===null){
      source=Number(marker.slice(1));if(!Number.isSafeInteger(source)||source>LIMITS.nodes*2)throw failure();
    }
    else if(marker==='e'&&source!==null)source=null;
    else throw failure();
    cursor=end+1;
  }
  if(source!==null)throw failure();
  const segments=Object.freeze(chunks.map(item=>Object.freeze({kind:item.kind,text:rawProjection(item.parts.join(''))})));
  const text=tagged.replace(SOURCE_MARKERS,'');safe(text);
  const rawText=rawProjection(text);
  if(segments.map(item=>item.text).join('')!==rawText)throw failure();
  return {text,rawText,segments,scopes:Object.freeze(chunks.map(item=>item.scope))};
}
function decodeXml(value) {
  safe(value);
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/u.test(value)) throw failure();
  const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gu, (_match, key) => {
    if (key[0] !== '#') return names[key];
    const cp = Number.parseInt(key.slice(key[1] === 'x' ? 2 : 1), key[1] === 'x' ? 16 : 10);
    if (!Number.isSafeInteger(cp) || cp > 0x10ffff) throw failure();
    return safe(String.fromCodePoint(cp));
  });
}
function createOfficeMathCollector() {
  // Node/parent/attribute identity comes from the existing readXml reader.
  const inactive = new WeakSet(), alternatives = new WeakMap(), owned = new WeakSet();
  const stack = []; let root = null, nodes = 0, textChars = 0, cells = 0;
  function active(node) { return !inactive.has(node); }
  function start(node) {
    if (!node || typeof node !== 'object' || !(node.attributes instanceof Map) || !(node.namespaces instanceof Map)) throw failure();
    if (root) owned.add(node);
    if (node.parent && inactive.has(node.parent)) { inactive.add(node); return false; }
    if (node.namespaceURI === MC) {
      if (node.localName === 'AlternateContent') alternatives.set(node, { selected: false, fallback: false, choices: 0 });
      else if (['Choice','Fallback'].includes(node.localName)) {
        const state = alternatives.get(node.parent); if (!state) throw failure();
        if (node.localName === 'Fallback') {
          if (state.fallback || !state.choices) throw failure(); state.fallback = true;
        } else if (state.fallback) throw failure(); else state.choices++;
        const requires = (node.attributes.get('{}Requires') || '').trim().split(/[ \t\r\n]+/u).filter(Boolean);
        if (node.localName === 'Choice' && (!requires.length || requires.length > 32 || requires.some(p => !/^[A-Za-z_][\w.-]*$/u.test(p)))) throw failure();
        const usable = node.localName === 'Fallback' || requires.every(prefix => UNDERSTOOD.has(node.namespaces.get(prefix)));
        if (state.selected || !usable) { inactive.add(node); return false; } state.selected = true;
      }
    }
    if (!root) {
      if (!M.has(node.namespaceURI) || !ROOTS.has(node.localName)) return false;
      root = node; nodes = textChars = cells = 0; owned.add(node);
    }
    if (++nodes > LIMITS.nodes || stack.length >= LIMITS.depth) throw failure(true);
    if (stack.length && node.parent !== stack.at(-1).node) throw failure();
    const frame = { node, parts: [] }; stack.at(-1)?.parts.push(frame); stack.push(frame); return true;
  }
  function text(value, node) {
    if (!root || !active(node)) return;
    safe(value); textChars += value.length; if (textChars > LIMITS.text) throw failure(true);
    if (stack.at(-1)?.node !== node) throw failure(); stack.at(-1).parts.push(value);
  }
  function end(node) {
    if (!active(node)) return null;
    if (node.namespaceURI === MC && node.localName === 'AlternateContent') {
      const state = alternatives.get(node); if (!state?.selected) throw failure();
    }
    if (!root) return null;
    if (stack.at(-1)?.node !== node) throw failure();
    const frame = stack.pop(); if (node !== root) return null;
    root = null; const reasons = new Set();
    const partial = () => reasons.add('OFFICE_MATH_UNSUPPORTED');
    const math = f => M.has(f.node.namespaceURI);
    const parentOf = node => {
      let parent=node.parent;
      while(parent?.namespaceURI===MC&&['AlternateContent','Choice','Fallback'].includes(parent.localName))parent=parent.parent;
      return parent;
    };
    const children = f => f.parts.filter(p => typeof p !== 'string');
    const raw = f => f.parts.filter(p => typeof p === 'string').join('');
    const checkWhitespace = f => { if (raw(f).trim()) throw failure(); };
    function flattened(f) {
      checkWhitespace(f); const out = [];
      for (const child of children(f)) {
        if (child.node.namespaceURI === MC && ['AlternateContent','Choice','Fallback'].includes(child.node.localName)) out.push(...flattened(child));
        else out.push(child);
      } return out;
    }
    function val(f) {
      const values = MATH_NAMESPACES.map(ns => f.node.attributes.get(`{${ns}}val`)).filter(v => v !== undefined);
      if (values.length > 1) throw failure();
      if(!values.length){
        if(['degHide','grow','subHide','supHide','alnScr'].includes(f.node.localName))return '1';
        if(['chr','begChr','endChr','sepChr'].includes(f.node.localName))return '';
        throw failure();
      }
      return safe(values[0]);
    }
    function properties(f, allowed) {
      const result = new Map(); if (!f) return result;
      checkWhitespace(f);
      for (const p of flattened(f)) {
        if (!math(p)) { propertyMetadata(p); continue; }
        const key = p.node.localName;
        if (key === 'ctrlPr') { propertyMetadata(p); continue; }
        if (!allowed.has(key)) { partial(); propertyMetadata(p); continue; }
        if (result.has(key) || children(p).length || raw(p).trim()) throw failure();
        result.set(key, val(p));
      }
      return result;
    }
    function propertyMetadata(f) {
      // Formatting is not equation content. A source text node in properties
      // is not formatting and must never silently disappear.
      if (raw(f).trim() || (math(f) && f.node.localName === 't') || (W.has(f.node.namespaceURI) && f.node.localName === 't')) throw failure();
      if(math(f)&&!PR.has(f.node.localName)&&!FORMAT.has(f.node.localName))partial();
      for (const child of children(f)) propertyMetadata(child);
    }
    function flag(value, fallback = false) {
      if (value === undefined) return fallback;
      if (['1','true','on'].includes(value)) return true;
      if (['0','false','off'].includes(value)) return false;
      throw failure();
    }
    function symbol(value, fallback, empty = false) {
      const s = value === undefined ? fallback : value;
      if (typeof s !== 'string' || [...s].length > 1 || (!empty && !s)) throw failure(); return escape(s);
    }
    function layout(f, property, spec) {
      const fields = new Map(), extras = []; let pr = null, data = false, rank = -1;
      for (const child of flattened(f)) {
        const key = math(child) ? child.node.localName : '';
        if (key === property) { if (pr || data) throw failure(); pr = child; continue; }
        data = true;
        if (Object.hasOwn(spec, key)) {
          const current = Object.keys(spec).indexOf(key); if(current < rank)throw failure();rank=current;
          const list = fields.get(key) || []; list.push(child); fields.set(key, list);
          if (list.length > spec[key][1]) throw failure(spec[key][1]>1);
        } else { partial(); extras.push(child); }
      }
      for (const [key,[min]] of Object.entries(spec)) if ((fields.get(key)?.length || 0) < min) throw failure();
      return { pr, fields, extras };
    }
    const wrapped = (role, value) => bounded([role, ' (\n', value, '\n)']);
    let renderScope=0,renderGroup=0,nextRenderScope=0,nextRenderGroup=0;
    const scopeParents=[null],groupScopes=[0];
    function render(f) {
      // Only actual argument/zone structure separates source scopes. Unknown
      // wrappers and formatting do not sever Name: from a following value.
      // Returning from an argument starts a fresh surrounding run scope too;
      // it cannot bridge across a different numerator/denominator operand.
      const boundary=math(f)&&(ARGS.has(f.node.localName)||f.node.localName==='oMath'&&
        M.has(parentOf(f.node)?.namespaceURI)&&parentOf(f.node).localName==='oMathPara');
      const parentScope=renderScope;
      if(boundary){
        renderScope=++nextRenderScope;scopeParents[renderScope]=parentScope;
        renderGroup=++nextRenderGroup;groupScopes[renderGroup]=renderScope;
      }
      const value=renderNode(f);
      if(boundary){renderScope=parentScope;renderGroup=++nextRenderGroup;groupScopes[renderGroup]=renderScope;}
      return value;
    }
    function renderNode(f) {
      const ns = f.node.namespaceURI, key = f.node.localName;
      if (ns === MC && ['AlternateContent','Choice','Fallback'].includes(key)) return bounded(flattened(f).map(render));
      if (math(f) && key === 't') {
        const parent=parentOf(f.node);if (!M.has(parent?.namespaceURI) || parent.localName !== 'r' || children(f).length) throw failure();
        return source(raw(f),renderGroup);
      }
      if (W.has(ns) && ['t','br','cr','tab','noBreakHyphen','softHyphen'].includes(key)) {
        const parent=parentOf(f.node);if (!M.has(parent?.namespaceURI) || parent.localName !== 'r' || children(f).length) throw failure();
        return source(key === 't' ? raw(f) : ['br','cr'].includes(key) ? '\n' : key === 'tab' ? ' ' : key === 'noBreakHyphen' ? '‑' : '\u00ad',renderGroup);
      }
      if((W.has(ns)||A.has(ns))&&key==='rPr'&&M.has(parentOf(f.node)?.namespaceURI)&&parentOf(f.node).localName==='r'){propertyMetadata(f);return '';}
      if (!math(f)) { partial(); return wrapped('Nicht unterstützter Formelinhalt', bounded(f.parts.map(p => typeof p === 'string' ? source(p,renderGroup) : render(p)))); }
      if (PR.has(key)) {
        const parent=parentOf(f.node);
        const expected=key==='rPr'?['r']:key==='argPr'?[...ARGS]:key==='ctrlPr'?[...PR]:[key.slice(0,-2)];
        if(!M.has(parent?.namespaceURI)||!expected.includes(parent.localName))throw failure();
        propertyMetadata(f); return '';
      }
      if (ARGS.has(key) || ROOTS.has(key) || key === 'r') {
        if (ARGS.has(key)) {
          const parent = parentOf(f.node); if (!M.has(parent?.namespaceURI) || !ARG_OWNERS[key].includes(parent.localName)) throw failure();
        }
        const list = flattened(f);
        if (key === 'oMathPara' && list.some(p => !math(p) || !['oMath','oMathParaPr'].includes(p.node.localName))) throw failure();
        if (key === 'r' && list.some(p => math(p) && !['rPr','t'].includes(p.node.localName))) throw failure();
        const texts = list.map(render), content=bounded(key === 'oMathPara' ? texts.filter(Boolean).flatMap((s,i)=>i?['\n',s]:[s]) : texts);
        // Native source field labels/names must not be hidden inside generated
        // role punctuation before privacy. Table projections must also retain
        // these boundaries rather than flattening this result to prose.
        return ARGS.has(key)?bounded(['\n',content,'\n']):content;
      }
      const schemas = {
        f: ['fPr',{num:[1,1],den:[1,1]}], rad:['radPr',{deg:[1,1],e:[1,1]}],
        sSub:['sSubPr',{e:[1,1],sub:[1,1]}], sSup:['sSupPr',{e:[1,1],sup:[1,1]}],
        sSubSup:['sSubSupPr',{e:[1,1],sub:[1,1],sup:[1,1]}], sPre:['sPrePr',{sub:[1,1],sup:[1,1],e:[1,1]}],
        nary:['naryPr',{sub:[1,1],sup:[1,1],e:[1,1]}], limLow:['limLowPr',{e:[1,1],lim:[1,1]}],
        limUpp:['limUppPr',{e:[1,1],lim:[1,1]}], d:['dPr',{e:[1,64]}], func:['funcPr',{fName:[1,1],e:[1,1]}],
        acc:['accPr',{e:[1,1]}], bar:['barPr',{e:[1,1]}], groupChr:['groupChrPr',{e:[1,1]}],
        m:['mPr',{mr:[1,LIMITS.rows]}], mr:[null,{e:[1,LIMITS.columns]}], eqArr:['eqArrPr',{e:[1,LIMITS.rows]}],
        box:['boxPr',{e:[1,1]}], borderBox:['borderBoxPr',{e:[1,1]}], phant:['phantPr',{e:[1,1]}]
      };
      if (!Object.hasOwn(schemas,key)) { partial(); return wrapped('Nicht unterstützte Formelstruktur', bounded(f.parts.map(p => typeof p === 'string' ? source(p,renderGroup) : render(p)))); }
      if(key==='mr'&&(!M.has(parentOf(f.node)?.namespaceURI)||parentOf(f.node).localName!=='m'))throw failure();
      const [property,spec] = schemas[key], model = layout(f,property,spec), one = name => render(model.fields.get(name)[0]), many = name => model.fields.get(name).map(render);
      let result;
      if (key === 'f') {
        const p=properties(model.pr,new Set(['type'])),type=p.get('type')||'bar';
        if (!['bar','skw','lin','noBar'].includes(type)) { partial(); }
        result=bounded([type==='noBar'?'Bruch ohne Bruchstrich':'Bruch',' (Zähler: (',one('num'),'); Nenner: (',one('den'),'))']);
      } else if (key === 'rad') {
        const p=properties(model.pr,new Set(['degHide'])),hidden=flag(p.get('degHide'));
        result=bounded(['Wurzel (Grad',hidden?' im Original ausgeblendet':'',': (',one('deg'),'); Radikand: (',one('e'),'))']);
      } else if (['sSub','sSup','sSubSup','sPre'].includes(key)) {
        const p=properties(model.pr,new Set(['alnScr']));flag(p.get('alnScr'));
        result=bounded([key==='sPre'?'Vorindex':'Index',' (Basis: (',one('e'),')',...(model.fields.has('sub')?['; tief: (',one('sub'),')']:[]),...(model.fields.has('sup')?['; hoch: (',one('sup'),')']:[]),')']);
      } else if (key === 'nary') {
        const p=properties(model.pr,new Set(['chr','limLoc','grow','subHide','supHide']));flag(p.get('grow'));
        if (p.has('limLoc')&&!['subSup','undOvr'].includes(p.get('limLoc')))throw failure();
        result=bounded(['N-ärer Operator ',p.get('chr')===''?'ohne sichtbares Zeichen':symbol(p.get('chr'),'∫'),' (Untergrenze',flag(p.get('subHide'))?' im Original ausgeblendet':'',': (',one('sub'),'); Obergrenze',flag(p.get('supHide'))?' im Original ausgeblendet':'',': (',one('sup'),'); Operand: (',one('e'),'))']);
      } else if (['limLow','limUpp'].includes(key)) {
        properties(model.pr,new Set());result=bounded([key==='limLow'?'Unteres Limit':'Oberes Limit',' (Basis: (',one('e'),'); Limit: (',one('lim'),'))']);
      } else if (key === 'd') {
        const p=properties(model.pr,new Set(['begChr','endChr','sepChr','grow','shp']));flag(p.get('grow'));
        if(p.has('shp')&&!['centered','match'].includes(p.get('shp')))throw failure();
        const values=many('e'),separator=symbol(p.get('sepChr'),'|',true);
        result=bounded(['Klammerung (',symbol(p.get('begChr'),'(',true),...values.flatMap((s,i)=>i?[separator,s]:[s]),symbol(p.get('endChr'),')',true),')']);
      } else if (key === 'func') {
        properties(model.pr,new Set());result=bounded(['Funktion (Name: (',one('fName'),'); Argument: (',one('e'),'))']);
      } else if (['acc','bar','groupChr'].includes(key)) {
        const p=properties(model.pr,new Set(key==='acc'?['chr']:key==='bar'?['pos']:['chr','pos','vertJc']));
        if(p.has('pos')&&!['top','bot'].includes(p.get('pos')))throw failure();
        if(p.has('vertJc')&&!['top','bot'].includes(p.get('vertJc')))throw failure();
        result=bounded([key==='acc'?'Akzent':key==='bar'?'Balken':'Gruppenzeichen',' (',p.has('chr')?(p.get('chr')===''?'ohne sichtbares Zeichen':symbol(p.get('chr'),'')):(key==='acc'?'◌̂':'Standard'),p.has('pos')?`; Position: ${p.get('pos')}`:'',p.has('vertJc')?`; Ausrichtung: ${p.get('vertJc')}`:'','; Basis: (',one('e'),'))']);
      } else if (key === 'm') {
        if(model.pr)propertyMetadata(model.pr);
        const rows=model.fields.get('mr'),lengths=rows.map(row=>flattened(row).filter(c=>math(c)&&c.node.localName==='e').length);
        if(new Set(lengths).size>1)partial();
        result=bounded(['Matrix (',...rows.flatMap((row,i)=>[i?'; ':'',`Zeile ${i+1}: (`,render(row),')']),')']);
      } else if (key === 'mr') {
        cells+=model.fields.get('e').length;if(cells>LIMITS.cells)throw failure(true);
        result=bounded(many('e').flatMap((s,i)=>[i?'; ':'',`Spalte ${i+1}: (`,s,')']));
      } else if (key === 'eqArr') {
        if(model.pr)propertyMetadata(model.pr);result=bounded(['Gleichungsfolge (',...many('e').flatMap((s,i)=>[i?'; ':'',`Zeile ${i+1}: (`,s,')']),')']);
      } else {
        if(model.pr)propertyMetadata(model.pr);
        if(['phant','borderBox'].includes(key))partial();
        result=wrapped(key==='phant'?'Phantominhalt (Sichtbarkeit im Original eigenschaftsabhängig)':key==='borderBox'?'Umrahmung (Strichdarstellung nicht vollständig modelliert)':'Formelbox',one('e'));
      }
      return model.extras.length?bounded([result,'; Nicht modellierter Zusatz: (',...model.extras.map(render),')']):result;
    }
    const projected=sourceSegments(render(frame));
    const result=Object.freeze({text:projected.text,rawText:projected.rawText,segments:projected.segments,
      complete: reasons.size===0, unsupported: reasons.size>0, reasons:Object.freeze([...reasons]) });
    results.add(result);sourceScopes.set(result,Object.freeze({groups:projected.scopes,
      scopes:Object.freeze(groupScopes),parents:Object.freeze(scopeParents)}));return result;
  }
  return Object.freeze({ start, text, end, owns: node => owned.has(node) });
}
function readOfficeMath(source) {
  if (Buffer.isBuffer(source)) {
    if(source.length>LIMITS.bytes)throw failure(true);
    try { source=new TextDecoder('utf-8',{fatal:true}).decode(source); } catch { throw failure(); }
  }
  if(typeof source!=='string')throw failure();
  if(Buffer.byteLength(source,'utf8')>LIMITS.bytes)throw failure(true);
  const collector=createOfficeMathCollector();let result;
  const root=readXml(source,{decode:decodeXml,error:failure,start:collector.start,text:collector.text,end(node){const value=collector.end(node);if(value){if(result)throw failure();result=value;}}});
  if(!M.has(root.namespaceURI)||!ROOTS.has(root.localName)||!result)throw failure();return result;
}
// A private in-process identity, not a wire/source marker or a caller-supplied
// "verified" field. Projection cannot invent source provenance from a forged
// result or a JSON copy. Actual paragraph spans keep this exact reader object.
const isOfficeMathResult=value=>Boolean(value&&typeof value==='object'&&results.has(value));
const officeMathSourceScopes=value=>isOfficeMathResult(value)?sourceScopes.get(value):undefined;
module.exports=Object.freeze({createOfficeMathCollector,readOfficeMath,isOfficeMathResult,officeMathSourceScopes,MATH_NAMESPACES,LIMITS});
