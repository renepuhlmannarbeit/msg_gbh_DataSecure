'use strict';

// Actual RAM-only OPC -> content Markdown -> source/privacy/publication. No
// Office installation, user fixtures, field execution or desktop assertion.
const crypto=require('node:crypto');
const {createSuite}=require('./helpers');
const {zipStore}=require('./lib/zip'),{opcControlEntries}=require('./lib/opc');
const {parseOoxml}=require('../plugins/data-secure/server/ooxml');
const {extractMarkdownBuffer}=require('../plugins/data-secure/server/standalone/markdown-extractor');
const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
const {test,testAsync,assert,done}=createSuite('Source-bound Word field/list/comment integration');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',S='http://purl.oclc.org/ooxml/wordprocessingml/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',PR='http://schemas.openxmlformats.org/package/2006/relationships';
const MC='http://schemas.openxmlformats.org/markup-compatibility/2006',M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const esc=s=>String(s).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;');
const run=t=>`<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`,p=t=>`<w:p>${run(t)}</w:p>`;
const char=t=>`<w:r><w:fldChar w:fldCharType="${t}"/></w:r>`,code=t=>`<w:r><w:instrText>${esc(t)}</w:instrText></w:r>`;
const field=(t,instr='DDE AUTO UNEXECUTED')=>char('begin')+code(instr)+char('separate')+run(t)+char('end');
const simple=(t,instr='INCLUDETEXT file:///NOT_READ')=>`<w:fldSimple w:instr="${esc(instr)}">${run(t)}</w:fldSimple>`;
const ref=id=>`<w:r><w:commentReference w:id="${id}"/></w:r>`;
const pr=(num,level=0)=>`<w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${num}"/></w:numPr></w:pPr>`;
const wrap=(kind,body)=>`<w:${kind} xmlns:w="${W}" xmlns:mc="${MC}" xmlns:m="${M}">${body}</w:${kind}>`;
function doc(body,{parts={},relationships,namespace=W}={}){
 const entries=[...opcControlEntries('docx',{additionalOverrides:Object.keys(parts).map(kind=>({part:`word/${kind}.xml`,contentType:`application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`}))}),
  ['word/document.xml',`<w:document xmlns:w="${namespace}" xmlns:mc="${MC}" xmlns:m="${M}"><w:body>${body}</w:body></w:document>`],
  ...Object.entries(parts).map(([kind,value])=>[`word/${kind}.xml`,value])];
 if(relationships!==undefined||Object.keys(parts).length)entries.push(['word/_rels/document.xml.rels',`<Relationships xmlns="${PR}">${relationships??Object.keys(parts).map(kind=>`<Relationship Id="${kind}" Type="${R}/${kind}" Target="${kind}.xml"/>`).join('')}</Relationships>`]);
 return zipStore(entries);
}
const opts={markdownOutput:'content-v1',partialExtraction:true};
const extract=b=>extractMarkdownBuffer(b,'.docx',opts);
const strict=b=>parseOoxml(b,'.docx',undefined,{preserveText:true,contentMode:true,literalMarkup:true});
const count=(md,value)=>assert.equal(md.split(value).length-1,1,value);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const numbering=wrap('numbering',`<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:suff w:val="space"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1.%2)"/><w:lvlRestart w:val="1"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="8"/></w:lvlOverride></w:num>`);
const comments=body=>wrap('comments',body);
const comment=(id,text,author='Anna Berger')=>`<w:comment w:id="${id}" w:author="${esc(author)}">${p(text)}</w:comment>`;

test('actual simple and nested complex fields retain stored results once, never instructions',()=>{
 const b=doc(`<w:p>${run('BEFORE ')}${simple('SIMPLE')}${run(' MIDDLE ')}${char('begin')}${code('IF ')}${field('NOT_VISIBLE_INSTRUCTION_RESULT')}${char('separate')}${run('OUTER ')}${field('INNER')}${char('end')}${run(' AFTER HTTP/2')}</w:p>`),before=hash(b),md=extract(b).markdown;
 for(const value of ['BEFORE','SIMPLE','MIDDLE','OUTER','INNER','AFTER HTTP/2'])count(md,value);
 assert.doesNotMatch(md,/UNEXECUTED|INCLUDETEXT|NOT_READ|NOT.VISIBLE.INSTRUCTION/u);assert.match(md,/gespeicherte Feldresultate, nicht neu berechnet/u);assert.equal(hash(b),before);
});

