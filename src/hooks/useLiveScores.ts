// Re-export types from useTimelineScores for backwards compatibility.
// The hook itself is superseded by useTimelineScores but these types are
// imported across many components.
export type { LiveSpotScores, LiveScoresMap } from './useTimelineScores';
export { useTimelineScores as useLiveScores } from './useTimelineScores';
