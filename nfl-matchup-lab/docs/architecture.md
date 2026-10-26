# Architecture and extension plan

V1 is a static research application. A repeatable ingestion script turns larger public source files into a compact snapshot. The React interface reads that snapshot and performs reproducible team comparisons in TypeScript. There are no server credentials, paid API dependencies or pretend backend connections.

```text
nflverse public source files
            ↓
manual refresh script
            ↓
versioned team/game snapshot in the repository
            ↓
pure profile and matchup calculations
            ↓
React research interface
```

## Why this boundary

The interface should load quickly and remain usable when an upstream endpoint is unavailable. Fetching and parsing an entire NFL play-by-play season for each browser session would make the user experience slower and make the same report harder to reproduce. Committing the small derived snapshot also makes data changes reviewable alongside code changes.

Refresh currently runs only when requested. Running Vite in StackBlitz does not schedule ingestion. A production worker can later run the same aggregation on a schedule and write versioned files or database rows.

## Model boundaries

Keep three layers distinct as the project grows:

1. **Observed profiles:** measured outcomes, tendencies and exposures.
2. **Adjusted estimates:** regularized offense and defensive-concession effects accounting for opponents and situation.
3. **Predictions:** explicit matchup effects, shared opportunities, player allocations and uncertainty.

V1 implements the profile-comparison foundation. Do not rename a percentile comparison an opponent-adjusted estimate. Do not present a heuristic matchup indicator as percentage uplift in expected yards or probability of a betting outcome.

## Recommended next work

### 1. Reconciliation and data quality

Save source versions and hashes. Reconcile eligible-play and player totals against official box statistics. Add coverage thresholds for player-position joins, each category and charted subsets. Compare refreshes so a partial upstream file cannot quietly become the new normal.

### 2. Opponent adjustment

Fit regularized offense and defense effects on historical training windows. Use matching definitions on offense and defense, a game-aware validation split and a pregame cutoff. Fit to underlying outcomes and exposures rather than percentile differences. Retain raw profiles so readers can inspect the source of an adjustment.

### 3. Shared player opportunities

Project one coherent set of team plays, dropbacks and designed carries. Allocate targets and carries across active players. Separate role changes from efficiency changes, and distinguish active/full, active/limited and inactive scenarios. Do not sum unrelated player per-game means and call that a team projection.

### 4. Saved pregame reports and evaluation

Persist the exact source snapshot, model version, inputs and report timestamp used before kickoff. Compare results against a player-history baseline and a team-only baseline on untouched games. Historical date filters using a revised source file are useful research views, but do not reconstruct what data was actually published at that historical time.

### 5. Durable storage and optional Supabase

When scheduled ingestion and saved reports are needed, place protected jobs outside the browser. Supabase can store source manifests, team features, immutable reports and evaluation outcomes. Add authentication and row-level policies intentionally. An anonymous browser key is only appropriate for data the policies permit that browser to read; service-role keys belong exclusively in a protected worker.

No Supabase table or migration is required to run V1. Add the schema when there is a real persistence contract to enforce.

### 6. Edge Finder integration

Export matchup reports with stable game/team/player identifiers, a cutoff, source version, model version, coverage and prediction units. Keep football-only expectations independent of odds. Add market lines, prices, outcome probabilities and calibration as a downstream layer after the football forecast has demonstrated improvement.

## Additional feeds

NGS, PFR and FTN may add useful measurements, but they are not automatically available just because the application can access play-by-play. Implement each adapter with its own coverage audit, join rules, denominator and attribution. True route participation, alignment, individual coverage assignment and isolated line matchups require verified data before the interface can make those claims.
