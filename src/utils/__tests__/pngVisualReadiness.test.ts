/// <reference types="node" />

import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The production smoke helper is an executable Node module outside the browser TypeScript project.
import { analyzeVisualReadiness } from '../../../scripts/png-visual-readiness.mjs';

const chunk = (type: string, data: Buffer) => {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  output.write(type, 4, 4, 'ascii');
  data.copy(output, 8);
  return output;
};

const rgbaPng = (width: number, height: number, pixel: (x: number, y: number) => number[]) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      rows.set(pixel(x, y), rowOffset + 1 + x * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

describe('simulator screenshot visual readiness', () => {
  it('rejects a blank app surface and accepts varied rendered content', () => {
    const blank = rgbaPng(120, 240, () => [210, 231, 243, 255]);
    const rendered = rgbaPng(120, 240, (x, y) => {
      if ((x + y) % 17 < 4) return [30, 30, 28, 255];
      return [(x * 5) % 256, (y * 3) % 256, ((x + y) * 7) % 256, 255];
    });
    expect(analyzeVisualReadiness(blank)).toMatchObject({ visuallyReady: false, colorBuckets: 1 });
    expect(analyzeVisualReadiness(rendered)).toMatchObject({ visuallyReady: true });
  });
});
