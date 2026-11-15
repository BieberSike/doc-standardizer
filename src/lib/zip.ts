/**
 * 极简 ZIP 打包（仅 store 模式，不压缩）
 * —— 裁切后的 PNG 本身已是压缩格式，再做 deflate 收益极小，
 *    因此省掉第三方库，保持单文件离线运行。
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  private size = 0;

  get length() {
    return this.size;
  }

  u16(value: number) {
    this.parts.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
    this.size += 2;
  }

  u32(value: number) {
    const v = value >>> 0;
    this.parts.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]));
    this.size += 4;
  }

  bytes(data: Uint8Array) {
    this.parts.push(data);
    this.size += data.length;
  }

  toBlob(type: string) {
    return new Blob(this.parts as unknown as BlobPart[], { type });
  }
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/** 生成 ZIP 压缩包（文件名按 UTF-8 写入，中文名在资源管理器中正常显示） */
export function createZip(entries: ZipEntry[], date = new Date()): Blob {
  const writer = new ByteWriter();
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);

  interface Meta {
    name: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }
  const metas: Meta[] = [];

  for (const entry of entries) {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    const offset = writer.length;

    writer.u32(0x04034b50); // 本地文件头签名
    writer.u16(20); // 解压所需版本
    writer.u16(0x0800); // 通用标志：文件名为 UTF-8
    writer.u16(0); // 压缩方法：store
    writer.u16(dosTime);
    writer.u16(dosDate);
    writer.u32(crc);
    writer.u32(entry.data.length);
    writer.u32(entry.data.length);
    writer.u16(name.length);
    writer.u16(0); // extra
    writer.bytes(name);
    writer.bytes(entry.data);

    metas.push({ name, crc, size: entry.data.length, offset });
  }

  const cdOffset = writer.length;
  for (const meta of metas) {
    writer.u32(0x02014b50); // 中央目录签名
    writer.u16(20); // 生成版本
    writer.u16(20); // 解压版本
    writer.u16(0x0800);
    writer.u16(0);
    writer.u16(dosTime);
    writer.u16(dosDate);
    writer.u32(meta.crc);
    writer.u32(meta.size);
    writer.u32(meta.size);
    writer.u16(meta.name.length);
    writer.u16(0); // extra
    writer.u16(0); // comment
    writer.u16(0); // 起始磁盘号
    writer.u16(0); // 内部属性
    writer.u32(0); // 外部属性
    writer.u32(meta.offset);
    writer.bytes(meta.name);
  }

  const cdSize = writer.length - cdOffset;
  writer.u32(0x06054b50); // 目录结束记录
  writer.u16(0);
  writer.u16(0);
  writer.u16(metas.length);
  writer.u16(metas.length);
  writer.u32(cdSize);
  writer.u32(cdOffset);
  writer.u16(0);

  return writer.toBlob("application/zip");
}
