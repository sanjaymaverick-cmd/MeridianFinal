/**
 * Rasterize public/favicon.svg (exact M path) into desktop/icon.png + icon.ico.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "desktop");

const BG = [0x0a, 0x0b, 0x0c, 0xff];
const FG = [0xc8, 0xcc, 0xd4, 0xff];

/** Favicon path in 32×32 viewBox — filled M, no hole. */
const M_POLY = [
  [5.5, 26],
  [5.5, 6],
  [11, 6],
  [16, 17.5],
  [21, 6],
  [26.5, 6],
  [26.5, 26],
  [21, 26],
  [21, 14],
  [16, 23],
  [11, 14],
  [11, 26],
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const o = y * (width * 4 + 1);
    raw[o] = 0;
    rgba.copy(raw, o + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insidePoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function roundedRectCoverage(px, py, size, radius) {
  const x = Math.max(px, 0);
  const y = Math.max(py, 0);
  const r = radius;
  if (x >= r && x < size - r && y >= 0 && y < size) return 1;
  if (y >= r && y < size - r && x >= 0 && x < size) return 1;
  const corners = [
    [r, r],
    [size - r, r],
    [r, size - r],
    [size - r, size - r],
  ];
  for (const [cx, cy] of corners) {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= r * r) return 1;
  }
  // Outside the inner cross but maybe in a corner ring — already handled.
  if (x >= 0 && x < size && y >= 0 && y < size) {
    const inX = x >= r && x < size - r;
    const inY = y >= r && y < size - r;
    if (inX || inY) return 1;
    const cx = x < r ? r : size - r;
    const cy = y < r ? r : size - r;
    return dx2(x, y, cx, cy) <= r * r ? 1 : 0;
  }
  return 0;
}

function dx2(x, y, cx, cy) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy;
}

function render(size) {
  const scale = size / 32;
  const radius = 6 * scale;
  const poly = M_POLY.map(([x, y]) => [x * scale, y * scale]);
  const ss = 3;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let oy = 0; oy < ss; oy += 1) {
        for (let ox = 0; ox < ss; ox += 1) {
          const px = x + (ox + 0.5) / ss;
          const py = y + (oy + 0.5) / ss;
          const inRound = roundedRectCoverage(px, py, size, radius);
          if (!inRound) continue;
          const [cr, cg, cb, ca] = insidePoly(px, py, poly) ? FG : BG;
          r += cr;
          g += cg;
          b += cb;
          a += ca;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, rgba);
}

function makeIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6 + 16 * count);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + 16 * count;
  const parts = [header];
  pngs.forEach((buf, i) => {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const e = 6 + i * 16;
    header.writeUInt8(width >= 256 ? 0 : width, e);
    header.writeUInt8(height >= 256 ? 0 : height, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(buf.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += buf.length;
    parts.push(buf);
  });
  return Buffer.concat(parts);
}

mkdirSync(outDir, { recursive: true });
const png256 = render(256);
const png48 = render(48);
const png32 = render(32);
const png16 = render(16);
writeFileSync(join(outDir, "icon.png"), png256);
writeFileSync(join(outDir, "icon.ico"), makeIco([png16, png32, png48, png256]));
console.log("wrote desktop/icon.png and desktop/icon.ico");
