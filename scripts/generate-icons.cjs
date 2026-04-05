// Generate PNG icons from SVG for PWA
// Run: node scripts/generate-icons.js

const fs = require('fs');
const { execSync } = require('child_process');

const svgContent = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FDE68A"/>
      <stop offset="50%" style="stop-color:#F59E0B"/>
      <stop offset="100%" style="stop-color:#D97706"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#bg)"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.22}" stroke="white" stroke-width="${size*0.02}" fill="none" opacity="0.95"/>
  <line x1="${size/2}" y1="${size*0.12}" x2="${size/2}" y2="${size*0.24}" stroke="white" stroke-width="${size*0.02}" stroke-linecap="round" opacity="0.8"/>
  <line x1="${size/2}" y1="${size*0.76}" x2="${size/2}" y2="${size*0.88}" stroke="white" stroke-width="${size*0.02}" stroke-linecap="round" opacity="0.8"/>
  <line x1="${size*0.12}" y1="${size/2}" x2="${size*0.24}" y2="${size/2}" stroke="white" stroke-width="${size*0.02}" stroke-linecap="round" opacity="0.8"/>
  <line x1="${size*0.76}" y1="${size/2}" x2="${size*0.88}" y2="${size/2}" stroke="white" stroke-width="${size*0.02}" stroke-linecap="round" opacity="0.8"/>
  <line x1="${size*0.20}" y1="${size*0.20}" x2="${size*0.29}" y2="${size*0.29}" stroke="white" stroke-width="${size*0.02}" stroke-linecap="round" opacity="0.7"/>
  <line x1="${size*0.80}" y1="${size*0.20}" x2="${size*0.71}" y2="${size*0.29}" stroke="white" stroke-width="${size*0.02}" stroke-linecap="round" opacity="0.7"/>
  <line x1="${size*0.20}" y1="${size*0.80}" x2="${size*0.29}" y2="${size*0.71}" stroke="white" stroke-width="${size*0.02}" stroke-linecap="round" opacity="0.7"/>
  <line x1="${size*0.80}" y1="${size*0.80}" x2="${size*0.71}" y2="${size*0.71}" stroke="white" stroke-width="${size*0.02}" stroke-linecap="round" opacity="0.7"/>
</svg>`;

// Write SVG files and convert using sips (macOS built-in)
[192, 512].forEach((size) => {
  const svgPath = `public/icons/icon-${size}.svg`;
  const pngPath = `public/icons/icon-${size}.png`;

  fs.writeFileSync(svgPath, svgContent(size));

  // Use qlmanage (macOS) to convert SVG to PNG
  try {
    execSync(`qlmanage -t -s ${size} -o public/icons/ ${svgPath} 2>/dev/null`);
    // qlmanage outputs as icon-{size}.svg.png, rename it
    const qlOutput = `public/icons/icon-${size}.svg.png`;
    if (fs.existsSync(qlOutput)) {
      fs.renameSync(qlOutput, pngPath);
    }
  } catch {
    // Fallback: just use the SVG, browsers handle it fine
    console.log(`Note: Could not convert ${size}px icon to PNG, using SVG fallback`);
    fs.copyFileSync(svgPath, pngPath);
  }

  // Clean up SVG
  fs.unlinkSync(svgPath);
});

console.log('Icons generated in public/icons/');