test('actual content entrances retain standalone instrText exactly like ordinary run text, not an unexecuted field',()=>{
 const {extractOfficeMarkdownAndMedia}=require('../plugins/data-secure/server/standalone/markdown-extractor');
 for(const namespace of [W,S])for(const value of ['Name: Qvx / Qvy ÄÖÜß 😀','DDE AUTO file:///NEVER_READ https://example.invalid/NEVER_FETCH','A &amp; <literal> | [PERSON_001]']){
  const literal=doc(`<w:p>${run('BEFORE ')}${code(value)}${run(' AFTER')}</w:p>`,{namespace}),ordinary=doc(`<w:p>${run('BEFORE ')}${run(value)}${run(' AFTER')}</w:p>`,{namespace}),before=hash(literal);
  for(const entrance of [extract,b=>extractOfficeMarkdownAndMedia(b,'.docx',opts).extraction]){
   const result=entrance(literal);assert.equal(result.markdown,entrance(ordinary).markdown);assert.match(result.markdown,/BEFORE[\s\S]*AFTER/u);
   // The pre-existing engineering coverage inventory remains conservative
   // about non-basic Word tags; literal support is not universal completeness.
   assert.deepEqual(result.coverage,{status:'incomplete',reason_codes:['SOURCE_COVERAGE_UNVERIFIED']});
   assert.doesNotMatch(result.markdown,/Word-Felder: gespeicherte Feldresultate/u);
  }
  assert.equal(hash(literal),before);
 }
});
test('literal instrText CDATA and entities preserve source scalars once and update genuine comment UTF-16 anchors',()=>{
 const value='😀ÄÖÜß🙂 &amp; <literal>',b=doc(`<w:p><w:r><w:instrText xml:space="preserve">😀ÄÖÜß&#x1F642; &amp;amp; &lt;literal&gt;</w:instrText></w:r>${ref('0')}</w:p>`,{parts:{comments:comments(comment('0','Independent comment fact'))}});
 const before=hash(b),md=extract(b).markdown;assert.ok(md.includes(`Quelltextposition ${value.length} (UTF-16)`));
 assert.equal(extract(doc('<w:p><w:r><w:instrText><![CDATA[ <literal> &unknown; ÄÖÜß😀 ]]></w:instrText></w:r></w:p>')).markdown,
  extract(doc(`<w:p>${run(' <literal> &unknown; ÄÖÜß😀 ')}</w:p>`)).markdown);
 assert.equal(hash(b),before);
});
test('real saved-result instrText keeps the authentic field owner; outer code still hides inner cached text',()=>{
 const body=`<w:p>${char('begin')}${code('OUTER_CODE')}${simple('HIDDEN_SIMPLE')}${char('begin')}${code('INNER_CODE')}${char('separate')}${code('HIDDEN_RESULT')}${char('end')}${char('separate')}${code('Name: Qvx')}${char('end')}${run(' / ')}<w:fldSimple w:instr="NEVER_EXECUTE">${code('Qvy')}</w:fldSimple>${code(' HTTP/2')}</w:p>`;
 const md=extract(doc(body)).markdown;assert.match(md,/\| Name: Qvx \/ Qvy HTTP\/2 \|/u);
 assert.doesNotMatch(md,/OUTER.CODE|INNER.CODE|HIDDEN.SIMPLE|HIDDEN.RESULT|NEVER.EXECUTE/u);count(md,'Qvx');count(md,'Qvy');
});
test('actual literal text leaves reject wrong owners, nested elements, foreign vocabularies and malformed Unicode',()=>{
 for(const body of ['<w:p><w:instrText>WRONG_PARENT</w:instrText></w:p>',
  '<w:r><w:instrText>NO_PARAGRAPH</w:instrText></w:r>',
  '<w:p><w:r><w:instrText><w:t>NESTED</w:t></w:instrText></w:r></w:p>',
  `<w:p>${char('begin')}<w:r><w:instrText><w:fldChar w:fldCharType="separate"/></w:instrText></w:r>${char('end')}</w:p>`,
  '<w:p><w:r><w:instrText><mc:AlternateContent><mc:Choice Requires="w"><w:t>NESTED</w:t></mc:Choice><mc:Fallback/></mc:AlternateContent></w:instrText></w:r></w:p>',
  '<w:p><w:r><w:instrText><mc:AlternateContent><mc:Choice Requires="w"/><mc:Fallback/></mc:AlternateContent></w:instrText></w:r></w:p>',
  `<w:p>${char('begin')}<w:r><w:instrText><mc:AlternateContent><mc:Choice Requires="foreign" xmlns:foreign="urn:foreign">${run('UNSELECTED')}</mc:Choice><mc:Fallback/></mc:AlternateContent></w:instrText></w:r>${char('end')}</w:p>`,
  '<w:p><w:r><f:instrText xmlns:f="urn:foreign">FOREIGN</f:instrText></w:r></w:p>'])assert.throws(()=>strict(doc(body)),{code:'DOCX_STRUCTURE_UNSAFE'});
 // A raw JS lone surrogate is replaced by Buffer.from before these real UTF-8
 // bytes exist; use actual forbidden source scalars/references in this layer.
 for(const value of ['&#0;','&#xD800;','\u0000','&#127;','&unknown;'])assert.throws(()=>strict(doc(`<w:p><w:r><w:instrText>${value}</w:instrText></w:r></w:p>`)));
});
test('field closure preserves actual cross-paragraph text but does not declassify the same-parent suffix',()=>{
 const md=extract(doc(`<w:p>${char('begin')}${code('FORMTEXT')}${char('separate')}${run('Name:')}</w:p><w:p>${run('Qvx / Qvy')}${char('end')}${run(' HTTP/2 FHIR 123')}</w:p>`)).markdown;
 assert.match(md,/\| Name:<br>Qvx \/ Qvy \|/u);assert.match(md,/\| Geschützter Tabellenwert \|[\s\S]*HTTP\/2 FHIR 123/u);count(md,'Qvx / Qvy');count(md,'HTTP/2 FHIR 123');
});
test('actual closed label before a stored field is not detached from its value',()=>{
 const md=extract(doc(`<w:p>${run('Name: ')}${field('Qvx / Qvy')}${run(' HTTP/2')}</w:p>`)).markdown;
 assert.match(md,/\| Name: Qvx \/ Qvy HTTP\/2 \|/u);count(md,'Qvx / Qvy');count(md,'HTTP/2');
});
test('explicit saved final view includes additions and move-to, not old text or old list properties',()=>{
 const md=extract(doc(`<w:p><w:pPr><w:pPrChange><w:pPr><w:numPr><w:numId w:val="99"/></w:numPr></w:pPr></w:pPrChange></w:pPr>${run('CURRENT ')}<w:del>${run('DELETED')}</w:del><w:ins>${run('INSERTED ')}</w:ins><w:moveFrom>${run('OLDMOVE')}</w:moveFrom><w:moveTo>${run('NEWMOVE')}</w:moveTo></w:p>`)).markdown;
 assert.match(md,/CURRENT[\s\S]*INSERTED[\s\S]*NEWMOVE/u);assert.doesNotMatch(md,/DELETED|OLDMOVE|Listennummerierung/u);assert.match(md,/Word-Ansicht: gespeicherter Endstand/u);
});
test('real numbering maintains start, nested restart and independent concrete list starts without source prefix fabrication',()=>{
 const body=[[1,0,'First'],[1,1,'ChildA'],[1,1,'ChildB'],[1,0,'Second'],[1,1,'ResetChild'],[2,0,'Override']].map(([id,lv,t])=>`<w:p>${pr(id,lv)}${run(t)}</w:p>`).join('');
 const md=extract(doc(body,{parts:{numbering}})).markdown;
 for(const value of ['3\\.','3\\.a\\)','3\\.b\\)','4\\.','4\\.a\\)','8\\.'])count(md,'| '+value+' |');
 for(const value of ['First','ChildA','ChildB','Second','ResetChild','Override'])count(md,value);
 assert.doesNotMatch(md,/- First/u);
});
test('actual paragraph style binds only its real abstract level, not a lexical list-style guess',()=>{
 const n=numbering.replace('<w:start w:val="1"/>','<w:pStyle w:val="ExactList"/><w:start w:val="1"/>');
 const styles=wrap('styles','<w:style w:type="paragraph" w:styleId="ExactList"><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>');
 const md=extract(doc(`<w:p>${pr(1)}${run('Ancestor')}</w:p><w:p><w:pPr><w:pStyle w:val="ExactList"/></w:pPr>${run('StyledChild')}</w:p>`,{parts:{numbering:n,styles}})).markdown;
 assert.ok(md.includes('| 3\\.a\\) |'));count(md,'StyledChild');
});
test('missing, wrongly related or unmodeled numbering retains prose with no invented marker',()=>{
 for(const options of [{},{parts:{numbering},relationships:''},{parts:{numbering:numbering.replace('decimal','chicago')}}]){
  const out=extract(doc(`<w:p>${pr(1)}${run('KEEP PROSE')}</w:p>`,options));assert.match(out.markdown,/KEEP PROSE/u);assert.doesNotMatch(out.markdown,/Listennummerierung|^- /mu);assert.ok(out.coverage.reason_codes.length);
 }
});
test('font-coded private-use list glyphs remain unmodeled, readable Unicode bullets and source characters are not globally filtered',()=>{
 for(const cp of [0xf0b7,0xf0001,0x100001]){
  const glyph=String.fromCodePoint(cp),n=numbering.replace('w:val="decimal"','w:val="bullet"').replace('w:val="%1."','w:val="'+glyph+'"');
  const out=extract(doc(`<w:p>${pr(1)}${run('Ä Ö Ü ß 中文 العربية')}</w:p>`,{parts:{numbering:n}}));
  assert.doesNotMatch(out.markdown,/Listennummerierung/u);assert.ok(!out.markdown.includes(glyph));assert.match(out.markdown,/Ä Ö Ü ß 中文 العربية/u);assert.ok(out.coverage.reason_codes.length);
 }
 const n=numbering.replace('w:val="decimal"','w:val="bullet"').replace('w:val="%1."','w:val="•"');
 assert.match(extract(doc(`<w:p>${pr(1)}${run('Ä Ö Ü ß 中文 العربية')}</w:p>`,{parts:{numbering:n}})).markdown,/\| • \|/u);
 assert.ok(extract(doc(p('Originalquelle: \uf0b7'))).markdown.includes('\uf0b7'));
});
test('nested textbox list occurrences do not consume the containing body counter or claim a proven textbox sequence',()=>{
 const box=`<w:r><w:drawing xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:txbx><w:txbxContent><w:p>${pr(1)}${run('TEXTBOX SOURCE')}</w:p></w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r>`;
 const out=extract(doc(`<w:p>${pr(1)}${run('OUTER SOURCE')}${box}</w:p><w:p>${pr(1)}${run('NEXT SOURCE')}</w:p>`,{parts:{numbering}}));
 count(out.markdown,'| 3\\. |');count(out.markdown,'| 4\\. |');assert.ok(!out.markdown.includes('| 5\\. |'));count(out.markdown,'TEXTBOX SOURCE');assert.ok(out.coverage.reason_codes.length);
});
test('actual range, point and table-level range bind each referenced comment body/author exactly once',()=>{
 const parts={comments:comments(comment('0','Name: Qvx / Qvy')+comment('1','CommentFact HTTP/2','Murat Kaya')+comment('2','TableComment FHIR'))};
 const body=`<w:commentRangeStart w:id="2"/><w:tbl><w:tr><w:tc>${p('CellFact')}</w:tc></w:tr></w:tbl><w:commentRangeEnd w:id="2"/><w:p><w:commentRangeStart w:id="0"/>${run('😀 ÄÖÜß')}<w:commentRangeEnd w:id="0"/>${ref('0')}<w:commentRangeStart w:id="1"/>${ref('1')}${ref('2')}</w:p>`;
 const md=extract(doc(body,{parts})).markdown;
 for(const value of ['Name: Qvx / Qvy','CommentFact HTTP/2','TableComment FHIR','Murat Kaya'])count(md,value);
 assert.equal(md.split('| Anna Berger |').length-1,2);assert.match(md,/Quellstruktur root 0/u);assert.match(md,/Punktanker:/u);assert.match(md,/Quelltextposition 7 \(UTF-16\)/u);
});
test('unreferenced, hidden-revision and unselected-MC comment bodies never leak into normal Markdown',()=>{
 const body=`<w:p>${run('FACT')}<w:del>${ref('0')}</w:del><mc:AlternateContent><mc:Choice Requires="bad" xmlns:bad="urn:foreign">${ref('1')}</mc:Choice><mc:Fallback>${run('SELECTED')}</mc:Fallback></mc:AlternateContent></w:p>`;
 const md=extract(doc(body,{parts:{comments:comments(comment('0','DELETED_COMMENT')+comment('1','UNSELECTED_COMMENT')+comment('2','ORPHAN_COMMENT'))}})).markdown;
 assert.match(md,/FACT[\s\S]*SELECTED/u);assert.doesNotMatch(md,/COMMENT|Anna Berger/u);
});
test('field cell ownership, malformed controls, misplaced text and duplicate comment references fail typed',()=>{
 for(const body of [
  `<w:p>${char('end')}${run('X')}</w:p>`,
  `<w:p>${char('begin')}${char('separate')}${run('X')}</w:p>`,
  `<w:p><w:instrText>MISPLACED_TEXT</w:instrText>${run('X')}</w:p>`,
  `<w:p><w:pPr>${run('MISPLACED CURRENT TEXT')}</w:pPr>${run('X')}</w:p>`,
  `<w:p><w:pPr>NON_PROPERTY_PROSE</w:pPr>${run('X')}</w:p>`,
  `<w:tbl><w:tr><w:tc><w:p>${char('begin')}${char('separate')}${run('X')}</w:p></w:tc><w:tc><w:p>${run('Y')}${char('end')}</w:p></w:tc></w:tr></w:tbl>`,
  `<w:p>${char('begin')}${char('separate')}${run('X')}</w:p><w:tbl><w:tr><w:tc>${p('Y')}</w:tc></w:tr></w:tbl><w:p>${char('end')}</w:p>`,
  `<w:p>${char('begin')}${char('separate')}<w:txbxContent>${p('Y')}</w:txbxContent>${char('end')}</w:p>`,
  `<w:p>${ref('0')}${ref('0')}</w:p>`
 ])assert.throws(()=>strict(doc(body,{parts:{comments:comments(comment('0','BODY'))}})),{code:'DOCX_STRUCTURE_UNSAFE'});
});
test('wrong comment role, MIME and namespace never borrow stored source metadata authority',()=>{
 const body=`<w:p>${run('FACT')}${ref('0')}</w:p>`,c=comments(comment('0','SECRET'));
 for(const options of [
  {parts:{comments:c},relationships:''},
  {parts:{comments:c},relationships:`<Relationship Id="c" Type="${R}/comments" Target="comments.xml" TargetMode="External"/>`},
  {parts:{comments:c.replace(W,'urn:not-word')}}
 ])assert.throws(()=>strict(doc(body,options)));
 const entries=require('../plugins/data-secure/server/zip-reader').readZip(doc(body,{parts:{comments:c}}));
 entries.set('[Content_Types].xml',Buffer.from(entries.get('[Content_Types].xml').toString().replace('wordprocessingml.comments+xml','wordprocessingml.styles+xml')));
 assert.throws(()=>strict(zipStore([...entries])));
});
test('Strict and canonical alias text, MC selection and literal Unicode keep source values once',()=>{
 for(const namespace of [W,S]){
  const b=doc(`<w:p><mc:AlternateContent><mc:Choice Requires="m">${simple('Ä Ö Ü ß 中文 العربية 😀 &amp;')}</mc:Choice><mc:Fallback>${run('NOT_SELECTED')}</mc:Fallback></mc:AlternateContent></w:p>`,{namespace});
  const md=extract(b).markdown;count(md,'Ä Ö Ü ß 中文 العربية 😀');assert.doesNotMatch(md,/NOT.SELECTED/u);assert.match(md,/&amp;amp;/u);
 }
});
test('legacy notes parser retains old unsupported-field boundary and does not acquire new context rights',()=>{
 const b=doc(`<w:p>${simple('NEW_FIELD_RESULT')}${run('LEGACY_FACT')}</w:p>`),old=parseOoxml(b,'.docx');
 assert.match(old.markdown,/LEGACY.FACT/u);assert.doesNotMatch(old.markdown,/NEW.FIELD.RESULT/u);assert.ok(old.warnings.length);
});
test('actual field/table/math values preserve source order and source leaf once',()=>{
 const math=`<m:oMath><m:f><m:num><m:r><m:t>FORMULA_SOURCE</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath>`;
 const b=doc(`<w:tbl><w:tr><w:tc>${p('Name')}</w:tc><w:tc><w:p>${field('Qvx / Qvy')}${run(' HTTP/2 FHIR')}</w:p></w:tc></w:tr><w:tr><w:tc>${p('Math')}</w:tc><w:tc><w:p>${char('begin')}${char('separate')}${math}${char('end')}</w:p></w:tc></w:tr></w:tbl>`),md=extract(b).markdown;
 for(const value of ['Qvx / Qvy','HTTP/2 FHIR','FORMULA'])count(md,value);assert.match(md,/gespeichertes Feldresultat/u);assert.match(md,/Zähler/u);assert.match(md,/Nenner/u);
});

