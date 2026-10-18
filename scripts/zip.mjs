/**
 * Minimal ZIP writer (no dependencies, no external tools).
 *
 * The release archive is built by `scripts/pack.mjs`; this module only knows
 * how to turn a list of files into a valid zip file so that the packaging
 * works the same on Windows, macOS and Linux.
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

/** CRC-32 (as used by the zip format). */
export function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

const DOS_TIME = 0;              // 00:00:00
const DOS_DATE = 33;             // 1980-01-01
const UTF8_FLAG = 0x0800;

function localHeader(name, crc, method, compressedSize, size) {
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(UTF8_FLAG, 6);
  head.writeUInt16LE(method, 8);
  head.writeUInt16LE(DOS_TIME, 10);
  head.writeUInt16LE(DOS_DATE, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(compressedSize, 18);
  head.writeUInt32LE(size, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28);
  return head;
}

function centralHeader(entry) {
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(0x0314, 4); // made by unix, zip 2.0 — keeps the file mode
  head.writeUInt16LE(20, 6);
  head.writeUInt16LE(UTF8_FLAG, 8);
  head.writeUInt16LE(entry.method, 10);
  head.writeUInt16LE(DOS_TIME, 12);
  head.writeUInt16LE(DOS_DATE, 14);
  head.writeUInt32LE(entry.crc, 16);
  head.writeUInt32LE(entry.compressedSize, 20);
  head.writeUInt32LE(entry.size, 24);
  head.writeUInt16LE(entry.name.length, 28);
  head.writeUInt16LE(0, 30);
  head.writeUInt16LE(0, 32);
  head.writeUInt16LE(0, 34);
  head.writeUInt16LE(0, 36);
  head.writeUInt32LE(entry.externalAttributes, 38);
  head.writeUInt32LE(entry.offset, 42);
  return head;
}

/**
 * Write a zip file.
 * @param {Array<{name: string, data: Buffer, directory?: boolean}>} files
 * @param {string} outPath
 */
export function writeZip(files, outPath) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    if (file.directory) {
      const dirName = name[name.length - 1] === 0x2f ? name : Buffer.concat([name, Buffer.from('/')]);
      const head = localHeader(dirName, 0, 0, 0, 0);
      parts.push(head, dirName);
      central.push({
        name: dirName, crc: 0, method: 0, compressedSize: 0, size: 0,
        externalAttributes: (0o40755 << 16) | 0x10, offset,
      });
      offset += head.length + dirName.length;
      continue;
    }
    const data = file.data;
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);
    const head = localHeader(name, crc, method, body.length, data.length);
    parts.push(head, name, body);
    central.push({
      name, crc, method, compressedSize: body.length, size: data.length,
      externalAttributes: (file.mode ?? 0o644) << 16, offset,
    });
    offset += head.length + name.length + body.length;
  }

  const directory = [];
  let directorySize = 0;
  for (const entry of central) {
    const head = centralHeader(entry);
    directory.push(head, entry.name);
    directorySize += head.length + entry.name.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  writeFileSync(outPath, Buffer.concat([...parts, ...directory, end]));
  return { entries: central.length, bytes: offset + directorySize + end.length };
}

/**
 * Read a zip file back into memory (used by the packaging test).
 * @param {string|Buffer} source path or buffer
 * @returns {Array<{name: string, data: Buffer, directory: boolean}>}
 */
export function readZip(source) {
  const buffer = Buffer.isBuffer(source) ? source : readFileSync(source);
  // find the end of central directory record
  let end = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end === -1) throw new Error('not a zip file');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    if (data.length !== size) throw new Error(`corrupt entry ${name}`);
    entries.push({ name, data, directory: name.endsWith('/') });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
