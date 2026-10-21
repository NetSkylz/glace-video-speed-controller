import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
// Original vector-like icon, rasterized directly so builds need no graphics tools.
function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}
await mkdir('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    const radius = 0.23;
    const dx = Math.max(0, Math.abs(u - 0.5) - (0.5 - radius));
    const dy = Math.max(0, Math.abs(v - 0.5) - (0.5 - radius));
    const visible = dx * dx + dy * dy <= radius * radius;
    const circle = Math.hypot(u - 0.5, v - 0.5);
    const ring = circle > 0.20 && circle < 0.30 && !(u > 0.52 && v < 0.49);
    const bar = u > 0.50 && u < 0.79 && v > 0.46 && v < 0.54;
    const stem = u > 0.70 && u < 0.79 && v > 0.49 && v < 0.65;
    const glyph = ring || bar || stem;
    const i = y * (size * 4 + 1) + 1 + x * 4;
    pixels[i] = glyph ? 240 : Math.round(48 + 30 * u);
    pixels[i + 1] = glyph ? 250 : Math.round(99 + 31 * (1 - v));
    pixels[i + 2] = glyph ? 255 : Math.round(119 + 35 * u);
    pixels[i + 3] = visible ? 255 : 0;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  await writeFile(`public/icons/icon${size}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
}
