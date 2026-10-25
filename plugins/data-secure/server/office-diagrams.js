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
const POINT_TYPES = new Set(['node','doc','asst','parTrans','sibTrans','pres']);
const DATA_POINTS = new Set(['node','doc','asst']);
const CONNECTION_TYPES = new Set(['parOf','presOf','presParOf']);
const token = value => value?.replace(/^[ \t\r\n]+|[ \t\r\n]+$/gu,'');
function sourceOrder(value) {
  // CT_Cxn.srcOrd is required unsignedInt, not an optional zero default.
  const raw=token(value);
  if(typeof raw!=='string'||!/^\+?[0-9]{1,10}$/u.test(raw)||Number(raw)>0xffffffff)throw fail();
  return Number(raw);
}
function relationshipAttribute(node,name) {
  const values=R.map(ns=>node.attributes.get(`{${ns}}${name}`)).filter(x=>x!==undefined);
  return values.length===1 ? values[0] : null;
}
function diagramModel(bytes, decode) {
  if (!Buffer.isBuffer(bytes) || bytes.length>2*1024*1024) throw fail();
  let source;
  try {source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail();}
  const points=new Map(), edges=[], connectionIds=new Set();
  let model,pointList,connectionList,point=null,textBody=null,chars=0;
  const textNamespace=()=>model.namespaceURI==='http://purl.oclc.org/ooxml/drawingml/diagram'
    ? 'http://purl.oclc.org/ooxml/drawingml/main' : 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const paragraph=node=>node?.namespaceURI===textNamespace()&&node.localName==='p'&&node.parent===textBody;
  function append(value){point.text+=value;chars+=value.length;if(chars>1_000_000)throw fail();}
  const root=readXml(source, {decode,error:fail,
    start(node) {
      if(!node.parent){
        if(!D.has(node.namespaceURI)||node.localName!=='dataModel')throw fail();
        model=node;
      }
      // Diagram models with MC extensions need an explicit model vocabulary
      // implementation before their alternatives can be interpreted. Never
      // merge two mutually exclusive model graphs/text representations.
      if(node.namespaceURI==='http://schemas.openxmlformats.org/markup-compatibility/2006'&&
          ['AlternateContent','Choice','Fallback'].includes(node.localName))throw fail();
      if(D.has(node.namespaceURI)&&['ptLst','cxnLst','pt','cxn'].includes(node.localName)&&node.namespaceURI!==model.namespaceURI)throw fail();
      if(node.namespaceURI===model.namespaceURI&&['ptLst','cxnLst'].includes(node.localName)){
        if(node.parent!==model)throw fail();
        if(node.localName==='ptLst'){if(pointList)throw fail();pointList=node;}
        else {if(connectionList)throw fail();connectionList=node;}
      }
      if(node.namespaceURI===model.namespaceURI&&node.localName==='pt'){
        const id=own(node,'modelId'),type=token(own(node,'type')??'node');
        if(node.parent!==pointList||!id||points.has(id)||points.size>=5000||point||!POINT_TYPES.has(type))throw fail();
        point={id,type,text:'',index:points.size,node};points.set(id,point);
      }
      if(point&&node.namespaceURI===model.namespaceURI&&node.localName==='t'&&node.parent===point.node){
        if(textBody||point.hasTextBody)throw fail();
        textBody=node;point.hasTextBody=true;
      }
      if(textBody&&node.namespaceURI===textNamespace()&&node.localName==='br'){
        if(!paragraph(node.parent))throw fail();append('\n');
      }
      if(node.namespaceURI===model.namespaceURI&&node.localName==='cxn'){
        // The normative CT_Cxn default is parOf. Requiring the literal type
        // attribute incorrectly flattened normal Office-created SmartArt.
        const type=token(own(node,'type')??'parOf'),id=own(node,'modelId');
        if(node.parent!==connectionList||edges.length>=10000||!CONNECTION_TYPES.has(type)||
            (id!==undefined&&(!id||connectionIds.has(id))))throw fail();
        if(id!==undefined)connectionIds.add(id);
        edges.push({type,source:own(node,'srcId'),target:own(node,'destId'),order:sourceOrder(own(node,'srcOrd'))});
      }
    },
    text(value,node) {
      if(textBody&&node.namespaceURI===textNamespace()&&node.localName==='t'){
        if(node.parent?.namespaceURI!==textNamespace()||!['r','fld'].includes(node.parent.localName)||!paragraph(node.parent.parent))throw fail();
        append(value);
      }
    },
    end(node) {
      if(textBody&&paragraph(node))append('\n');
      if(node===textBody)textBody=null;
      if (point?.node===node) {point.text=point.text.trim();point=null;}
    }
  });
  if(root!==model||!pointList)throw fail();
  const children=new Map(), parents=new Map(), presentationChildren=new Map(), presentationParents=new Set();
  for (const edge of edges) {
    const from=points.get(edge.source),to=points.get(edge.target);
    if(!from||!to||edge.source===edge.target)throw fail();
    if(edge.type==='presOf'){
      if(from.type==='pres'||to.type!=='pres')throw fail();
      continue;
    }
    if(edge.type==='presParOf'){
      if(from.type!=='pres'||to.type!=='pres'||presentationParents.has(to.id))throw fail();
      presentationParents.add(to.id);
      if(!presentationChildren.has(from.id))presentationChildren.set(from.id,[]);
      presentationChildren.get(from.id).push(edge);
      continue;
    }
    if(!DATA_POINTS.has(from.type)||!DATA_POINTS.has(to.type)||to.type==='doc'||parents.has(to.id))throw fail();
    parents.set(edge.target,edge.source);
    if (!children.has(edge.source)) children.set(edge.source,[]);
    children.get(edge.source).push(edge);
  }
  for(const list of children.values()){
    const orders=new Set();
    for(const edge of list){if(orders.has(edge.order))throw fail();orders.add(edge.order);}
    list.sort((a,b)=>a.order-b.order);
  }
  // Presentation/transition points never acquire parent authority in the data
  // tree. Their nonempty text is not, however, proven to be a duplicate: keep
  // it separately below instead of silently discarding independently readable
  // source content merely because it has a layout-oriented point role.
  const data=[...points.values()].filter(value=>DATA_POINTS.has(value.type));
  if(data.filter(value=>value.type==='doc').length>1)throw fail();
  const roots=data.filter(value=>!parents.has(value.id)),seen=new Set(),rows=[];
  const stack=roots.reverse().map(value=>({id:value.id,depth:0,indent:0}));
  while (stack.length) {
    const item=stack.pop();
    if (seen.has(item.id)||item.depth>128) throw fail();
    seen.add(item.id);const value=points.get(item.id);
    if(value.text)rows.push({text:value.text,depth:item.indent});
    // Empty container points do not fabricate a visible heading/indentation.
    // The actual graph depth remains independently bounded above.
    for(const edge of [...(children.get(item.id)||[])].reverse())stack.push({id:edge.target,
      depth:item.depth+1,indent:item.indent+(value.text?1:0)});
  }
  if(seen.size!==data.length)throw fail(); // cycle or unreachable data component
  const presentation=[...points.values()].filter(value=>value.type==='pres'),presentationSeen=new Set();
  const pending=presentation.filter(value=>!presentationParents.has(value.id)).map(value=>({id:value.id,depth:0}));
  while(pending.length){
    const item=pending.pop();if(presentationSeen.has(item.id)||item.depth>128)throw fail();
    presentationSeen.add(item.id);
    for(const edge of presentationChildren.get(item.id)||[])pending.push({id:edge.target,depth:item.depth+1});
  }
  if(presentationSeen.size!==presentation.length)throw fail();
  const additional=[...points.values()].filter(value=>!DATA_POINTS.has(value.type)&&value.text);
  if(additional.length){
    rows.push({text:'SmartArt-Zusatztexte · Zuordnung zum Datenbaum nicht bestätigt',depth:0});
    for(const value of additional)rows.push({text:value.text,depth:1});
  }
  return rows;
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
