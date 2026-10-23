'use strict';

// Classification only. No decryptor, stream payload reader, key or resolver.
// Unknown/corrupt/large directory layouts remain unsupported CFB, never admitted.
function cfbHasProtectedPackage(fd,size,read) {
  const header=read(fd,512,0);
  if(header.length!==512||header.readUInt16LE(28)!==0xfffe)return false;
  const sectorSize=2**header.readUInt16LE(30);
  if(![512,4096].includes(sectorSize)||header.readUInt32LE(72)!==0)return false;
  const fat=[];let reads=512;
  const sector=id=>{
    const offset=(id+1)*sectorSize;
    if(!Number.isSafeInteger(offset)||offset<sectorSize||offset>size-sectorSize||reads+sectorSize>1024*1024)return null;
    reads+=sectorSize;return read(fd,sectorSize,offset);
  };
  for(let offset=76;offset<512;offset+=4) {
    const id=header.readUInt32LE(offset);if(id>=0xfffffffa)continue;
    const bytes=sector(id);if(!bytes)return false;
    for(let at=0;at<bytes.length;at+=4)fat.push(bytes.readUInt32LE(at));
  }
  const names=new Set(),seen=new Set();let id=header.readUInt32LE(48);
  while(id<0xfffffffa) {
    if(seen.has(id)||seen.size>=128||id>=fat.length)return false;
    seen.add(id);const bytes=sector(id);if(!bytes)return false;
    for(let offset=0;offset<bytes.length;offset+=128) {
      const kind=bytes[offset+66],length=bytes.readUInt16LE(offset+64);
      if(![1,2,5].includes(kind))continue;
      if(length<2||length>64||length%2||bytes.readUInt16LE(offset+length-2)!==0)return false;
      names.add(bytes.toString('utf16le',offset,offset+length-2));
    }
    id=fat[id];
  }
  return names.has('EncryptedPackage')&&(names.has('EncryptionInfo')||
    (names.has('DRMEncryptedDataSpace')&&names.has('DRMEncryptedTransform')));
}
module.exports=Object.freeze({cfbHasProtectedPackage});