for(const profile of ['general','personnel_profile'])testAsync('actual OPC source/privacy/trace/publication/Keep '+profile,async()=>{
 const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy');
 const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
 const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
 const {verifyAnonymizedPublication}=require('../plugins/data-secure/server/standalone/anonymized-artifact');
 const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review');
 const {bindStandaloneDocumentKeeps}=require('../plugins/data-secure/server/privacy/residual-person-review');
 const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false};
 const b=doc(`<w:p>${pr(1)}${run('Name: ')}${field('Qvx / Qvy')}${run(' HTTP/2 FHIR 123')}${ref('0')}</w:p><w:p>${char('begin')}${char('separate')}${run('Name:')}</w:p><w:p>${run('Qwz / Qwt')}${char('end')}${run(' FACT_AFTER')}</w:p><w:p>${run('Name: ')}<m:oMath><m:r><m:t>Qmx / Qmy</m:t></m:r></m:oMath>${field('TECHNICALFIELD')}</w:p><w:p><w:ins w:id="9">${run('Name: Qrx / Qry')}</w:ins></w:p>${p('Protokoll: HTTP/2 FHIR REST HL7')}${p('Unabhängiger Kontext: HTTP/2 FHIR 123')}`,{parts:{numbering,comments:comments(comment('0','Name: Qab / Qac'))}}),before=hash(b);
 const source=await extractSourceForPrivacy(b,'.docx',{contentOptions,convertBuffer:async value=>{const out=extract(value);return createMarkdownExtraction({source_type:out.source_type,markdown:out.markdown,coverage:out.coverage,content_options:contentOptions});}});
 const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 for(const value of ['TECHNICALFIELD','FACT\\_AFTER']){assert.ok(source.markdown.includes(value));assert.ok(!final.markdown.includes(value));}
 assert.doesNotMatch(final.markdown,/Anna Berger|Qvx|Qvy|Qwz|Qwt|Qab|Qac|Qmx|Qmy|Qrx|Qry/u);assert.match(final.markdown,/Unabhängiger Kontext: HTTP\/2 FHIR 123/u);assert.match(final.markdown,/Protokoll: HTTP\/2 FHIR REST HL7/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
 const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};assert.ok(verifyAnonymizedPublication(proof));
 const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace}),target=entities.find(value=>value.original.includes('Qvx'));assert.ok(target);
 const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,19));
 assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(value=>value.decision==='keep').map(({start,end})=>({start,end})))}),{code:'STANDALONE_PUBLICATION_INVALID'});
 assert.equal(hash(b),before);
});
for(const profile of ['general','personnel_profile'])for(const reviewPolicy of ['manual','automatic-conservative'])
 for(const layout of ['isolated','adjacent','ordinary-adjacent','header-adjacent'])
 testAsync('literal instrText actual OPC/source/privacy/trace/publication/Keep '+profile+'/'+reviewPolicy+'/'+layout,async()=>{
  const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy');
  const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
  const {reviewedBatchText}=require('../plugins/data-secure/server/gateway/batch-review-policy');
  const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
  const {verifyAnonymizedPublication}=require('../plugins/data-secure/server/standalone/anonymized-artifact');
  const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review');
  const {bindStandaloneDocumentKeeps}=require('../plugins/data-secure/server/privacy/residual-person-review');
  const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false};
  const math='<m:oMath><m:r><m:t>1</m:t></m:r></m:oMath>';
  const box=`<w:r><w:drawing><w:txbxContent>${p('Protokoll: HTTP/2 FHIR REST HL7')}</w:txbxContent></w:drawing></w:r>`;
  let body=`<w:p>${run('Name: ')}${code('Qix / Qiy')}</w:p>`+
   `<w:p>${code('Name: Qjx')}${math}${code(' / Qjy')}</w:p>`+
   (layout==='isolated'?p('Tabellenbezug: HTTP/2'):'')+
   `<w:tbl><w:tr>${layout==='isolated'||layout==='header-adjacent'?'<w:trPr><w:tblHeader/></w:trPr>':''}<w:tc>${p('Name')}</w:tc><w:tc>${p('Fachtext')}</w:tc></w:tr><w:tr><w:tc><w:p>${code('Qkx / Qky')}</w:p></w:tc><w:tc>${p('FHIR REST 123')}</w:tc></w:tr></w:tbl>`+
   `<w:p>${char('begin')}${code('UNEXECUTED_HIDDEN_CODE')}${char('separate')}${code('Name: Qmx')}${char('end')}${code(' / Qmy')}</w:p>`+
   `<w:p>${run('Anchor😀')}${ref('0')}</w:p>`+p('Unabhängiger Kontext: HTTP/2 FHIR 123');
  const parts={comments:comments(`<w:comment w:id="0" w:author="Anna Berger"><w:p>${code('Name: Qlx')}${box}${code(' / Qly')}</w:p></w:comment>`)};
  if(layout==='ordinary-adjacent'){
   body=body.replaceAll('w:instrText','w:t');parts.comments=parts.comments.replaceAll('w:instrText','w:t');
  }
  const b=doc(body,{parts}),before=hash(b);
  const originalPins={adjacent:'1a8e515b1491bdb373bde097cd4613095cc53a3b9431ac63ae99bc0da95a4797',
   'ordinary-adjacent':'8479b204c961eb2d1e472e083bfc4dcb0358fc1f70ee83052632873684820924',
   'header-adjacent':'f9ac2234f2e27b7dc2e3bc0e53b983c4548f84bbb9896a6d4d18b20015a1e8b3'};
  if(originalPins[layout])assert.equal(before,originalPins[layout],'retain exact original failing ZIP, not a repaired fixture');
  const source=await extractSourceForPrivacy(b,'.docx',{contentOptions,convertBuffer:async bytes=>{
   const out=extract(bytes);return createMarkdownExtraction({source_type:out.source_type,markdown:out.markdown,coverage:out.coverage,content_options:contentOptions});
  }});
  const values=['Qix','Qiy','Qjx','Qjy','Qkx','Qky','Qlx','Qly','Qmx','Qmy'];
  for(const value of values)count(source.markdown,value);
  assert.doesNotMatch(source.markdown,/UNEXECUTED.HIDDEN.CODE/u);assert.match(source.markdown,/Name: Qix \/ Qiy/u);
  const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
  let manualCalls=0;
  const reviewed=await resolveTextPrivacyReview(prepared,reviewPolicy==='manual'?draft=>{
   manualCalls++;return reviewedBatchText(draft,draft.ambiguities.map(value=>({ambiguity_id:value.ambiguity_id,decision:'redact'})));
  }:null,{reviewPolicy});
  if(reviewPolicy==='manual')assert.equal(manualCalls,1);
  const final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
  for(const value of [...values,'Anna Berger'])assert.ok(!final.markdown.includes(value),value+' must not survive');
  assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
  for(const fact of ['Protokoll: HTTP/2 FHIR REST HL7','Unabhängiger Kontext: HTTP/2 FHIR 123','FHIR REST 123'])assert.ok(final.markdown.includes(fact));
  const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};
  assert.ok(verifyAnonymizedPublication(proof));
  const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace});
  for(const value of values){
   const target=entities.find(entity=>entity.original.includes(value));assert.ok(target,'real trace source for '+value);
   const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,23));
   assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(entity=>entity.decision==='keep').map(({start,end})=>({start,end})))}),{code:'STANDALONE_PUBLICATION_INVALID'});
  }
  assert.equal(hash(b),before);
  // tblHeader is a repeat-header presentation instruction, not the only
  // authority for recognising an authored Name label. The original adjacent
  // cases must now succeed without inserting a paragraph or guessing data.
 });

done();
