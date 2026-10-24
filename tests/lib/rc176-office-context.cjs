'use strict';
const {zipStore}=require('./zip'),{opcControlEntries}=require('./opc');
function presentationComments(){
 const P='http://schemas.openxmlformats.org/presentationml/2006/main',A='http://schemas.openxmlformats.org/drawingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const M='http://schemas.microsoft.com/office/powerpoint/2018/8/main',PR='http://schemas.openxmlformats.org/package/2006/relationships',MR='http://schemas.microsoft.com/office/2018/10/relationships/';
 const author='{12345678-1234-1234-1234-123456789012}',comment='{22345678-1234-1234-1234-123456789012}';
 return zipStore([...opcControlEntries('pptx',{additionalOverrides:[
  {part:'ppt/slides/slide1.xml',contentType:'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'},
  {part:'ppt/authors.xml',contentType:'application/vnd.ms-powerpoint.authors+xml'},
  {part:'ppt/comments/modernComment_a_b.xml',contentType:'application/vnd.ms-powerpoint.comments+xml'}]}),
 ['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`],
 ['ppt/_rels/presentation.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="s" Type="${R}/slide" Target="slides/slide1.xml"/><Relationship Id="a" Type="${MR}authors" Target="authors.xml"/></Relationships>`],
 ['ppt/slides/slide1.xml',`<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Gebundene Fachfolie</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`],
 ['ppt/slides/_rels/slide1.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="c" Type="${MR}comments" Target="../comments/modernComment_a_b.xml"/></Relationships>`],
 ['ppt/authors.xml',`<p:authorLst xmlns:p="${M}"><p:author id="${author}" name="Anna Berger" initials="AB" userId="anna@example.invalid" providerId="AD"/></p:authorLst>`],
 ['ppt/comments/modernComment_a_b.xml',`<p:cmLst xmlns:p="${M}" xmlns:a="${A}"><p:cm id="${comment}" authorId="${author}" created="2026-10-24T10:00:00Z"><p:unknownAnchor/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Name: Qvx / Qvy</a:t></a:r></a:p><a:p><a:r><a:t>FHIR REST 123 ÄÖÜß</a:t></a:r></a:p></p:txBody></p:cm></p:cmLst>`]
 ]);
}
function wordFields(){
 const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const run=t=>`<w:r><w:t>${t}</w:t></w:r>`;
 return zipStore([...opcControlEntries('docx',{additionalOverrides:[{part:'word/numbering.xml',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml'}]}),
  ['word/_rels/document.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="n" Type="${R}/numbering" Target="numbering.xml"/></Relationships>`],
  ['word/numbering.xml',`<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:suff w:val="space"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`],
  ['word/document.xml',`<w:document xmlns:w="${W}"><w:body><w:p>${run('VORHER FHIR')}<w:fldSimple w:instr="DDE AUTO UNEXECUTED">${run('Name: Qvx / Qvy')}</w:fldSimple>${run('NACHHER HTTP/2')}</w:p><w:p><w:del w:id="1"><w:r><w:delText>REMOVED_REVISION_SENTINEL</w:delText></w:r></w:del><w:ins w:id="2">${run('FINAL_REVISION_SENTINEL ÄÖÜß')}</w:ins></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run('ECHTE_LISTENZEILE')}</w:p></w:body></w:document>`]
 ]);
}
module.exports=Object.freeze({presentationComments,wordFields});
