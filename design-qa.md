# Best Nearby Mobile Design QA

## Comparison Target

- Source visual truth: `/Users/sadhvikachalla/Documents/Codex/2026-08-29/i-m-working-on-a-project/outputs/soleil-ux-audit/03-austin-best-nearby.png`
- Browser-rendered implementation: `design-qa/implementation-mobile-402.png`
- Full-view comparison: `design-qa/source-left-implementation-right.png`, with the audit source on the left and the implementation on the right.
- Focused card comparison: `design-qa/source-left-implementation-right-card-focus.png`, with the audit source on the left and the implementation on the right.
- Viewport: 402 by 874 CSS pixels.
- Source pixels: 402 by 874.
- Implementation pixels: 402 by 874 after capture normalization.
- Browser state: Austin, Best of the spots checked, three forecast-backed candidates, current hour.
- Browser rendering: Codex in-app browser at 402 by 874, device pixel ratio 2.
- Density normalization: the in-app browser screenshot encoded its device-pixel-ratio rendering at half scale in the upper-left 201 by 437 pixels of a 402 by 874 file. The occupied region was cropped and resampled to the browser-confirmed 402 by 874 CSS viewport for equal-size comparison. This capture artifact softens the comparison image but does not alter the browser DOM geometry.

## Findings

No actionable P0, P1, or P2 findings remain in the scoped Best Nearby hierarchy and interaction affordance.

- Fonts and typography: The implementation keeps Soleil's existing serif headings and mono evidence labels. Candidate names, trust badges, freshness, scores, and action labels have separate optical roles. The source's run-on metadata line is removed.
- Spacing and layout rhythm: The header separates the claim, checked count, winner name, and city. Candidate rows are distinct rounded cards with consistent spacing. Trust and freshness stack at 402 pixels and return to a compact row at the existing desktop breakpoint.
- Colors and visual tokens: The winner uses Soleil's existing brown accent and warm surface treatment. Other candidates keep the existing off-white palette. State distinction does not depend on color because the winner also includes the textual `Top result` label.
- Image quality and asset fidelity: This component introduces no new image or icon assets. The surrounding map continues to use the product's map tiles. No source asset was replaced by a code-drawn substitute.
- Copy and content: `3 spots checked` replaces the crowded sentence fragment. `View spot` makes each candidate's result actionable. Per-candidate access disclosures remain, while the redundant footer reminder is removed.
- Affordance and accessibility: Every candidate remains a semantic button with its complete accessible name. The whole candidate action has a visible boundary, a minimum 64-pixel primary action area, focus styling, and a textual action cue. The winner has both visual and textual state.
- Responsiveness: Browser measurements found no horizontal overflow at 402 pixels. Confidence and freshness do not collide. The third result extends below the initial viewport because the cards now expose clearer hit areas and access notes, but the existing sheet remains scrollable and the partial card provides continuation context.

## Comparison History

### Initial audit evidence

The source showed four scoped problems:

1. Header metadata wrapped into one crowded line.
2. Confidence and freshness touched without reliable separation.
3. Candidate rows looked like static text rather than selectable controls.
4. `Check access before you go` repeated the access message already attached to each candidate.

### Fixes made

1. Moved compared count into its own checked-count badge and reduced header metadata to the city.
2. Stacked trust, freshness, and optional distance at mobile width, with the existing responsive breakpoint restoring a horizontal layout.
3. Added bordered candidate surfaces, a warm winner treatment, a textual `Top result` state, and a visible `View spot` action cue while preserving semantic buttons.
4. Removed the global access reminder and retained the actionable access disclosure on the affected candidate.

### Post-fix evidence

- Full-view and focused side-by-side comparisons show clear row boundaries, separated evidence labels, and a compact header.
- Browser selection of Pace Bend Park opened the expected `Pace Bend Park sky scores` dialog.
- The browser console reported zero errors after selection.
- The focused mobile browser test verified three candidate cards, exactly one winner, no horizontal overflow, separated trust and freshness geometry, and successful candidate selection.

## Follow-up Polish

- P3: A future iteration could tune the vertical density of expanded access notes if user testing shows that people want all three result scores fully visible without scrolling. The current layout prioritizes selectable touch targets and trust clarity.

## Implementation Checklist

- [x] Separate header metadata at 402 pixels.
- [x] Separate confidence and freshness.
- [x] Make every candidate visibly and semantically selectable.
- [x] Preserve a clear winner state without relying on color alone.
- [x] Remove redundant access helper copy.
- [x] Preserve desktop responsive behavior.
- [x] Verify the selection journey and browser console.

final result: passed
