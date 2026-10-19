import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: node scripts/import-spot-photos.mjs approved-photos.json');
const input = JSON.parse(await readFile(inputPath, 'utf8'));
const manifestPath = path.join(root, 'src/data/spotPhotoManifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const publicIds = new Set();
for (const file of ['spots.ts', 'sf-hidden-gems.ts', 'austin-spots.ts', 'santa-cruz-spots.ts']) {
  const source = ts.createSourceFile(file, await readFile(path.join(root, 'src/data', file), 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const fields = Object.fromEntries(node.properties.filter(ts.isPropertyAssignment)
        .filter((p) => ts.isStringLiteral(p.initializer))
        .map((p) => [p.name.getText(source).replace(/["']/g, ''), p.initializer.text]));
      if (fields.id && fields.city && fields.visibility !== 'private') publicIds.add(fields.id);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const prepared = [];
for (const entry of input) {
  for (const [key, value] of Object.entries(entry)) {
    if (typeof value === 'string') entry[key] = value.replaceAll('\u2014', ',');
  }
  if (!publicIds.has(entry.spotId)) throw new Error(`Unknown public spot: ${entry.spotId}`);
  for (const key of ['view', 'alt', 'context', 'dateLabel', 'photographer', 'sourceUrl', 'license', 'licenseUrl', 'reviewedOn', 'locationEvidence']) {
    if (typeof entry[key] !== 'string' || !entry[key].trim()) throw new Error(`${entry.spotId}: Missing ${key}`);
  }
  if (!/^CC (BY|BY-SA) (2\.0|2\.5|3\.0|4\.0)$|^CC0$|^Public domain$/.test(entry.license)) throw new Error(`${entry.spotId}: License needs review`);
  if (entry.license === 'Public domain' && !entry.publicDomainBasis?.trim()) throw new Error(`${entry.spotId}: Public domain basis required`);
  if (!/^https:\/\//.test(entry.sourceUrl) || !/^https:\/\/(creativecommons\.org|commons\.wikimedia\.org)\//.test(entry.licenseUrl)) throw new Error(`${entry.spotId}: Invalid attribution URL`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn)) throw new Error(`${entry.spotId}: Invalid review date`);
  if (!(entry.width > 0 && entry.height > 0)) throw new Error(`${entry.spotId}: Dimensions required`);
  const bytes = await readFile(path.resolve(path.dirname(path.resolve(inputPath)), entry.assetPath));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!jpeg && !png) throw new Error(`${entry.spotId}: Expected JPEG or PNG`);
  if (bytes.length > 2 * 1024 * 1024) throw new Error(`${entry.spotId}: Image exceeds 2 MB delivery budget`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const filename = `${sha256.slice(0, 20)}.${jpeg ? 'jpg' : 'png'}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(entry.dateLabel)) {
    entry.dateLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${entry.dateLabel.slice(0, 10)}T12:00:00Z`));
  }
  prepared.push({ entry, bytes, sha256, filename });
}

// Validate the entire batch before publishing assets or changing the manifest.
await mkdir(path.join(root, 'public/spot-views'), { recursive: true });
for (const { entry, bytes, sha256, filename } of prepared) {
  await writeFile(path.join(root, 'public/spot-views', filename), bytes);
  manifest[entry.spotId] = {
    view: entry.view, reviewedOn: entry.reviewedOn, verification: 'desk-researched',
    locationSourceUrl: entry.sourceUrl, locationPrecision: entry.locationPrecision ?? 'park',
    sources: [{ platform: 'Photo archive', url: entry.sourceUrl }],
    locationEvidence: entry.locationEvidence,
    ...(entry.publicDomainBasis ? { publicDomainBasis: entry.publicDomainBasis } : {}),
    photos: [{
      id: sha256.slice(0, 20), src: `/spot-views/${filename}`, alt: entry.alt, view: entry.view,
      context: entry.context,
      dateLabel: entry.dateLabel,
      photographer: entry.photographer,
      sourceUrl: entry.sourceUrl, license: entry.license, licenseUrl: entry.licenseUrl,
      bytes: bytes.length, width: entry.width, height: entry.height, sha256,
    }],
  };
}
const serialized = JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n';
await writeFile(manifestPath, serialized);
await writeFile(path.join(root, 'public/spot-views/manifest.json'), serialized);
await writeFile(path.join(root, 'public/spot-views/ATTRIBUTION.md'), '# Soleil spot photos\n\nReference photographs are historical images, not live views or weather forecasts. Images are delivered without further visual edits. Archive thumbnails may be resized. Location evidence and full attribution are in manifest.json.\n\n' + Object.entries(manifest).map(([id, record]) => record.photos.map((photo) => `- ${id}: [${photo.photographer}](${photo.sourceUrl}), [${photo.license}](${photo.licenseUrl}). ${photo.dateLabel}. Asset: ${photo.src}.`).join('\n')).join('\n') + '\n');
const referencedAssets = new Set(Object.values(manifest).flatMap((record) => record.photos.map((photo) => path.basename(photo.src))));
for (const filename of await readdir(path.join(root, 'public/spot-views'))) {
  if (/^[a-f0-9]{20}\.(jpg|png)$/.test(filename) && !referencedAssets.has(filename)) {
    await unlink(path.join(root, 'public/spot-views', filename));
  }
}
console.log(`Published ${prepared.length} reviewed photos. Coverage: ${Object.keys(manifest).length} public spots.`);
