export type BestNearbyState =
  | 'loading'
  | 'ready'
  | 'insufficient-evidence'
  | 'no-supported-spots';

export type BestNearbyClaimKind = 'best-nearby-now' | 'best-of-checked';

export interface BestNearbyCandidate {
  id: string;
  name: string;
  score: number | null;
  confidence: string;
  lastUpdatedLabel: string;
  distance?: string;
  forecastBacked: boolean;
  comparable: boolean;
  approximateDistance?: boolean;
  fartherFallback?: boolean;
  accessWarning?: string;
}

interface BestNearbyCardBaseProps {
  claimKind: BestNearbyClaimKind;
  cityName: string;
  comparedCount: number;
  candidates: readonly BestNearbyCandidate[];
  onSelectSpot: (spotId: string) => void;
  onRetry?: () => void;
}

interface BestNearbyReadyProps extends BestNearbyCardBaseProps {
  state: 'ready';
  winner: BestNearbyCandidate;
}

interface BestNearbyNonReadyProps extends BestNearbyCardBaseProps {
  state: Exclude<BestNearbyState, 'ready'>;
  winner?: never;
}

export type BestNearbyCardProps = BestNearbyReadyProps | BestNearbyNonReadyProps;

function EvidenceBadge({ candidate }: { candidate: BestNearbyCandidate }) {
  const evidenceLabel = candidate.forecastBacked
    ? `${candidate.confidence} data confidence`
    : `${candidate.confidence} data confidence, forecast unavailable`;

  return (
    <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-600">
      {evidenceLabel}
    </span>
  );
}

function CandidateRow({
  candidate,
  isWinner,
  winnerClaimLabel,
  onSelect,
}: {
  candidate: BestNearbyCandidate;
  isWinner: boolean;
  winnerClaimLabel: string;
  onSelect: () => void;
}) {
  const actionLabel = [
    `Open ${candidate.name}${isWinner ? `, ${winnerClaimLabel}` : ''}`,
    candidate.score === null
      ? 'current score unavailable'
      : `score ${candidate.score} out of 100`,
    `${candidate.confidence} data confidence`,
    candidate.lastUpdatedLabel,
    candidate.distance
      ? `${candidate.approximateDistance ? 'approximate ' : ''}${candidate.distance}`
      : null,
    candidate.fartherFallback ? 'farther option' : null,
    candidate.accessWarning ? 'access check needed' : null,
  ].filter((part): part is string => Boolean(part)).join('. ');

  return (
    <li className="py-0.5">
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-black/[0.035] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
        aria-label={actionLabel}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-serif text-[14px] font-semibold text-[#1a1a18]">
              {candidate.name}
            </span>
            {isWinner && (
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8B5E3C]">
                Top result
              </span>
            )}
            {candidate.fartherFallback && (
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-600">
                Farther option
              </span>
            )}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-tight text-gray-600">
            <EvidenceBadge candidate={candidate} />
            <span>{candidate.lastUpdatedLabel}</span>
            {candidate.distance && (
              <span>
                {candidate.approximateDistance && <span>Approx. </span>}
                {candidate.distance}
              </span>
            )}
          </span>
        </span>
        <span
          className="flex shrink-0 items-baseline gap-0.5 font-mono text-gray-900"
          aria-label={candidate.score === null ? 'Current score unavailable' : `Score ${candidate.score}`}
        >
          <span className="text-[18px] font-semibold tabular-nums">
            {candidate.score === null ? '—' : candidate.score}
          </span>
          {candidate.score !== null && <span className="text-[9px] text-gray-600">/100</span>}
        </span>
      </button>
      {candidate.accessWarning && (
        <details className="mx-2.5 mb-1 text-[10px] leading-relaxed text-amber-900">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800">
            Access check needed
          </summary>
          <p className="pb-2">Curated note, details may change: {candidate.accessWarning}</p>
        </details>
      )}
    </li>
  );
}

