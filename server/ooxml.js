'use strict';

const path = require('path');
const { readZip, ZipError } = require('./zip-reader');

function xmlDecode(s='') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/&#([0-9]+);/g, (_,d)=>String.fromCodePoint(parseInt(d,10)))
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
function stripTags(s='') { return xmlDecode(String(s).replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim(); }
function textTags(xml, tag='a:t') {
  const re = new RegExp(`<${tag.replace(':','\\:')}\\b[^>]*>([\\s\\S]*?)<\\/${tag.replace(':','\\:')}>`,'gi');
  const out=[]; let m; while((m=re.exec(xml))) out.push(xmlDecode(m[1])); return out;
}
function contentType(name) {
  const e=path.extname(name).toLowerCase();
  return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.bmp':'image/bmp','.gif':'image/gif','.tif':'image/tiff','.tiff':'image/tiff','.webp':'image/webp','.svg':'image/svg+xml','.emf':'image/x-emf','.wmf':'image/x-wmf'})[e] || 'application/octet-stream';
}
function mediaAttachments(entries, prefix) {
  const out=[];
  for(const [name,data] of entries) if(name.startsWith(prefix) && /\.(png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i.test(name)) {
    out.push({ type:'image', mimeType:contentType(name), data:data.toString('base64'), name:path.basename(name), extension:path.extname(name).slice(1).toLowerCase(), source_part:name });
  }
  return out;
}
function relMap(entries, relPath, baseDir) {
  const buf=entries.get(relPath); if(!buf) return new Map();
  const xml=buf.toString('utf8'); const out=new Map(); let m;
  const re=/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi;
  while((m=re.exec(xml))) {
    const attrs=m[1], id=/\bId="([^"]+)"/i.exec(attrs)?.[1], target=/\bTarget="([^"]+)"/i.exec(attrs)?.[1];
    if(id&&target) out.set(id, path.posix.normalize(path.posix.join(baseDir,target)));
  }
  return out;
}
function paragraphText(xml, textTag='w:t') {
  let s='';
  const tokenRe = new RegExp(`<${textTag.replace(':','\\:')}\\b[^>]*>([\\s\\S]*?)<\\/${textTag.replace(':','\\:')}>|<w:tab\\b[^>]*/>|<w:(?:br|cr)\\b[^>]*/>`,'gi');
  let m; while((m=tokenRe.exec(xml))) { if(m[1]!==undefined)s+=xmlDecode(m[1]); else if(/^<w:tab/i.test(m[0])) s+='\t'; else s+='\n'; }
  return s.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function renderWordBody(xml) {
  const body=/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i.exec(xml)?.[1] || xml;
  const blocks=[]; const re=/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/gi; let m;
  while((m=re.exec(body))) {
    if(m[1].toLowerCase()==='p') {
      const p=m[0], txt=paragraphText(p); if(!txt) continue;
      const style=/<w:pStyle\b[^>]*w:val="([^"]+)"/i.exec(p)?.[1]||'';
      const lvl=/heading\s*([1-6])/i.exec(style)?.[1] || /^Heading([1-6])$/i.exec(style)?.[1];
      const bullet=/<w:numPr\b/i.test(p);
      if(lvl) blocks.push(`${'#'.repeat(Number(lvl))} ${txt}`); else if(bullet) blocks.push(`- ${txt}`); else blocks.push(txt);
    } else {
      const rows=[]; let rm; const rr=/<w:tr\b[\s\S]*?<\/w:tr>/gi;
      while((rm=rr.exec(m[0]))) { const cells=[]; let cm; const cr=/<w:tc\b[\s\S]*?<\/w:tc>/gi; while((cm=cr.exec(rm[0]))) cells.push(paragraphText(cm[0]).replace(/\n/g,'<br>')); rows.push(cells); }
      if(rows.length){const cols=Math.max(...rows.map(r=>r.length));const norm=rows.map(r=>Array.from({length:cols},(_,i)=>r[i]||''));blocks.push('| '+norm[0].join(' | ')+' |\n| '+norm[0].map(()=> '---').join(' | ')+' |'+(norm.length>1?'\n'+norm.slice(1).map(r=>'| '+r.join(' | ')+' |').join('\n'):''));}
    }
  }
  return blocks.join('\n\n');
}
function parseDocx(entries) {
  const main=entries.get('word/document.xml'); if(!main) throw new Error('DOCX enthält kein word/document.xml.');
  let md=renderWordBody(main.toString('utf8'));
  for(const [name,data] of entries) if(/^word\/(header|footer)\d+\.xml$/i.test(name)) { const t=textTags(data.toString('utf8'),'w:t').join(' ').trim(); if(t) md += `\n\n## ${name.includes('header')?'Kopfzeile':'Fußzeile'}\n\n${t}`; }
  for(const extra of ['word/comments.xml','word/footnotes.xml','word/endnotes.xml']) if(entries.has(extra)) { const t=textTags(entries.get(extra).toString('utf8'),'w:t').join(' ').trim(); if(t) md+=`\n\n## ${extra.includes('comments')?'Kommentare':extra.includes('footnotes')?'Fußnoten':'Endnoten'}\n\n${t}`; }
  return { markdown:md, attachments:mediaAttachments(entries,'word/media/'), warnings:[] };
}
function sharedStrings(entries) {
  const b=entries.get('xl/sharedStrings.xml'); if(!b)return[]; const xml=b.toString('utf8'), out=[]; let m; const re=/<si\b[\s\S]*?<\/si>/gi; while((m=re.exec(xml)))out.push(textTags(m[0],'t').join('')); return out;
}
function colNumber(ref) { const m=/^([A-Z]+)/i.exec(ref||''); if(!m)return 0; let n=0; for(const c of m[1].toUpperCase())n=n*26+(c.charCodeAt(0)-64); return n; }
function parseXlsx(entries) {
  const shared=sharedStrings(entries); const workbook=entries.get('xl/workbook.xml')?.toString('utf8')||''; const rels=relMap(entries,'xl/_rels/workbook.xml.rels','xl');
  const sheetMeta=[]; let sm; const sr=/<sheet\b([^>]+?)\/?>(?:<\/sheet>)?/gi; while((sm=sr.exec(workbook))){const a=sm[1],name=xmlDecode(/\bname="([^"]+)"/i.exec(a)?.[1]||'Sheet'),rid=/\br:id="([^"]+)"/i.exec(a)?.[1]; if(rid&&rels.get(rid))sheetMeta.push({name,target:rels.get(rid)});}
  if(!sheetMeta.length) for(const name of entries.keys()) if(/^xl\/worksheets\/sheet\d+\.xml$/i.test(name))sheetMeta.push({name:path.basename(name,'.xml'),target:name});
  const parts=[];
  for(const s of sheetMeta){const buf=entries.get(s.target);if(!buf)continue;const xml=buf.toString('utf8');const rows=[];let rm;const rr=/<row\b[\s\S]*?<\/row>/gi;while((rm=rr.exec(xml))){const vals=[];let cm;const cr=/<c\b([^>]*)>([\s\S]*?)<\/c>/gi;while((cm=cr.exec(rm[0]))){const attrs=cm[1],body=cm[2],ref=/\br="([^"]+)"/i.exec(attrs)?.[1]||'',idx=colNumber(ref)-1,t=/\bt="([^"]+)"/i.exec(attrs)?.[1]||'';let v=/<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1]??'';if(t==='s')v=shared[Number(v)]??v;else if(t==='inlineStr')v=textTags(body,'t').join('');else if(t==='str')v=xmlDecode(v);vals[idx<0?vals.length:idx]=String(v); } if(vals.some(v=>String(v||'').trim()))rows.push(vals);}
    parts.push(`# Arbeitsblatt: ${s.name}`); if(rows.length){const cols=Math.min(100,Math.max(...rows.map(r=>r.length)));const norm=rows.slice(0,10000).map(r=>Array.from({length:cols},(_,i)=>String(r[i]??'').replace(/\|/g,'\\|').replace(/\r?\n/g,'<br>')));parts.push('| '+norm[0].join(' | ')+' |');parts.push('| '+norm[0].map(()=> '---').join(' | ')+' |');for(const r of norm.slice(1))parts.push('| '+r.join(' | ')+' |');if(rows.length>10000)parts.push('> Weitere Zeilen wurden aus Sicherheitsgründen nicht automatisch gerendert.');}
  }
  const chartText=[]; for(const [name,data] of entries) if(/^xl\/charts\/chart\d+\.xml$/i.test(name)){const vals=textTags(data.toString('utf8'),'c:v').concat(textTags(data.toString('utf8'),'a:t')); if(vals.length)chartText.push(`## Diagrammdaten ${path.basename(name)}\n\n${vals.join(' | ')}`);}
  const drawingText=[];for(const [name,data]of entries)if(/^xl\/drawings\/.*\.xml$/i.test(name)){const vals=textTags(data.toString('utf8'),'a:t');if(vals.length)drawingText.push(`## Grafiktext ${path.basename(name)}\n\n${vals.join(' ')}`);}
  return { markdown:[...parts,...chartText,...drawingText].join('\n\n'), attachments:mediaAttachments(entries,'xl/media/'), warnings:[] };
}
function slideNumber(name){return Number(/slide(\d+)\.xml$/i.exec(name)?.[1]||0);}
function parsePptx(entries) {
  const slides=[...entries.keys()].filter(n=>/^ppt\/slides\/slide\d+\.xml$/i.test(n)).sort((a,b)=>slideNumber(a)-slideNumber(b)); const parts=[];
  for(const s of slides){const n=slideNumber(s),xml=entries.get(s).toString('utf8'),texts=textTags(xml,'a:t');parts.push(`# Folie ${n}`);if(texts.length)parts.push(texts.join('\n\n'));const notes=`ppt/notesSlides/notesSlide${n}.xml`;if(entries.has(notes)){const nt=textTags(entries.get(notes).toString('utf8'),'a:t').filter(x=>!/^\d+$/.test(x.trim()));if(nt.length)parts.push(`## Notizen\n\n${nt.join('\n\n')}`);} }
  for(const [name,data] of entries) if(/^ppt\/charts\/chart\d+\.xml$/i.test(name)){const vals=textTags(data.toString('utf8'),'c:v').concat(textTags(data.toString('utf8'),'a:t'));if(vals.length)parts.push(`## Diagrammdaten ${path.basename(name)}\n\n${vals.join(' | ')}`);}
  return { markdown:parts.join('\n\n'), attachments:mediaAttachments(entries,'ppt/media/'), warnings:[] };
}
function parseOoxml(buffer, ext) {
  let entries; try{entries=readZip(buffer);}catch(e){if(e instanceof ZipError)throw e;throw new Error('Office-Datei konnte nicht als OOXML gelesen werden.');}
  if(ext==='.docx')return parseDocx(entries); if(ext==='.xlsx')return parseXlsx(entries); if(ext==='.pptx')return parsePptx(entries); throw new Error('OOXML-Format nicht unterstützt.');
}

module.exports={parseOoxml,parseDocx,parseXlsx,parsePptx,xmlDecode,stripTags,contentType};
