'use strict';

// Native SmartArt text, never a layout renderer or XML-text scrape. The caller
// supplies already admitted package bytes; no paths, URLs, DTDs or external IO.
const path = require('node:path');
const { readXml } = require('./xml-reader');
const D = new Set(['http://schemas.openxmlformats.org/drawingml/2006/diagram',
  'http://purl.oclc.org/ooxml/drawingml/diagram']);
const A = new Set(['http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main']);
const R = ['http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships'];
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const fail = () => Object.assign(new Error('Office diagram structure is unsupported'), { code:'PPTX_STRUCTURE_UNSAFE' });
const own = (node,name) => node.attributes.get(`{}${name}`);
function relationshipAttribute(node,name) {
  const values=R.map(ns=>node.attributes.get(`{${ns}}${name}`)).filter(x=>x!==undefined);
  return values.length===1 ? values[0] : null;
}
function diagramModel(bytes, decode) {
  if (!Buffer.isBuffer(bytes) || bytes.length>2*1024*1024) throw fail();
  const points=new Map(), edges=[]; let point=null, chars=0;
  const root=readXml(new TextDecoder('utf-8',{fatal:true}).decode(bytes), {decode,error:fail,
    start(node) {
      // Diagram models with MC extensions need an explicit model vocabulary
      // implementation before their alternatives can be interpreted. Never
      // merge two mutually exclusive model graphs/text representations.
      if(node.namespaceURI==='http://schemas.openxmlformats.org/markup-compatibility/2006'&&node.localName==='AlternateContent')throw fail();
      if (D.has(node.namespaceURI) && node.localName==='pt' && node.parent?.localName==='ptLst' && D.has(node.parent.namespaceURI)) {
        const id=own(node,'modelId');
        if (!id || points.has(id) || points.size>=5000 || point) throw fail();
        point={id,text:'',index:points.size,node};points.set(id,point);
      }
      if (point && A.has(node.namespaceURI) && node.localName==='br') point.text+='\n';
      if (D.has(node.namespaceURI) && node.localName==='cxn' && own(node,'type')==='parOf') {
        const raw=own(node,'srcOrd')??'0';
        if (edges.length>=10000 || !/^[0-9]{1,6}$/u.test(raw)) throw fail();
        edges.push({source:own(node,'srcId'),target:own(node,'destId'),order:Number(raw)});
      }
    },
    text(value,node) {
      if (point && A.has(node.namespaceURI) && node.localName==='t') {
        point.text+=value;chars+=value.length;if (chars>1_000_000) throw fail();
      }
    },
    end(node) {
      if (point && A.has(node.namespaceURI) && node.localName==='p') point.text+='\n';
      if (point?.node===node) {point.text=point.text.trim();point=null;}
    }
  });
  if (!D.has(root.namespaceURI) || root.localName!=='dataModel') throw fail();
  const children=new Map(), parents=new Map();
  for (const edge of edges) {
    if (!points.has(edge.source)||!points.has(edge.target)||edge.source===edge.target||parents.has(edge.target)) throw fail();
    parents.set(edge.target,edge.source);
    if (!children.has(edge.source)) children.set(edge.source,[]);
    children.get(edge.source).push(edge);
  }
  for (const list of children.values()) list.sort((a,b)=>a.order-b.order||points.get(a.target).index-points.get(b.target).index);
  const roots=[...points.values()].filter(p=>!parents.has(p.id)), seen=new Set(), rows=[];
  const stack=roots.reverse().map(p=>({id:p.id,depth:0}));
  while (stack.length) {
    const item=stack.pop();
    if (seen.has(item.id)||item.depth>128) throw fail();
    seen.add(item.id);const value=points.get(item.id);
    if (value.text) rows.push({text:value.text,depth:item.depth});
    for (const edge of [...(children.get(item.id)||[])].reverse()) stack.push({id:edge.target,depth:item.depth+1});
  }
  if (seen.size!==points.size) throw fail(); // cycle or unreachable connected component
  // A synthetic empty document root should not add an artificial indentation.
  const minimum=rows.length?Math.min(...rows.map(row=>row.depth)):0;
  return rows.map(row=>({...row,depth:row.depth-minimum}));
}
function ownerDiagrams(entries,owner,decode) {
  const bytes=entries.get(owner);if (!bytes) return [];
  const ids=[],selected=new WeakMap(),ignored=new WeakSet();
  const mc='http://schemas.openxmlformats.org/markup-compatibility/2006';
  const understood=new Set([...D,...A,...R,
    'http://schemas.openxmlformats.org/presentationml/2006/main',
    'http://purl.oclc.org/ooxml/presentationml/main',
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'http://purl.oclc.org/ooxml/wordprocessingml/main']);
  readXml(bytes.toString('utf8'),{decode,error:fail,start(node){
    if(node.namespaceURI===mc&&node.localName==='AlternateContent')selected.set(node,false);
    if(node.namespaceURI===mc&&['Choice','Fallback'].includes(node.localName)){
      if(node.parent?.namespaceURI!==mc||node.parent.localName!=='AlternateContent')throw fail();
      const required=(own(node,'Requires')||'').trim().split(/\s+/u).filter(Boolean);
      const usable=node.localName==='Fallback'||(required.length&&required.every(prefix=>understood.has(node.namespaces.get(prefix))));
      if(selected.get(node.parent)||!usable)ignored.add(node);else selected.set(node.parent,true);
    }
    for(let parent=node;parent;parent=parent.parent)if(ignored.has(parent))return;
    if (D.has(node.namespaceURI)&&node.localName==='relIds') {
      const id=relationshipAttribute(node,'dm');if (!id) throw fail();ids.push(id);
      if (ids.length>150) throw fail();
    }
  }});
  if (!ids.length) return [];
  const relPath=path.posix.join(path.posix.dirname(owner),'_rels',path.posix.basename(owner)+'.rels');
  const rel=entries.get(relPath);if (!rel) throw fail();
  const relations=new Map();
  const root=readXml(rel.toString('utf8'),{decode,error:fail,start(node){
    if (node.namespaceURI!==PR||node.localName!=='Relationship'||node.parent?.namespaceURI!==PR||node.parent.localName!=='Relationships') return;
    const id=own(node,'Id');if (!id||relations.has(id)) throw fail();
    relations.set(id,{type:own(node,'Type'),target:own(node,'Target'),mode:own(node,'TargetMode')});
  }});
  if (root.namespaceURI!==PR||root.localName!=='Relationships') throw fail();
  const family=owner.split('/')[0], out=[];
  for (const id of ids) {
    const edge=relations.get(id), raw=edge?.target;
    if (!edge||!R.some(ns=>edge.type===`${ns}/diagramData`)||!['',undefined,'Internal'].includes(edge.mode)||
        !raw||/[\\?#%\0]/u.test(raw)||/^(?:\/|[a-z][a-z0-9+.-]*:)/iu.test(raw)) throw fail();
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(owner),raw));
    if (!new RegExp(`^${family}/diagrams/data[0-9]+\\.xml$`,'u').test(target)||!entries.has(target)) throw fail();
    // Do not also read drawingN.xml: it is another presentation of this model.
    out.push({target,rows:diagramModel(entries.get(target),decode)});
  }
  return out;
}
module.exports=Object.freeze({diagramModel,ownerDiagrams});
