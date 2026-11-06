'use strict';
// Builds a real DEFLATE-compressed .docx-like archive, the way Word does, so the ZIP reader is tested on compressed data.
const zlib = require('node:zlib');

const table = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const u16 = (n) => Buffer.from([n & 255, (n >>> 8) & 255]);
const u32 = (n) => Buffer.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);

function zipDeflate(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), raw = Buffer.from(f.data), comp = zlib.deflateRawSync(raw), crc = crc32(raw);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), u16(20), u16(0), u16(8), u16(0), u16(0x21), u32(crc), u32(comp.length), u32(raw.length), u16(name.length), u16(0), name, comp]);
    central.push(Buffer.concat([Buffer.from([0x50, 0x4b, 1, 2]), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0x21), u32(crc), u32(comp.length), u32(raw.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    parts.push(local); offset += local.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.concat([Buffer.from([0x50, 0x4b, 5, 6]), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}

module.exports = { zipDeflate };
