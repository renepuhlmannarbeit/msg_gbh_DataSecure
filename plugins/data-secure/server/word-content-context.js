'use strict';

// Parser-private Word context, not a package/relationship admission or a wire
// capability. Consumers retain actual paragraph/cell ownership and run the
// ordinary Markdown/source/privacy/trace gates after projection. No field code,
// formula, DDE, INCLUDETEXT, macro, URL or external resolver is ever evaluated.
const { readXml, assertXmlCharacters } = require('./xml-reader');
const { types } = require('node:util');
const WORD_NAMESPACES = Object.freeze(['http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main']);
const W = new Set(WORD_NAMESPACES), MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const LIMITS = Object.freeze({ xml: 8000000, nodes: 200000, storyNodes: 1000000, definitions: 10000, styles: 20000,
  levels: 9, depth: 128, styleDepth: 32, fields: 10000, comments: 10000, counter: 2147483647, prefix: 4096 });
const models = new WeakMap(), commentModels = new WeakMap();
function failure(limit = false) { const code = limit ? 'DOCX_STRUCTURE_LIMIT' : 'DOCX_STRUCTURE_UNSAFE';
  return Object.assign(new Error(code), { code }); }
function safe(value) { assertXmlCharacters(value, failure); return value; }
function decode(value) {
  safe(value);
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/u.test(value)) throw failure();
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gu, (_all, key) => {
    if (key[0] !== '#') return ({ amp:'&',lt:'<',gt:'>',quot:'"',apos:"'" })[key];
    const cp = Number.parseInt(key.slice(key[1] === 'x' ? 2 : 1), key[1] === 'x' ? 16 : 10);
    if (!Number.isSafeInteger(cp) || cp > 0x10ffff) throw failure();
    return safe(String.fromCodePoint(cp));
  });
}
function is(node, name) { return Boolean(node && W.has(node.namespaceURI) && node.localName === name); }
function attr(node, name) { return Map.prototype.get.call(node.attributes,`{${node.namespaceURI}}${name}`); }
function integer(value, max = LIMITS.counter) {
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || value < 0 || value > max) throw failure(); return value; }
  if (typeof value !== 'string' || !/^\+?[0-9]{1,32}$/u.test(value)) throw failure();
  const n = BigInt(value); if (n > BigInt(max)) throw failure(true); return Number(n);
}
function id(value) { return String(integer(value)); }
function startInteger(value) {
  if(typeof value!=='string'||!/^[-+]?[0-9]{1,32}$/u.test(value))throw failure();
  const n=BigInt(value);if(n>BigInt(LIMITS.counter)||n<BigInt(-LIMITS.counter))throw failure(true);return Number(n);
}
function commentId(value) {
  if (typeof value !== 'string' || !/^[+-]?[0-9]{1,32}$/u.test(value)) throw failure();
  return String(BigInt(value));
}
function record(value, keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const d = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(d).some(k => typeof k !== 'string' || !keys.includes(k) || !Object.hasOwn(d[k], 'value'))) throw failure();
  return Object.fromEntries(Object.entries(d).map(([k,v]) => [k,v.value]));
}
function children(node, name) { return node.children.filter(n => is(n, name)); }
function one(node, name) { const found = children(node, name); if (found.length > 1) throw failure(); return found[0]; }
function value(node, name) { const child = one(node, name); if(child)leaf(child); return child ? attr(child, 'val') : undefined; }
function leaf(node) { if (node.children.length || /\S/u.test(node.text)) throw failure(); }

