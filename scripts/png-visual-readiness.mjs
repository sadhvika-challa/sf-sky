import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
};

export function decodeRgbaPng(png) {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Screenshot is not a PNG.');
  let offset = 8;
  let width;
  let height;
  const imageData = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [bitDepth, colorType, compression, filter, interlace] = data.subarray(8, 13);
      if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
        throw new Error(`Unsupported screenshot PNG format: depth=${bitDepth}, color=${colorType}, interlace=${interlace}.`);
      }
    } else if (type === 'IDAT') {
      imageData.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!width || !height || imageData.length === 0) throw new Error('Screenshot PNG is missing image data.');

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const encoded = inflateSync(Buffer.concat(imageData));
  const expectedLength = height * (stride + 1);
  if (encoded.length !== expectedLength) {
    throw new Error(`Screenshot PNG data length mismatch: expected ${expectedLength}, received ${encoded.length}.`);
  }
  const pixels = Buffer.alloc(height * stride);
  let encodedOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = encoded[encodedOffset];
    encodedOffset += 1;
    for (let byte = 0; byte < stride; byte += 1) {
      const raw = encoded[encodedOffset];
      encodedOffset += 1;
      const outputOffset = y * stride + byte;
      const left = byte >= bytesPerPixel ? pixels[outputOffset - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[outputOffset - stride] : 0;
      const upperLeft = y > 0 && byte >= bytesPerPixel
        ? pixels[outputOffset - stride - bytesPerPixel]
        : 0;
      let predictor = 0;
      if (filterType === 1) predictor = left;
      else if (filterType === 2) predictor = up;
      else if (filterType === 3) predictor = Math.floor((left + up) / 2);
      else if (filterType === 4) predictor = paeth(left, up, upperLeft);
      else if (filterType !== 0) throw new Error(`Unsupported screenshot PNG filter: ${filterType}.`);
      pixels[outputOffset] = (raw + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

export function analyzeVisualReadiness(png) {
  const { width, height, pixels } = decodeRgbaPng(png);
  const startX = Math.floor(width * 0.02);
  const endX = Math.ceil(width * 0.98);
  const startY = Math.floor(height * 0.08);
  const endY = Math.ceil(height * 0.96);
  const step = 4;
  const colorBuckets = new Set();
  let samples = 0;
  let darkSamples = 0;
  let transitions = 0;
  let comparableSamples = 0;
  for (let y = startY; y < endY; y += step) {
    let previousBucket = null;
    for (let x = startX; x < endX; x += step) {
      const offset = (y * width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const bucket = `${red >> 4}:${green >> 4}:${blue >> 4}`;
      colorBuckets.add(bucket);
      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      if (luminance < 0.45) darkSamples += 1;
      if (previousBucket !== null) {
        comparableSamples += 1;
        if (bucket !== previousBucket) transitions += 1;
      }
      previousBucket = bucket;
      samples += 1;
    }
  }
  const darkPixelRatio = samples > 0 ? darkSamples / samples : 0;
  const transitionRatio = comparableSamples > 0 ? transitions / comparableSamples : 0;
  const visuallyReady = colorBuckets.size >= 12 && darkPixelRatio >= 0.001 && transitionRatio >= 0.002;
  return {
    width,
    height,
    sampledRegion: { startX, endX, startY, endY, step },
    samples,
    colorBuckets: colorBuckets.size,
    darkPixelRatio,
    transitionRatio,
    visuallyReady,
  };
}
