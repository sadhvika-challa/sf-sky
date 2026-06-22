import type { EventCategory } from '../data/events';

// Tiny single-color category glyphs (~10px), drawn white. Kept to 1–2 SVG
// primitives each so they stay legible inside the small event diamond, on the
// map pin and in the "Happening Tonight" banner alike.
const CATEGORY_GLYPH: Record<EventCategory, string> = {
  // sparkle / starburst
  'light-installation':
    '<path d="M5 0.5 L6 4 L9.5 5 L6 6 L5 9.5 L4 6 L0.5 5 L4 4 Z" fill="white"/>',
  // 5-point star
  astronomy:
    '<path d="M5 0.5 L6.18 3.6 L9.5 3.8 L6.9 5.9 L7.8 9.2 L5 7.3 L2.2 9.2 L3.1 5.9 L0.5 3.8 L3.82 3.6 Z" fill="white"/>',
  // play triangle
  screening: '<path d="M2.5 1.5 L8.5 5 L2.5 8.5 Z" fill="white"/>',
  // crescent moon
  'natural-phenomenon':
    '<path d="M7.2 1 A4 4 0 1 0 7.2 9 A3 3 0 1 1 7.2 1 Z" fill="white"/>',
  // abstract circle (outline)
  'art-walk':
    '<circle cx="5" cy="5" r="3.2" fill="none" stroke="white" stroke-width="1.4"/>',
  // 2x2 grid of dots
  'drone-show':
    '<circle cx="3.2" cy="3.2" r="1.2" fill="white"/><circle cx="6.8" cy="3.2" r="1.2" fill="white"/><circle cx="3.2" cy="6.8" r="1.2" fill="white"/><circle cx="6.8" cy="6.8" r="1.2" fill="white"/>',
};

/** Inline SVG markup for a category glyph, sized for the diamond interior. */
export function eventGlyphSvg(category: EventCategory, px = 10): string {
  return `<svg width="${px}" height="${px}" viewBox="0 0 10 10" fill="none" aria-hidden="true">${CATEGORY_GLYPH[category]}</svg>`;
}
