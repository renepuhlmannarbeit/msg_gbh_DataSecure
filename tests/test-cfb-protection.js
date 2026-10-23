'use strict';
const assert=require('node:assert/strict');
const {cfbHasProtectedPackage}=require('../plugins/data-secure/server/gateway/cfb-protection');
function fixture(names) {
 const bytes=Buffer.alloc(1536);Buffer.from('d0cf11e0a1b11ae1','hex').copy(bytes);
 bytes.writeUInt16LE(0xfffe,28);bytes.writeUInt16LE(9,30);bytes.writeUInt32LE(1,48);
 for(let at=76;at<512;at+=4)bytes.writeUInt32LE(0xffffffff,at);bytes.writeUInt32LE(0,76);
 for(let at=512;at<1024;at+=4)bytes.writeUInt32LE(0xfffffffe,at);
 names.forEach((name,index)=>{const offset=1024+index*128;Buffer.from(name+'\0','utf16le').copy(bytes,offset);
   bytes.writeUInt16LE((name.length+1)*2,offset+64);bytes[offset+66]=2;});
 return bytes;
}
function inspect(bytes){return cfbHasProtectedPackage(1,bytes.length,(_fd,len,offset)=>bytes.subarray(offset,offset+len));}
let passed=0;const test=(name,fn)=>{fn();passed++;console.log(`PASS ${name}`);};
test('classifies encrypted package with EncryptionInfo, never decrypts',()=>assert.equal(inspect(fixture(['EncryptedPackage','EncryptionInfo'])),true));
test('classifies DRM package without password/key lookup',()=>assert.equal(inspect(fixture(['EncryptedPackage','DRMEncryptedDataSpace','DRMEncryptedTransform'])),true));
test('ordinary old workbook remains unsupported binary, not encryption guess',()=>assert.equal(inspect(fixture(['Workbook','SummaryInformation'])),false));
test('one lexical name is insufficient',()=>assert.equal(inspect(fixture(['EncryptedPackage'])),false));
test('names in arbitrary payload are not a directory proof',()=>{const b=fixture(['Workbook']);Buffer.from('EncryptedPackage EncryptionInfo','utf16le').copy(b,700);assert.equal(inspect(b),false);});
test('cyclic FAT directory is bounded and not accepted',()=>{const b=fixture(['EncryptedPackage','EncryptionInfo']);b.writeUInt32LE(1,516);assert.equal(inspect(b),false);});
test('invalid directory name length refuses classification',()=>{const b=fixture(['EncryptedPackage','EncryptionInfo']);b.writeUInt16LE(100,1088);assert.equal(inspect(b),false);});
test('extended DIFAT is an honest unsupported layout',()=>{const b=fixture(['EncryptedPackage','EncryptionInfo']);b.writeUInt32LE(1,72);assert.equal(inspect(b),false);});
console.log(`${passed} CFB protection classification cases PASS`);
