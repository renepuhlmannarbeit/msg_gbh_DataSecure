'use strict';

// Closed EMF+ record/object admission before the existing pinned SVG renderer.
// Unknown images, textures, effects, continuations, glyph-index text, GetDC and
// complex regions never reach permissive third-party playback. MS-EMFPLUS
// binary structures, not a file extension, supply all object/size authority.
const { assertXmlCharacters } = require('../xml-reader');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const damaged = () => fail('VISUAL_CONTENT_DAMAGED');
const unsupported = () => fail('VISUAL_EMF_PLUS_UNSUPPORTED');
const version = value => [0xdbc01001, 0xdbc01002].includes(value);

function createEmfPlusPreflight(maximum) {
  let header = false, ended = false, records = 0, hasText = false, drawingUnits = 0;
  const objects = new Map(), saves = [];
  const checkId = (id, kind) => { if (id > 63 || objects.get(id) !== kind) unsupported(); };
  function accept(bytes) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || ended) unsupported();
    let cursor = 0;
    while (cursor < bytes.length) {
      if (++records > maximum) fail('VISUAL_PROCESSING_LIMIT');
      if (cursor + 12 > bytes.length) damaged();
      const type = bytes.readUInt16LE(cursor), flags = bytes.readUInt16LE(cursor + 2), size = bytes.readUInt32LE(cursor + 4), dataSize = bytes.readUInt32LE(cursor + 8);
      if (size < 12 || size % 4 || dataSize !== size - 12 || cursor + size > bytes.length) damaged();
      const data = bytes.subarray(cursor + 12, cursor + size);
      const u32 = offset => { if (offset < 0 || offset + 4 > data.length) damaged(); return data.readUInt32LE(offset); };
      const f32 = offset => { if (offset < 0 || offset + 4 > data.length) damaged(); const value = data.readFloatLE(offset); if (!Number.isFinite(value) || Math.abs(value) > 1000000) unsupported(); return value; };
      const exact = length => { if (data.length !== length) damaged(); };
      const onlyFlags = mask => { if (flags & ~mask) unsupported(); };
      const rect = (offset, compressed) => {
        const values = compressed ? Array.from({length:4},(_,i)=>data.readInt16LE(offset+i*2)) : Array.from({length:4},(_,i)=>f32(offset+i*4));
        if (values[2] < 0 || values[3] < 0) unsupported();
      };
      const brush = value => { if (!(flags & 0x8000)) checkId(value, 'brush'); };
      if (!header && type !== 0x4001) unsupported();
      if (ended) damaged();
      switch (type) {
        case 0x4001:
          exact(16); onlyFlags(1);
          if (header || !version(u32(0)) || u32(4) > 1 || u32(8) < 1 || u32(8) > 9600 || u32(12) < 1 || u32(12) > 9600) unsupported();
          header = true; break;
        case 0x4002:
          exact(0); onlyFlags(0); if (saves.length) unsupported(); ended = true; break;
        case 0x4008: {
          if (flags & 0x8000) unsupported();
          const id = flags & 255, kind = (flags >>> 8) & 127;
          if (id > 63 || data.length < 4 || !version(u32(0))) unsupported();
          if (kind === 1) { exact(12); if (u32(4) !== 0) unsupported(); objects.set(id,'brush'); }
          else if (kind === 2) {
            exact(32); if (u32(4) !== 0 || u32(8) !== 0 || u32(12) !== 2 || f32(16) < 0 || f32(16) > 1024 || !version(u32(20)) || u32(24) !== 0) unsupported();
            objects.set(id,'pen');
          } else if (kind === 6) {
            if (data.length < 28 || u32(8) !== 2 || u32(12) !== 0 || f32(4) <= 0 || f32(4) > 1024) unsupported();
            const n=u32(20); if (!n || n>256 || Math.ceil((24+n*2)/4)*4!==data.length) damaged();
            let family; try { family=new TextDecoder('utf-16le',{fatal:true}).decode(data.subarray(24,24+n*2)); } catch { damaged(); }
            assertXmlCharacters(family,()=>Object.assign(new Error('VISUAL_CONTENT_DAMAGED'),{code:'VISUAL_CONTENT_DAMAGED'}));
            objects.set(id,'font');
          } else unsupported();
          break;
        }
        case 0x4009: exact(4); onlyFlags(0); break;
        case 0x400a: case 0x400b: {
          const fill=type===0x400a, start=fill?8:4; onlyFlags(fill?0xc000:0x403f);
          if (data.length<start) damaged();
          const n=u32(fill?4:0), step=(flags&0x4000)?8:16;
          if (!n || n>10000 || start+n*step!==data.length) damaged();
          if (fill) brush(u32(0)); else checkId(flags&255,'pen');
          for(let i=0;i<n;i++)rect(start+i*step,Boolean(flags&0x4000)); drawingUnits+=n; break;
        }
        case 0x400e: case 0x400f: {
          const fill=type===0x400e, start=fill?4:0; onlyFlags(fill?0xc000:0x403f);
          exact(start+((flags&0x4000)?8:16)); if(fill)brush(u32(0));else checkId(flags&255,'pen');
          rect(start,Boolean(flags&0x4000)); drawingUnits++; break;
        }
        case 0x401c: {
          // The pinned browser renderer discards LayoutRect width/height.
          // Admitting this would turn wrapped/clipped text into a different
          // visible field. Until a proven layout implementation is available,
          // refuse the text-bearing image before any permissive replay.
          unsupported();
          break;
        }
        case 0x4025: exact(4); onlyFlags(0); if(saves.includes(u32(0))||saves.length>=64)unsupported(); saves.push(u32(0)); break;
        case 0x4026: { exact(4); onlyFlags(0); const index=saves.indexOf(u32(0)); if(index<0)unsupported(); saves.splice(index); break; }
        case 0x402a: case 0x402c:
          exact(24); onlyFlags(type===0x402c?0x2000:0); for(let i=0;i<6;i++)f32(i*4);
          if(Math.abs(f32(0)*f32(12)-f32(4)*f32(8))<1e-12)unsupported(); break;
        case 0x402b: case 0x4031: exact(0); onlyFlags(0); break;
        case 0x402d: case 0x402e:
          exact(8); onlyFlags(0x2000); f32(0);f32(4); if(type===0x402e&&(!f32(0)||!f32(4)))unsupported(); break;
        case 0x402f: exact(4); onlyFlags(0x2000); f32(0); break;
        case 0x4030: exact(4); if(flags!==2||f32(0)!==1)unsupported(); break;
        case 0x4032: exact(16); if(![0,0x100].includes(flags))unsupported(); rect(0,false); break;
        case 0x401e: case 0x401f: case 0x4021: case 0x4022: case 0x4024:
          exact(0); if(flags>(type===0x401e?1:type===0x401f?5:type===0x4021?7:4))unsupported(); break;
        case 0x4023: exact(0); onlyFlags(0); break;
        default: unsupported();
      }
      if(drawingUnits>100000)fail('VISUAL_PROCESSING_LIMIT'); cursor+=size;
    }
  }
  return Object.freeze({accept, get records(){return records;}, get ended(){return ended;}, finish(){
    if(records&&(!header||!ended))unsupported(); return {present:header,hasText};
  }});
}
module.exports=Object.freeze({createEmfPlusPreflight});
