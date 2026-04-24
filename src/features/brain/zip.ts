/**
 * Minimal STORE-only ZIP codec. No DEFLATE, no encryption, no ZIP64.
 * Written from the PKWARE APPNOTE.TXT spec so we don't take a new
 * runtime dependency for a feature that's used a handful of times
 * per user lifetime.
 *
 * Handles:
 *   - Files encoded as "Stored" (method 0, zero compression)
 *   - Central directory + End-of-central-directory record
 *   - UTF-8 filenames (General Purpose Bit 11 set)
 *   - Basic round-trip read/write for our own archives
 *
 * Explicitly unsupported:
 *   - DEFLATE / DEFLATE64 / any compression
 *   - ZIP64 (for archives > 4GB; Brain backups never hit this)
 *   - Encryption
 *   - Multi-disk / spanning
 *   - Unicode extra fields
 *
 * Good enough for ~a few dozen small text files. Archives written here
 * open cleanly in Windows Explorer, macOS Finder, and any `unzip`.
 */
import * as zlib from "zlib";

export interface ZipEntry {
  /** Path inside the archive, forward-slash separated. */
  path: string;
  /** File contents. */
  data: Buffer;
}

/** PKWARE ZIP signatures. */
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function crc32(buf: Buffer): number {
  // Use node's zlib-backed CRC32 via the well-known trick: `deflateRawSync`
  // strips the header so plain CRC isn't directly exposed, but Node 14+
  // exports `zlib.crc32`. Fall back to a manual table-driven implementation
  // to cover older runtimes.
  const z = zlib as unknown as { crc32?: (b: Buffer) => number };
  if (typeof z.crc32 === "function") return z.crc32(buf) >>> 0;

  // Table-driven CRC32 (standard polynomial 0xEDB88320).
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Serialise a list of entries into a single ZIP buffer. Entries are
 * stored uncompressed (method 0) so we don't need DEFLATE support on
 * the reader side. MS-DOS date/time fields are fixed at a sensible
 * constant — ZIP archives require them but no consumer reads them
 * meaningfully for our use case.
 */
export function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  type CentralMeta = {
    nameBuf: Buffer;
    crc: number;
    size: number;
    offset: number;
  };
  const metas: CentralMeta[] = [];
  let offset = 0;

  // Fixed MS-DOS date/time: 2020-01-01 00:00:00 — reproducible builds,
  // consumer doesn't care for our use case.
  const dosTime = 0x0000;
  const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.path, "utf-8");
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);              // version needed
    local.writeUInt16LE(1 << 11, 6);          // general purpose (UTF-8)
    local.writeUInt16LE(0, 8);                // method = store
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);            // compressed size
    local.writeUInt32LE(size, 22);            // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);               // extra length
    nameBuf.copy(local, 30);

    locals.push(local);
    locals.push(e.data);
    metas.push({ nameBuf, crc, size, offset });
    offset += local.length + e.data.length;
  }

  const centralStart = offset;
  const centrals: Buffer[] = [];
  for (const m of metas) {
    const central = Buffer.alloc(46 + m.nameBuf.length);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);              // version made by
    central.writeUInt16LE(20, 6);              // version needed
    central.writeUInt16LE(1 << 11, 8);          // general purpose
    central.writeUInt16LE(0, 10);              // method
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(m.crc, 16);
    central.writeUInt32LE(m.size, 20);
    central.writeUInt32LE(m.size, 24);
    central.writeUInt16LE(m.nameBuf.length, 28);
    central.writeUInt16LE(0, 30);              // extra length
    central.writeUInt16LE(0, 32);              // comment length
    central.writeUInt16LE(0, 34);              // disk number
    central.writeUInt16LE(0, 36);              // internal attrs
    central.writeUInt32LE(0, 38);              // external attrs
    central.writeUInt32LE(m.offset, 42);
    m.nameBuf.copy(central, 46);
    centrals.push(central);
    offset += central.length;
  }
  const centralSize = offset - centralStart;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);                    // disk
  eocd.writeUInt16LE(0, 6);                    // start disk
  eocd.writeUInt16LE(metas.length, 8);         // records on this disk
  eocd.writeUInt16LE(metas.length, 10);        // total records
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);                   // comment length

  return Buffer.concat([...locals, ...centrals, eocd]);
}

/**
 * Parse a ZIP buffer into entries. Only STORE-method entries are
 * decoded; anything else throws. Unknown extras are ignored.
 */
export function readZip(buf: Buffer): ZipEntry[] {
  // Locate the EOCD record by scanning backwards from the end. EOCD
  // is at least 22 bytes; comment length field caps search distance.
  let eocdPos = -1;
  const maxScan = Math.min(buf.length, 65557);
  for (let i = buf.length - 22; i >= buf.length - maxScan; i--) {
    if (i < 0) break;
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error("ZIP: end-of-central-directory record not found");

  const totalRecords = buf.readUInt16LE(eocdPos + 10);
  const centralOffset = buf.readUInt32LE(eocdPos + 16);

  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < totalRecords; i++) {
    if (buf.readUInt32LE(cursor) !== SIG_CENTRAL) {
      throw new Error(`ZIP: central-directory header mismatch at record ${i}`);
    }
    const method = buf.readUInt16LE(cursor + 10);
    const compSize = buf.readUInt32LE(cursor + 20);
    const uncompSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.subarray(cursor + 46, cursor + 46 + nameLen).toString("utf-8");
    cursor += 46 + nameLen + extraLen + commentLen;

    if (method !== 0) {
      throw new Error(`ZIP: "${name}" uses compression method ${method}; only STORE (0) supported`);
    }

    // Parse the local header to get the data offset (extra length can
    // differ between local + central; rely on local for the real
    // payload location).
    if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new Error(`ZIP: local header mismatch for "${name}"`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (data.length !== uncompSize) {
      throw new Error(`ZIP: size mismatch for "${name}" (expected ${uncompSize}, got ${data.length})`);
    }
    entries.push({ path: name, data: Buffer.from(data) });
  }
  return entries;
}