// Definition parts are small bounded trees. MC choices requiring an unknown
// namespace never become numbering/style authority; only the actual fallback
// (or an understood Word branch) is retained. No ordinary story is tree-copied.
function readDefinitionTree(xml, rootName, contentMath = false) {
  if (typeof xml !== 'string') throw failure();
  if (xml.length > LIMITS.xml) throw failure(true);
  let root, count = 0; const active = new WeakMap(), selected = new WeakMap(), trees = new WeakMap();
  readXml(xml, { decode, error: failure, start(node) {
    if (++count > LIMITS.nodes) throw failure(true);
    let enabled = !node.parent || active.get(node.parent) === true;
    if (node.namespaceURI === MC) {
      if (node.localName === 'AlternateContent') selected.set(node, { chosen:false, fallback:false, choices:0 });
      else if (['Choice','Fallback'].includes(node.localName)) {
        const state = selected.get(node.parent); if (!state || state.fallback) throw failure();
        let understood = node.localName === 'Fallback';
        if (understood) { if (!state.choices) throw failure(); state.fallback = true; }
        else { state.choices++; const req = (node.attributes.get('{}Requires') || '').trim().split(/\s+/u).filter(Boolean);
          if (!req.length || req.some(x => !/^[A-Za-z_][\w.-]*$/u.test(x))) throw failure();
          understood = req.every(x => W.has(node.namespaces.get(x))||(contentMath&&[
            'http://schemas.openxmlformats.org/officeDocument/2006/math','http://purl.oclc.org/ooxml/officeDocument/math'].includes(node.namespaces.get(x)))); }
        enabled &&= !state.chosen && understood; if (enabled) state.chosen = true;
      } else throw failure();
      active.set(node, enabled); return;
    }
    if (node.parent?.namespaceURI === MC && node.parent.localName === 'AlternateContent') throw failure();
    active.set(node, enabled); if (!enabled) return;
    let parent = node.parent; while (parent?.namespaceURI === MC) parent = parent.parent;
    const item = { ...node, children:[], text:'' }; trees.set(node, item);
    if (!parent) { if (root || !is(node, rootName)) throw failure(); root = item; }
    else { const owner = trees.get(parent); if (!owner) throw failure(); owner.children.push(item); }
  }, text(text, node) { if (active.get(node) && trees.has(node)) trees.get(node).text += text; },
  end(node) { if (active.get(node) && node.namespaceURI === MC && node.localName === 'AlternateContent' &&
      !selected.get(node)?.chosen) throw failure(); } });
  if (!root) throw failure(); return root;
}
function numPr(node) {
  if (!node) return {}; const result = {};
  for (const n of node.children) {
    if (is(n,'numId')) { leaf(n); if (result.numId !== undefined) throw failure(); result.numId = id(attr(n,'val')); }
    else if (is(n,'ilvl')) { leaf(n); if (result.ilvl !== undefined) throw failure(); result.ilvl = integer(attr(n,'val'),8); }
    else result.unmodeled = true;
  }
  if (/\S/u.test(node.text)) throw failure(); return result;
}
function readLevel(node) {
  const index = integer(attr(node,'ilvl'),8), fields = new Set(), result = { index, start:0, restart:index ? index : 0,
    format:'decimal', template:undefined, suffix:'tab', pStyle:undefined, legal:false, unmodeled:false };
  for (const n of node.children) {
    if (!W.has(n.namespaceURI)) { result.unmodeled = true; continue; }
    const name = n.localName;
    if (fields.has(name)) throw failure(); fields.add(name);
    if (['pPr','rPr','lvlJc','legacy','tentative','tplc'].includes(name)) {
      // Formatting does not grant a list counter; legacy indentation/spacing is
      // not rendered. Picture bullets and unknown payload stay explicit below.
      if (name === 'legacy') result.unmodeled = true;
      continue;
    }
    leaf(n); const val = attr(n,'val');
    if (name === 'start') result.start = startInteger(val);
    else if (name === 'lvlRestart') { const r=integer(val,9); if (r <= index) result.restart=r; }
    else if (name === 'numFmt') result.format = val;
    else if (name === 'lvlText') {
      const nul = attr(n,'null');
      if (nul !== undefined && !['1','true','on','0','false','off'].includes(nul)) throw failure();
      result.template = ['1','true','on'].includes(nul) ? '' : val;
      if (typeof result.template !== 'string') throw failure(); safe(result.template);
      if (result.template.length > LIMITS.prefix) throw failure(true);
    } else if (name === 'suff') { if (!['tab','space','nothing'].includes(val)) throw failure(); result.suffix=val; }
    else if (name === 'pStyle') { if (typeof val !== 'string' || !val || val.length > 253) throw failure(); result.pStyle=val; }
    else if (name === 'isLgl') { if (val !== undefined && !['1','true','on','0','false','off'].includes(val)) throw failure();
      result.legal=!['0','false','off'].includes(val); }
    else result.unmodeled=true;
  }
  if (/\S/u.test(node.text)) throw failure(); return result;
}
function readWordNumbering(numberingXml, stylesXml) {
  const abstracts = new Map(), nums = new Map(), styles = new Map();
  if (stylesXml !== undefined && stylesXml !== null) {
    const tree=readDefinitionTree(stylesXml,'styles');
    for (const node of tree.children) if (is(node,'style')) {
      if (styles.size >= LIMITS.styles) throw failure(true);
      const styleId=attr(node,'styleId'), type=attr(node,'type');
      if (!styleId || styleId.length>253 || styles.has(styleId)) throw failure();
      const based=value(node,'basedOn'), p=one(node,'pPr');
      styles.set(styleId,{type,based,pr:numPr(p && one(p,'numPr'))});
    }
  }
  if (numberingXml !== undefined && numberingXml !== null) {
    const tree=readDefinitionTree(numberingXml,'numbering');
    for (const node of tree.children) {
      if (is(node,'abstractNum')) {
        if (abstracts.size >= LIMITS.definitions) throw failure(true);
        const key=id(attr(node,'abstractNumId')); if (abstracts.has(key)) throw failure();
        const levels=new Map(); for(const n of children(node,'lvl')) { const level=readLevel(n);
          if(levels.has(level.index))throw failure(); levels.set(level.index,level); }
        abstracts.set(key,{levels,link:value(node,'numStyleLink'),unmodeled:node.children.some(n =>
          !W.has(n.namespaceURI) || !['lvl','nsid','multiLevelType','tmpl','name','styleLink','numStyleLink'].includes(n.localName))});
      } else if (is(node,'num')) {
        if(nums.size>=LIMITS.definitions)throw failure(true);
        const key=id(attr(node,'numId')); if(key==='0'||nums.has(key))throw failure();
        const abstract=id(value(node,'abstractNumId')), overrides=new Map();
        for(const over of children(node,'lvlOverride')) {
          const index=integer(attr(over,'ilvl'),8); if(overrides.has(index))throw failure();
          const lv=one(over,'lvl'), start=value(over,'startOverride');
          if(over.children.some(n=>!is(n,'lvl')&&!is(n,'startOverride'))||/\S/u.test(over.text))throw failure();
          const level=lv?readLevel(lv):undefined; if(level&&level.index!==index)throw failure();
          overrides.set(index,{level,start:start===undefined?undefined:startInteger(start)});
        }
        if(node.children.some(n=>!is(n,'abstractNumId')&&!is(n,'lvlOverride'))||/\S/u.test(node.text))throw failure();
        nums.set(key,{abstract,overrides});
      } else if (!is(node,'numIdMacAtCleanup') && !is(node,'numPicBullet')) throw failure();
    }
  }
  const token=Object.freeze({}); models.set(token,{abstracts,nums,styles}); return token;
}
function formatNumber(n, format) {
  if(format==='decimal')return String(n);
  if(format==='decimalZero')return String(n).padStart(2,'0');
  if(format==='none')return '';
  if(['upperLetter','lowerLetter'].includes(format)) {
    if(n<1)return null; let out=''; while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}
    return format==='lowerLetter'?out.toLowerCase():out;
  }
  if(['upperRoman','lowerRoman'].includes(format)) {
    if(n<1||n>3999)return null; let out='';
    for(const [v,s] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])
      while(n>=v){out+=s;n-=v;}
    return format==='lowerRoman'?out.toLowerCase():out;
  }
  return null;
}
function createWordNumberingSession(model) {
  const data=models.get(model); if(!data)throw failure(); const counters=new Map(), styleCache=new Map(); let paragraphs=0;
  function style(name, seen=new Set()) {
    if(name===undefined)return {chain:[],pr:{}};
    if(typeof name!=='string'||!name||name.length>253)throw failure();
    if(styleCache.has(name))return styleCache.get(name);
    if(seen.has(name)||seen.size>=LIMITS.styleDepth)throw failure(); seen.add(name);
    const own=data.styles.get(name); if(!own)return {chain:[name],pr:{},unmodeled:true};
    const parent=own.based===undefined?{chain:[],pr:{}}:style(own.based,seen);
    const result={chain:[name,...parent.chain],pr:{...parent.pr,...own.pr},unmodeled:parent.unmodeled||own.pr.unmodeled,type:own.type};
    styleCache.set(name,result);return result;
  }
  function definition(numId, seen=new Set()) {
    if(seen.has(numId)||seen.size>=LIMITS.styleDepth)throw failure();seen.add(numId);
    const num=data.nums.get(numId), abs=num&&data.abstracts.get(num.abstract);
    if(!num||!abs)return null;
    let base={levels:new Map(abs.levels),abstract:num.abstract,links:[],unmodeled:abs.unmodeled};
    if(abs.link!==undefined) {
      const s=style(abs.link); if(s.type!=='numbering'||s.unmodeled||s.pr.numId===undefined||s.pr.numId==='0')return null;
      const linked=definition(s.pr.numId,seen);if(!linked)return null;
      base={...linked,levels:new Map(linked.levels),links:[abs.link,...linked.links],unmodeled:linked.unmodeled||abs.levels.size>0||abs.unmodeled};
    }
    for(const [index,override]of num.overrides) {
      const lv=override.level||base.levels.get(index); if(!lv){base.unmodeled=true;continue;}
      base.levels.set(index,{...lv,start:override.start===undefined?lv.start:override.start});
    }
    return base;
  }
  function next(input={}) {
    if(++paragraphs>LIMITS.nodes)throw failure(true);
    const own=record(input,['numId','ilvl','pStyle']), s=style(own.pStyle);
    const numId=own.numId===undefined?s.pr.numId:id(own.numId);
    const unavailable=binding=>{
      if(binding.numId&&binding.numId!=='0') {
        const old=counters.get(binding.numId)||{values:Array(9).fill(undefined)};
        counters.set(binding.numId,{...old,tainted:true});
      }
      return Object.freeze({prefix:'',complete:false,reasons:Object.freeze(['WORD_NUMBERING_UNMODELED']),binding:Object.freeze(binding)});
    };
    if(numId===undefined)return s.unmodeled||own.ilvl!==undefined?unavailable({pStyle:own.pStyle??null}):Object.freeze({prefix:'',complete:true,reasons:Object.freeze([]),binding:null});
    if(numId==='0')return Object.freeze({prefix:'',complete:true,reasons:Object.freeze([]),binding:Object.freeze({numId,removed:true,pStyle:own.pStyle??null})});
    const d=definition(numId), explicitLevel=own.ilvl===undefined?undefined:integer(own.ilvl,8);
    if(!d||s.unmodeled)return unavailable({numId,pStyle:own.pStyle??null});
    let level=explicitLevel;
    // A style numPr ilvl is explicitly ignored by OOXML. Use the nearest exact
    // pStyle association of this actual abstract definition, never style names
    // like List/Heading as a lexical numbering heuristic.
    if(level===undefined&&own.pStyle!==undefined)for(const styleId of s.chain) {
      const matches=[...d.levels.values()].filter(lv=>lv.pStyle===styleId);
      if(matches.length>1)return unavailable({numId,pStyle:own.pStyle});
      if(matches.length){level=matches[0].index;break;}
    }
    level??=0;const lv=d.levels.get(level), binding={numId,abstractNumId:d.abstract,ilvl:level,pStyle:own.pStyle??null,
      styleChain:Object.freeze(s.chain.slice()),numberingStyleChain:Object.freeze(d.links.slice())};
    if(!lv||d.unmodeled||lv.unmodeled||lv.template===undefined)return unavailable(binding);
    // A later unresolved occurrence of this list poisons its counter continuity.
    const state=counters.get(numId)||{values:Array(9).fill(undefined),tainted:false};
    const val=state.values[level]===undefined?lv.start:state.values[level]+1;
    if(val>LIMITS.counter)throw failure(true);
    const values=state.values.slice();values[level]=val;
    let prefix='',unknown=state.tainted;
    // Unseen ancestor counters are not guessed from a start value.
    if(lv.format==='bullet')prefix=lv.template;
    else prefix=lv.template.replace(/%([1-9])/gu,(_all,index)=>{
      const at=Number(index)-1;
      if(at>level){unknown=true;return '';}
      const referenced=d.levels.get(at), number=values[at];
      const rendered=number===undefined||!referenced?null:formatNumber(number,lv.legal?'decimal':referenced.format);
      if(rendered===null){unknown=true;return '';}return rendered;
    });
    // An unknown format is unsupported even with a literal-only level string.
    if(lv.format!=='bullet'&&formatNumber(val,lv.format)===null)unknown=true;
    // A font-coded private-use list glyph is not a proven readable Unicode
    // bullet. This helper has no independently bound font/glyph renderer;
    // withhold that generated prefix rather than guessing a replacement.
    // Ordinary source text and genuine Unicode bullets are not filtered.
    if(/\p{Co}/u.test(prefix))unknown=true;
    if(prefix.length>LIMITS.prefix)throw failure(true);
    for(let at=level+1;at<9;at++)if(d.levels.get(at)?.restart===level+1)values[at]=undefined;
    counters.set(numId,{values,tainted:unknown});
    if(unknown)return unavailable(binding);
    prefix+=lv.suffix==='tab'?'\t':lv.suffix==='space'?' ':'';
    return Object.freeze({prefix,complete:true,reasons:Object.freeze([]),binding:Object.freeze({...binding,
      counter:val,start:lv.start,restartAfterLevel:lv.restart?lv.restart-1:null,format:lv.format,template:lv.template,suffix:lv.suffix})});
  }
  return Object.freeze({next});
}

