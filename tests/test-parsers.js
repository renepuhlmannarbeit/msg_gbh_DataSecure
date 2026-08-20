'use strict';
const assert=require('assert');const fs=require('fs');const path=require('path');
const {parseOoxml}=require('../server/ooxml');const {parsePdf}=require('../server/pdf-lite');
const fx=path.join(__dirname,'fixtures');
let r=parseOoxml(fs.readFileSync(path.join(fx,'synthetic_profile.docx')),'.docx');assert(r.markdown.includes('MAX MUSTERMANN'));assert.equal(r.attachments.length,1);
r=parseOoxml(fs.readFileSync(path.join(fx,'synthetic_customer.xlsx')),'.xlsx');assert(r.markdown.includes('max@example.de'));assert(r.markdown.includes('Arbeitsblatt'));assert.equal(r.attachments.length,1);
r=parseOoxml(fs.readFileSync(path.join(fx,'synthetic_contract.pptx')),'.pptx');assert(r.markdown.includes('Vertrag zwischen Alpha GmbH'));assert(r.markdown.includes('Kontakt max@example.de'));assert.equal(r.attachments.length,1);
r=parsePdf(fs.readFileSync(path.join(fx,'synthetic_customer.pdf')));assert(r.markdown.includes('Max Mustermann'));assert(r.markdown.includes('max@example.de'));
console.log('PASS parsers');