function EmptyState({
  state,
  cityName,
  claimKind,
}: {
  state: Exclude<BestNearbyState, 'ready' | 'loading'>;
  cityName: string;
  claimKind: BestNearbyClaimKind;
}) {
  const isNearby = claimKind === 'best-nearby-now';

  if (state === 'no-supported-spots') {
    return (
      <>
        <h2 className="font-serif text-[17px] font-semibold text-[#1a1a18]">
          {isNearby ? 'No supported spots nearby' : `No supported spots in ${cityName}`}
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-600">
          We do not have forecast-backed spots to compare in {cityName} right now.
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="font-serif text-[17px] font-semibold text-[#1a1a18]">
        {isNearby ? 'Nearby estimates' : 'City outlook'}
      </h2>
      <p className="mt-1 text-[12px] leading-relaxed text-gray-600">
        {isNearby
          ? 'There is not enough current forecast evidence to compare nearby spots yet.'
          : `There is not enough current forecast evidence to compare spots in ${cityName} yet.`}
      </p>
    </>
  );
}

export default function BestNearbyCard(props: BestNearbyCardProps) {
  const isNearby = props.claimKind === 'best-nearby-now';
  const winnerClaim = isNearby ? 'Best nearby now' : 'Best of the spots checked';
  const candidates = props.candidates.slice(0, 3);
  const comparableForecastCount = props.candidates.filter(
    (candidate) => candidate.comparable && candidate.forecastBacked,
  ).length;
  const canNameWinner =
    props.state === 'ready' &&
    props.comparedCount >= 2 &&
    comparableForecastCount >= 2 &&
    props.winner.comparable &&
    props.winner.forecastBacked;

  return (
    <section
      className="w-full rounded-2xl border border-black/[0.08] bg-[#FAFAF8] p-3 shadow-sm"
      aria-label={isNearby ? 'Nearby spot recommendation' : `Spot recommendation for ${props.cityName}`}
    >
      {props.state === 'loading' ? (
        <div role="status" aria-live="polite" aria-busy="true" className="py-1">
          <h2 className="font-serif text-[17px] font-semibold text-[#1a1a18]">
            {isNearby ? 'Checking nearby spots' : `Checking spots in ${props.cityName}`}
          </h2>
          <p className="mt-1 text-[12px] text-gray-600">
            {isNearby
              ? `Comparing current forecast evidence near you in ${props.cityName}…`
              : `Comparing current forecast evidence in ${props.cityName}…`}
          </p>
        </div>
      ) : canNameWinner ? (
        <div role="status" aria-live="polite">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
            {winnerClaim}
          </p>
          <h2 className="mt-0.5 font-serif text-[18px] font-semibold leading-tight text-[#1a1a18]">
            {props.winner.name}
          </h2>
          <p className="mt-1 text-[10px] text-gray-600">
            {props.cityName} · {props.winner.confidence} data confidence · {props.winner.lastUpdatedLabel} · Compared {props.comparedCount} spots
          </p>
        </div>
      ) : (
        <div role="status" aria-live="polite">
          <EmptyState
            state={props.state === 'no-supported-spots' ? 'no-supported-spots' : 'insufficient-evidence'}
            cityName={props.cityName}
            claimKind={props.claimKind}
          />
        </div>
      )}

      {props.state !== 'loading' && candidates.length > 0 && (
        <ul
          className="mt-2 divide-y divide-black/[0.06]"
          aria-label={isNearby ? 'Nearby candidates' : `Candidates checked in ${props.cityName}`}
        >
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              isWinner={canNameWinner && candidate.id === props.winner.id}
              winnerClaimLabel={winnerClaim.toLocaleLowerCase()}
              onSelect={() => props.onSelectSpot(candidate.id)}
            />
          ))}
        </ul>
      )}

      {props.state !== 'loading' && (
        <div className="mt-2 border-t border-black/[0.07] pt-2">
          <p className="text-[10px] font-semibold text-gray-700">Check access before you go.</p>
          <details className="mt-0.5 text-[10px] leading-relaxed text-gray-600">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800">
              How spots are ranked
            </summary>
            <p className="pb-1">We rank stronger current scores first. Distance breaks exact score ties.</p>
          </details>
          {!canNameWinner && props.onRetry && (
            <button
              type="button"
              onClick={props.onRetry}
              className="min-h-11 rounded-lg px-2 font-sans text-[12px] font-semibold text-[#8B5E3C] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  );
}