function readWordCommentMetadata(xml, options = {}) {
  const config=record(options,['contentMath']);if(config.contentMath!==undefined&&typeof config.contentMath!=='boolean')throw failure();
  const defs=new Map();
  if(xml!==undefined&&xml!==null) {
    const tree=readDefinitionTree(xml,'comments',config.contentMath===true);
    for(const node of tree.children) {
      if(!is(node,'comment'))throw failure(); if(defs.size>=LIMITS.comments)throw failure(true);
      const key=commentId(attr(node,'id'));if(defs.has(key))throw failure();
      const author=attr(node,'author'),initials=attr(node,'initials'),date=attr(node,'date');
      for(const v of [author,initials,date])if(v!==undefined){safe(v);if(v.length>LIMITS.xml)throw failure(true);}
      defs.set(key,Object.freeze({id:key,author:author??null,initials:initials??null,date:date??null,node}));
    }
  }
  const token=Object.freeze({});commentModels.set(token,defs);return token;
}
const REVISION_PROPERTIES=new Set(['pPrChange','rPrChange','sectPrChange','tblGridChange','tblPrChange','tblPrExChange','trPrChange','tcPrChange','numberingChange']);
const UNSUPPORTED_REVISIONS=new Set(['cellIns','cellDel','cellMerge','moveFromRangeStart','moveFromRangeEnd','moveToRangeStart','moveToRangeEnd',
  'customXmlInsRangeStart','customXmlInsRangeEnd','customXmlDelRangeStart','customXmlDelRangeEnd','customXmlMoveFromRangeStart','customXmlMoveFromRangeEnd','customXmlMoveToRangeStart','customXmlMoveToRangeEnd']);
