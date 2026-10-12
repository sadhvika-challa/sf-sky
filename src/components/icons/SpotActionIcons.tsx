const iconProps = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

export function DirectionsIcon() {
  return <svg {...iconProps}><path d="m12 3 9 9-9 9-9-9 9-9Z" /><path d="M8 15v-4h7m-3-3 3 3-3 3" /></svg>;
}

export function StreetViewIcon() {
  return <svg {...iconProps}><circle cx="12" cy="4.5" r="2.25" /><path d="M9 21v-7H7v-3a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3h-2v7m-3-7v7" /></svg>;
}

export function CameraIcon() {
  return <svg {...iconProps}><path d="M8 6.5 9.5 4h5L16 6.5h3.5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V8a1.5 1.5 0 0 1 1.5-1.5H8Z" /><circle cx="12" cy="13" r="3.5" /></svg>;
}

export function CloseIcon() {
  return <svg {...iconProps}><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
