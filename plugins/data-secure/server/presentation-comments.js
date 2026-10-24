'use strict';

// MS-PPTX 2.1.5/6, 2.16: passive, source-owned modern comments. No person
// service, URL, Office activation or author lookup. These are editing comments,
// not ordinary slide-show text and not proof of a specific shape/text anchor.
const path=require('node:path');
const {readXml,assertXmlCharacters}=require('./xml-reader');
const NS='http://schemas.microsoft.com/office/powerpoint/2018/8/main';
const D=new Set(['http://schemas.openxmlformats.org/drawingml/2006/main','http://purl.oclc.org/ooxml/drawingml/main']);
const REL='http://schemas.openxmlformats.org/package/2006/relationships';
const CT='http://schemas.openxmlformats.org/package/2006/content-types';
const AUTHORS='http://schemas.microsoft.com/office/2018/10/relationships/authors';
const COMMENTS='http://schemas.microsoft.com/office/2018/10/relationships/comments';
const fail=(limit=false)=>Object.assign(new Error(limit?'PPTX_STRUCTURE_LIMIT':'PPTX_STRUCTURE_UNSAFE'),{code:limit?'PPTX_STRUCTURE_LIMIT':'PPTX_STRUCTURE_UNSAFE'});
function decode(value){if(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/u.test(value))throw fail();
 const result=value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gu,(_,s)=>{if(s[0]!=='#')return({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[s];
 const cp=Number.parseInt(s.slice(s[1]==='x'?2:1),s[1]==='x'?16:10);if(!Number.isSafeInteger(cp)||cp>0x10ffff)throw fail();return String.fromCodePoint(cp);});
 assertXmlCharacters(result,fail);return result;}
function tree(bytes){const xml=Buffer.isBuffer(bytes)?bytes.toString('utf8'):bytes;if(typeof xml!=='string'||xml.length>8000000)throw fail(true);
 let root,count=0,texts=0;const seen=new WeakMap();readXml(xml,{decode,error:fail,start(node){if(++count>50000)throw fail(true);const item=node;item.children=[];item.text='';seen.set(node,item);if(node.parent)seen.get(node.parent).children.push(item);else root=item;},
 text(value,node){texts+=value.length;if(texts>8000000)throw fail(true);seen.get(node).text+=value;}});return root;}
const a=(node,name)=>node.attributes.get('{}'+name),is=(node,name)=>node.namespaceURI===NS&&node.localName===name;
function guid(value){if(typeof value!=='string'||!/^\{[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\}$/iu.test(value))throw fail();return value.toLowerCase();}
function edges(entries,owner,kind,pattern){const part=path.posix.join(path.posix.dirname(owner),'_rels',path.posix.basename(owner)+'.rels'),bytes=entries.get(part);
 if(!bytes)return[];const root=tree(bytes);if(root.namespaceURI!==REL||root.localName!=='Relationships')throw fail();const ids=new Set(),out=[];
 for(const node of root.children){if(node.namespaceURI!==REL||node.localName!=='Relationship')throw fail();const id=a(node,'Id');if(!id||ids.has(id))throw fail();ids.add(id);
 if(a(node,'Type')!==kind)continue;const raw=a(node,'Target');if(!raw||/[\\?#\0]/u.test(raw)||/^(?:\/|[a-z][a-z0-9+.-]*:)/iu.test(raw)||!['Internal',undefined].includes(a(node,'TargetMode')))throw fail();
 const target=path.posix.normalize(path.posix.join(path.posix.dirname(owner),raw));if(!pattern.test(target)||!entries.has(target))throw fail();out.push(target);}
 if(out.length>1)throw fail();return out;}
function readPresentationComments(entries,{slidePart}){
 if(!(entries instanceof Map)||!/^ppt\/slides\/slide[1-9][0-9]*\.xml$/u.test(slidePart)||!entries.has(slidePart))throw fail();
 // Hex components emitted by PowerPoint may use upper- or lowercase. Keep
 // the exact relationship-resolved package name: accepting A-F here must not
 // case-fold a missing target, infer a sibling or relax MIME/owner validation.
 const parts=edges(entries,slidePart,COMMENTS,/^ppt\/comments\/modernComment_[\da-fA-F]+_[\da-fA-F]+\.xml$/u);if(!parts.length)return Object.freeze({comments:Object.freeze([]),notices:Object.freeze([]),consumedParts:Object.freeze([])});
 const [authorsPart]=edges(entries,'ppt/presentation.xml',AUTHORS,/^ppt\/authors\.xml$/u);if(!authorsPart)throw fail();
 // Required exact MIME in the same actual package, no filename-only admission.
 const overrides=new Map(),types=tree(entries.get('[Content_Types].xml'));if(types.namespaceURI!==CT||types.localName!=='Types')throw fail();
 for(const n of types.children)if(n.namespaceURI===CT&&n.localName==='Override'){const key=a(n,'PartName');if(overrides.has(key))throw fail();overrides.set(key,a(n,'ContentType'));}
 if(overrides.get('/'+authorsPart)!=='application/vnd.ms-powerpoint.authors+xml'||overrides.get('/'+parts[0])!=='application/vnd.ms-powerpoint.comments+xml')throw fail();
 const notices=new Set(),authors=new Map(),authorRoot=tree(entries.get(authorsPart));if(!is(authorRoot,'authorLst'))throw fail();
 if(/\S/u.test(authorRoot.text))throw fail();
 for(const author of authorRoot.children){if(!is(author,'author')||authors.size>=10000)throw fail(authors.size>=10000);const id=guid(a(author,'id'));
 if(authors.has(id)||typeof a(author,'name')!=='string'||/\S/u.test(author.text))throw fail();if(author.children.length)notices.add('PPT_COMMENT_EXTENSIONS_NOT_PROJECTED');
 authors.set(id,Object.freeze({name:a(author,'name'),initials:a(author,'initials')??null,userId:a(author,'userId')??null,providerId:a(author,'providerId')??null}));}
 const root=tree(entries.get(parts[0])),seen=new Set(),comments=[];if(!is(root,'cmLst')||/\S/u.test(root.text))throw fail();
 function readComment(node,parentId=null){if(comments.length>=10000)throw fail(true);const id=guid(a(node,'id')),author=authors.get(guid(a(node,'authorId')));
 if(seen.has(id)||!author||/\S/u.test(node.text))throw fail();seen.add(id);const status=a(node,'status')??'active';if(!['active','resolved','closed'].includes(status))throw fail();
 const bodies=node.children.filter(n=>is(n,'txBody'));if(bodies.length>1)throw fail();const paragraphs=[];
 function body(n){if(D.has(n.namespaceURI)&&n.localName==='p'){let out='';function runs(r){if(D.has(r.namespaceURI)&&r.localName==='t'){if(r.children.length||!D.has(r.parent?.namespaceURI)||!['r','fld'].includes(r.parent.localName))throw fail();out+=r.text;return;}
 if(D.has(r.namespaceURI)&&r.localName==='br'){if(r.children.length||/\S/u.test(r.text))throw fail();out+='\n';return;}
 if(D.has(r.namespaceURI)&&['pPr','rPr','endParaRPr'].includes(r.localName)){if(r.children.length)notices.add('PPT_COMMENT_FORMATTING_NOT_PROJECTED');return;}
 if(!D.has(r.namespaceURI)||!['p','r','fld'].includes(r.localName)||/\S/u.test(r.text)||r!==n&&r.parent!==n)throw fail();for(const c of r.children)runs(c);}
 runs(n);paragraphs.push(out);return;}
 if(n!==bodies[0]||/\S/u.test(n.text))throw fail();
 for(const c of n.children){if(D.has(c.namespaceURI)&&['bodyPr','lstStyle'].includes(c.localName))continue;
   if(!D.has(c.namespaceURI)||c.localName!=='p')throw fail();body(c);}}
 if(bodies[0])body(bodies[0]);const title=a(node,'title')??'',created=a(node,'created')??null;
 const record=Object.freeze({id,parentId,author,status,created,title,text:paragraphs.join('\n\n'),paragraphs:Object.freeze(paragraphs),source_part:parts[0],slide_part:slidePart,anchor:'slide-editing-comment'});comments.push(record);
 for(const child of node.children){if(is(child,'replyLst')){if(parentId!==null)throw fail();for(const reply of child.children){if(!is(reply,'reply'))throw fail();readComment(reply,id);}}
 else if(!is(child,'txBody'))notices.add(is(child,'extLst')?'PPT_COMMENT_EXTENSIONS_NOT_PROJECTED':'PPT_COMMENT_PRECISE_ANCHOR_UNMODELED');}
 }
 for(const node of root.children){if(!is(node,'cm'))throw fail();readComment(node);}
 return Object.freeze({comments:Object.freeze(comments),notices:Object.freeze([...notices].sort()),consumedParts:Object.freeze([authorsPart,...parts])});
}
module.exports=Object.freeze({readPresentationComments});
