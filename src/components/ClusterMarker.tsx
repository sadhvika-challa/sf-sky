import { memo, useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { getMapPinColor, getMapPinTextColor } from '../utils/mapPinColor';

interface ClusterMarkerProps {
  position: [number, number];
  count: number;
  /**
   * Best (max) score (0–100) of the underlying spots — drives the bubble
   * color. We deliberately use the max rather than the average so a single
   * low-scoring outlier inside a cluster doesn't drag the whole bubble's
   * color tier down.
   */
  bestScore: number;
  onClick: () => void;
}

// Bigger than the largest single-pin (36px) so a cluster never gets visually
// confused with one really good spot. The halo eats more pixels than the
// bubble proper, hence the generous hit area.
const HIT = 60;

function bubbleSize(count: number): number {
  // Min 40px keeps clusters strictly larger than any individual pin (max 36
  // for "great" tier). Caps at 54 so a citywide cluster doesn't blot out
  // half the viewport.
  if (count >= 25) return 54;
  if (count >= 10) return 48;
  if (count >= 5) return 44;
  return 40;
}

// Count font scales with bubble size so 3-digit clusters still fit cleanly.
function countFontSize(count: number): number {
  if (count >= 100) return 13;
  if (count >= 10) return 14;
  return 15;
}

function createClusterIcon(count: number, bestScore: number): L.DivIcon {
  const size = bubbleSize(count);
  const color = getMapPinColor(bestScore);
  const countFont = countFontSize(count);
  // The count label and larger size distinguish clusters without large halos.
  const boxShadow = [
    '0 0 0 2px rgba(255,255,255,0.8)',
    '0 2px 6px rgba(23,37,39,0.20)',
  ].join(', ');
  const html = `<div style="
    width:${HIT}px; height:${HIT}px;
    display:flex; align-items:center; justify-content:center;
    -webkit-tap-highlight-color: transparent;
  ">
    <div style="
      width:${size}px; height:${size}px;
      border-radius:50%;
      background:${color};
      border:2px solid white;
      box-shadow: ${boxShadow};
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      color:${getMapPinTextColor(bestScore)};
      font-family:'DM Sans', sans-serif;
      line-height:1;
    ">
      <div style="
        font-family:'DM Sans', sans-serif;
        font-size:${countFont}px;
        font-weight:700;
        letter-spacing:0;
        line-height:0.95;
      ">${count}</div>
      <div style="
        font-size:7px;
        font-weight:600;
        letter-spacing:0.5px;
        margin-top:0px;
        line-height:1;
        text-transform:uppercase;
      ">spots</div>
    </div>
  </div>`;
  return L.divIcon({
    className: '',
    html,
    iconSize: [HIT, HIT],
    iconAnchor: [HIT / 2, HIT / 2],
  });
}

function ClusterMarker({ position, count, bestScore, onClick }: ClusterMarkerProps) {
  const icon = useMemo(() => createClusterIcon(count, bestScore), [count, bestScore]);
  return (
    <Marker
      position={position}
      icon={icon}
      // Float clusters above individual pins so a stray un-clustered pin in
      // the same screen region doesn't poke through the bubble. Still well
      // below the user-location marker (500) and active spot (1000).
      zIndexOffset={200}
      eventHandlers={{ click: onClick }}
    />
  );
}

export default memo(ClusterMarker);