function createWordStoryContext(options) {
  const config=record(options,['revisionView','comments','pointRangeBoundaries']);
  if(config.pointRangeBoundaries!==undefined&&typeof config.pointRangeBoundaries!=='boolean')throw failure();
  // Main must deliberately choose final; there is no implicit mixed/both view.
  if(!['final','original'].includes(config.revisionView))throw failure();
  const defs=config.comments===undefined?new Map():commentModels.get(config.comments);if(!defs)throw failure();
  const stack=[],states=new WeakMap(),fields=[],anchors=new Map(),notices=new Set(),reasons=new Set();let count=0,fieldCount=0,revisionCount=0,root=null,finished=false;
  function logicalParent(node){let p=node.parent;while(p?.namespaceURI===MC)p=p.parent;return p;}
  function fieldScope(){return [...stack].reverse().find(n=>is(n,'fldSimple')||is(n,'tc')||['body','hdr','ftr','footnote','endnote','comment','txbxContent'].some(k=>is(n,k)))||root;}
  function visible(node){if(finished)return false;const state=states.get(node);return Boolean(state?.structural&&!state.metadata&&fields.every(f=>f.phase==='result'));}
  function start(node) {
    if(finished||!node||typeof node!=='object'||types.isProxy(node)||states.has(node))throw failure();
    const own=Object.getOwnPropertyDescriptors(node);
    for(const key of ['namespaceURI','localName','attributes','parent'])if(!Object.hasOwn(own,key)||!Object.hasOwn(own[key],'value'))throw failure();
    if(typeof own.namespaceURI.value!=='string'||typeof own.localName.value!=='string'||types.isProxy(own.attributes.value))throw failure();
    try{Map.prototype.has.call(own.attributes.value,'');}catch{throw failure();}
    if(stack.length>=LIMITS.depth||++count>LIMITS.storyNodes)throw failure(true);
    if((node.parent||null)!==(stack.at(-1)||null))throw failure();
    if(!root){if(!W.has(node.namespaceURI)||!['document','body','hdr','ftr','footnotes','endnotes','comment','comments'].includes(node.localName))throw failure();root=node;}
    const parent=states.get(node.parent), state={structural:parent?parent.structural:true,metadata:parent?parent.metadata:false};
    // Story input is the already-selected actual Word walker. Passing raw MC
    // alternatives would mix views, so refuse rather than guess another branch.
    if(node.namespaceURI===MC)throw failure();
    if(W.has(node.namespaceURI)) {
      const name=node.localName;
      if(parent?.structural&&!parent.metadata&&['tc','body','hdr','ftr','footnote','endnote','comment','txbxContent'].includes(name)&&
          (fields.length||stack.some(value=>is(value,'fldSimple'))))throw failure();
      if(['pPr','rPr','tblPr','tcPr','trPr','sectPr','tblGrid'].includes(name))state.metadata=true;
      if(REVISION_PROPERTIES.has(name)){state.metadata=true;revisionCount++;notices.add('WORD_REVISION_METADATA_NOT_PROJECTED');
        if(config.revisionView==='original')reasons.add('WORD_REVISION_PROPERTIES_UNMODELED');}
      if(state.structural&&!state.metadata&&UNSUPPORTED_REVISIONS.has(name))throw failure();
      if(['ins','del','moveFrom','moveTo'].includes(name)&&!state.metadata) {
        revisionCount++;notices.add(config.revisionView==='final'?'WORD_REVISION_FINAL_VIEW':'WORD_REVISION_ORIGINAL_VIEW');
        const keep=config.revisionView==='final'?['ins','moveTo']:['del','moveFrom'];state.structural&&=keep.includes(name);
      }
      if(state.structural&&!state.metadata&&['instrText','delInstrText'].includes(name)&&
          !fields.some(field=>field.phase==='instruction'))throw failure();
      if(['instrText','delInstrText','fldData','ffData'].includes(name))state.metadata=true;
    }
    states.set(node,state);stack.push(node);
    if(state.structural&&!state.metadata&&is(node,'fldSimple')) {
      if(!['p','hyperlink','fldSimple','ins','del','moveTo','moveFrom','sdtContent','smartTag','dir','bdo'].some(n=>is(logicalParent(node),n))||
          typeof attr(node,'instr')!=='string')throw failure();
      if(++fieldCount>LIMITS.fields)throw failure(true);state.fieldId=fieldCount;notices.add('WORD_FIELD_STORED_RESULT');
    }
    if(state.structural&&!state.metadata&&is(node,'fldChar')) {
      if(!is(logicalParent(node),'r'))throw failure(); const type=attr(node,'fldCharType'),scope=fieldScope();
      if(type==='begin'){if(++fieldCount>LIMITS.fields||fields.length>=LIMITS.depth)throw failure(true);fields.push({id:fieldCount,phase:'instruction',scope});notices.add('WORD_FIELD_STORED_RESULT');}
      else if(type==='separate'){if(!fields.length||fields.at(-1).scope!==scope||fields.at(-1).phase!=='instruction')throw failure();fields.at(-1).phase='result';}
      else if(type==='end'){if(!fields.length||fields.at(-1).scope!==scope)throw failure();fields.pop();}
      else throw failure();
      state.metadata=true;
    }
    if(visible(node)&&W.has(node.namespaceURI)&&['commentReference','commentRangeStart','commentRangeEnd'].includes(node.localName)) {
      // References inside comment bodies do not acquire a second document anchor.
      if(!stack.some(n=>is(n,'comment'))) {
        const key=commentId(attr(node,'id')), def=defs.get(key); if(!def)throw failure();
        if(node.localName==='commentReference'&&!is(logicalParent(node),'r'))throw failure();
        const binding=anchors.get(key)||{id:key,definition:def,startNode:null,endNode:null,referenceNode:null,startIndex:null,endIndex:null,referenceIndex:null};
        const k=node.localName==='commentReference'?'reference':node.localName==='commentRangeStart'?'start':'end';
        if(binding[k+'Node'])throw failure();binding[k+'Node']=node;binding[k+'Index']=count;anchors.set(key,binding);
      }
    }
    return Object.freeze({visible:visible(node)});
  }
  function textAllowed(node) {
    if(!visible(node)||!is(logicalParent(node),'r'))return false;
    if(is(node,'t'))return true;
    return is(node,'delText')&&config.revisionView==='original'&&stack.some(n=>is(n,'del')||is(n,'moveFrom'));
  }
  function projectionState(node) {
    const state=states.get(node);
    // An identity is owned by this selected story's actual field controls,
    // never by a field instruction string or a source-supplied index. The
    // outer result owns nested stored results; hidden instructions own none.
    const ids=visible(node)?[...fields.map(field=>field.id),...stack.map(value=>states.get(value)?.fieldId).filter(Number.isSafeInteger)]:[];
    return Object.freeze({structural:!finished&&state?.structural===true,
      metadata:state?.metadata===true,visible:visible(node),
      storedResult:ids.length>0,fieldId:ids.length?Math.min(...ids):null,
      revisedText:visible(node)&&stack.some(value=>['ins','del','moveFrom','moveTo'].some(name=>is(value,name)))});
  }
  function end(node){if(finished||stack.at(-1)!==node)throw failure();
    if(fields.some(f=>f.scope===node))throw failure();stack.pop();}
  function finish(){
    if(finished||!root||stack.length||fields.length)throw failure();finished=true;const result=[];
    for(const b of anchors.values()) {
      const singleBoundary=Boolean(b.startNode)!==Boolean(b.endNode);
      if(!b.referenceNode||(singleBoundary&&config.pointRangeBoundaries!==true)||
          (b.startNode&&b.startIndex>=b.referenceIndex)||(b.endNode&&b.endIndex>=b.referenceIndex)||
          (b.startNode&&b.endNode&&b.startIndex>=b.endIndex))throw failure();
      if(b.definition.author===null)notices.add('WORD_COMMENT_AUTHOR_UNAVAILABLE');
      result.push(Object.freeze({...b}));
    }
    return Object.freeze({revisionView:config.revisionView,fieldCount,revisionCount,complete:reasons.size===0,
      reasons:Object.freeze([...reasons].sort()),notices:Object.freeze([...notices].sort()),comments:Object.freeze(result)});
  }
  return Object.freeze({start,visible,textAllowed,projectionState,end,finish});
}

module.exports=Object.freeze({WORD_NAMESPACES,LIMITS,readWordNumbering,createWordNumberingSession,
  readWordCommentMetadata,createWordStoryContext});
