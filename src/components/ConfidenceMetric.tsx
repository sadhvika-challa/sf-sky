import type { ScoreEvidence } from '../utils/confidence';

export default function ConfidenceMetric({ evidence }: { evidence: ScoreEvidence }) {
  const label = evidence.confidence[0].toUpperCase() + evidence.confidence.slice(1);
  const filled = evidence.confidence === 'high' ? 3 : evidence.confidence === 'medium' ? 2 : 1;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] leading-tight text-gray-600"
      role="group"
      aria-label={`Forecast confidence: ${label}`}
      data-contrast-audit="forecast-confidence"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <rect key={index} x={index * 4.5 + 1} y={9 - index * 3} width="3" height={4 + index * 3} rx="0.8" fill="currentColor" opacity={index < filled ? 1 : 0.2} />
        ))}
      </svg>
      {label} confidence
    </span>
  );
}
