'use strict';
// Source-owned synthetic tagged PDF fixture, no external/user document.
function taggedPdf(groups, structure, {pageGeneration=0,unmarked=''}={}){
 const pageRef=`3 ${pageGeneration} R`,objects=['<< /Type /Catalog /Pages 2 0 R /MarkInfo << /Marked true >> /StructTreeRoot 6 0 R >>',`<< /Type /Pages /Kids [${pageRef}] /Count 1 >>`,
 `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 400] /StructParents 0 /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','','',''];
 const parentTree=[];function node(model,parent){const number=objects.push(''),kids=[];
  for(const child of model.children){if(Number.isInteger(child)){kids.push(String(child));parentTree[child]=`${number} 0 R`;}else kids.push(`${node(child,number)} 0 R`);}
  objects[number-1]=`<< /Type /StructElem /S /${model.role} /P ${parent} 0 R /Pg ${pageRef} /K [${kids.join(' ')}] >>`;return number;}
 const children=structure.map(model=>node(model,6));objects[5]=`<< /Type /StructTreeRoot /K [${children.map(n=>`${n} 0 R`).join(' ')}] /ParentTree 7 0 R /ParentTreeNextKey 1 >>`;
 objects[6]=`<< /Nums [0 [${Array.from({length:parentTree.length},(_,i)=>parentTree[i]||'null').join(' ')}]] >>`;
 const escape=value=>value.replace(/[\\()]/gu,'\\$&');const stream=groups.map(g=>`/P << /MCID ${g.id} >> BDC\nBT /F1 12 Tf 1 0 0 1 ${g.x} ${g.y} Tm (${escape(g.text)}) Tj ET\nEMC`).join('\n')+unmarked;
 objects[4]=`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;let output='%PDF-1.7\n';const offsets=[0];
 for(const[i,obj]of objects.entries()){offsets.push(Buffer.byteLength(output));output+=`${i+1} ${i===2?pageGeneration:0} obj\n${obj}\nendobj\n`;}
 const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map((off,i)=>`${String(off).padStart(10,'0')} ${String(i===2?pageGeneration:0).padStart(5,'0')} n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(output);
}
module.exports=Object.freeze({taggedPdf});
