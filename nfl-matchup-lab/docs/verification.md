# V1 verification

Verified October 25, 2026 (America/New_York).

- Production build succeeds with strict TypeScript checking.
- 26 automated tests pass. They cover units, weighted aggregation, defensive percentile direction, small and missing samples, chronological cutoffs, source contracts, player shares, snapshot reconciliation, and URL/preference normalization.
- The real 2026 source refresh completed successfully and generated a bundled snapshot with all 32 teams, 105 completed games, 489 player identities, and full receiving-target position joins at verification time.
- Browser checks covered offense/defense reversal, season and last-four windows, evidence dialogs, player totals and percentage shares, league metric sorting, conference/search filters, team profiles, expandable metric definitions, weekly slate selection, historical empty samples, and report export.
- The browser reported no runtime warnings or errors during the final desktop checks.
- The responsive layout was visually inspected at a 390-pixel content width. Hidden mobile navigation is removed from the accessibility tree until opened. Charts and animations honor reduced-motion preferences.

These are software and data-integrity checks, not a predictive backtest. Matchup labels remain descriptive V1 evidence. Source images are remote and may be unavailable independently of the statistics; team logos have an abbreviation fallback. The source refresh requires internet access, while the interface reads the committed snapshot.

The production preview was used for verification only. To run the app, follow the repository README.
