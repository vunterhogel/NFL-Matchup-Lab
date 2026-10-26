# Data sources, freshness and attribution

## Included research data

The baseline is derived from public [nflverse-data releases](https://github.com/nflverse/nflverse-data/releases), with nflverse/nflfastR play-by-play supplying the football measurements. The [play-by-play dictionary](https://nflreadr.nflverse.com/articles/dictionary_pbp.html) describes the underlying fields. Source URLs and snapshot generation time are retained with the generated dataset.

| Input | Role | Source |
| --- | --- | --- |
| Season play-by-play | Eligible plays, outcomes, depth, opportunities | nflverse-data `pbp/play_by_play_{season}.csv.gz` release asset |
| Season roster | GSIS ID → player name, position and headshot | nflverse-data `rosters/roster_{season}.csv` release asset |
| Schedule | Game identity, kickoff, teams, stadium and score | [Lee Sharpe / nflverse nfldata](https://github.com/nflverse/nfldata), `data/games.csv` |

Attribution: **NFL play-by-play data provided by nflverse and its upstream sources. Modified by NFL Matchup Lab into compact team/game aggregates and derived metrics.** The nflverse-data repository publishes [CC BY 4.0 terms](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md). Preserve this attribution and the source links when sharing a derived snapshot. Other feeds may have separate terms; this repository's MIT source-code license does not replace them.

The bundled snapshot is real source data, not invented team ratings. It is a fixed research input checked into the repository. The generated timestamp records when this project's refresh ran; it is not a guarantee that the upstream source contains every recent game or correction. Inspect actual completed-game coverage as well as the timestamp.

## Refresh workflow

```sh
npm run data:refresh -- --season 2026
```

The Node refresh script downloads source files and generates `public/data/snapshot.json`. It requires internet access but no credentials. `--season YYYY` is its supported option; without it, the script uses the prior season from January through August and the current calendar year from September through December, using UTC. Pass an explicit season for reproducibility. It includes regular-season games with an `END GAME` marker in play-by-play. Run it deliberately, then review the changed snapshot and run the checks before committing. The repository's check workflow does not refresh source data.

Before writing, the script verifies the columns it consumes, schedule identities/times/scores, completed-play yardage, binary flags, paired team/game rows and at least 98% target-position joins. Missing optional EPA, expected-pass, air-yard and YAC observations are excluded from the relevant denominator, with availability counts retained in metadata. Download/schema/coverage errors preserve the existing snapshot. These are baseline guards, not complete box-score reconciliation or guaranteed league-wide completeness. A successful download can still lag a recent game.

The site loads the bundled snapshot. Reloading that snapshot in the interface does not query ESPN or trigger upstream ingestion. For a deployed static copy, publish a new build after committing refreshed data.

## Source availability versus report availability

[nflverse documents its refresh cadence and correction schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html). Those schedules describe the upstream datasets; this repository only receives new information when its own refresh script runs. Current-season coverage can lag games and revisions can change historical outcomes.

V1 comparisons use completed-game data with a conservative completion-time guard, described in the [methodology](methodology.md). A historical cutoff excludes later/unfinished games from the calculation, but the bundled source file may already contain later stat corrections. This is a retrospective profile, not an immutable forecast saved at that earlier time. Measuring real forecast improvement will require frozen pregame inputs and outcomes.

## Display assets

Team logos are loaded from ESPN's image CDN and are used to identify clubs. Player headshot URLs come from the downloaded nflverse season roster. The interface includes a local text fallback if a remote image does not load. NFL and club names, marks, logos and photographs remain the property of their respective owners. The application is not endorsed by or affiliated with the NFL, its clubs, ESPN or nflverse. The MIT license applies to this project's original source code, not third-party images or data.

Logo availability is independent of analytics availability. An image failing to load must not prevent a team report from working.

## Explicit coverage boundaries

V1 does not connect NGS, PFR pressure charts, FTN charting, weather, injury reports, sportsbook prices or an authenticated player-tracking feed. Data fields must not be implied to exist simply because a future source supports them.

- Target depth describes the distance of a throw; it does not identify slot/outside alignment or a route concept.
- Sacks are observed sack outcomes; sack rate is not measured pressure rate.
- Position splits describe production against a group; they do not identify a specific coverage assignment.
- A team's rushing outcomes do not isolate offensive-line or defensive-line talent.
- Season and recent samples overlap. They are alternative views rather than independent signals to multiply together.
- A league percentile is relative to teams with usable values in the selected sample. Missing values stay unavailable.

Before adding any new provider, record its URL, retrieval time, usable seasons, update lag, field definitions, stable IDs, join coverage and terms. Keep incomplete data visibly unavailable rather than replacing it with average-looking values.
