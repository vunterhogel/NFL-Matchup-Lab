# V1 methodology

V1 is a descriptive positional matchup baseline. The calculations are deterministic and inspectable in `src/data/metrics.ts` and `src/data/selectors.ts`. There is no trained prediction model, opponent adjustment, calibrated uncertainty interval or hidden sportsbook input.

## Sample selection

A profile selects currently final games for that team with both kickoff and a conservative completion-availability timestamp strictly earlier than the selected cutoff. Availability is approximated by the last recorded play-by-play wall-clock timestamp plus 15 minutes; if absent, it falls back to kickoff plus six hours. This prevents a game still underway at a historical cutoff from contributing its eventual final statistics. It does not establish when the provider actually published every field. The cutoff cannot extend beyond the snapshot's `asOf` timestamp. An optional week cap is applied before choosing the most recent four games. “Last four” means four eligible games per team, not the last four NFL weeks; byes do not count as games.

For a defense, calculations use the opposing offenses' records from those same selected games. For league comparisons, every team receives the same requested cutoff/week rule and its own season or last-four sample.

A historical selection is a retrospective calculation using the source file currently bundled. It excludes later kickoffs but does not recover publication timestamps, original injury status or pre-correction play data. Do not use it as evidence of a genuinely frozen pregame forecast.

## Rates and exposures

Every metric definition names a numerator, denominator, unit, direction and sample thresholds. Game-level numerators and denominators are summed before calculating a rate:

```text
rate = sum(numerator) / sum(denominator)
percentage = rate × 100
```

For example, 10 completions on 10 attempts followed by zero on 90 attempts is a 10% completion rate, not the 50% average of those two game rates. A missing, invalid or zero denominator returns unavailable. A measured zero on a valid exposure is a real zero. EPA and yardage can be negative.

The league reference is pooled from the same eligible league numerators and denominators. It is exposure weighted, rather than the unweighted mean of team rates. There is no recency weighting or shrinkage in V1; season and last-four views are separate raw samples.

## Core definitions

- EPA means nflfastR expected points added. Success means EPA greater than zero on the eligible EPA sample.
- A dropback includes pass attempts, sacks and QB scrambles. It is broader than pass attempts.
- RB rushing uses roster-matched RB/FB designed carries; QB scrambles and kneels do not enter that group.
- A target is an eligible pass with an attributed receiver. Catch rates and receiving yards per target retain incompletions in the denominator.
- RB, WR and TE splits join GSIS player IDs to the latest row in the downloaded season roster, rather than a historical roster vintage. FB is included with RB. Unknown receiver positions do not become an invented position. Snapshot metadata reports target-position join coverage; a matched roster position does not establish current availability.
- Neutral pass rate uses quarters 1–3 and pre-play score difference within eight points.
- Pass rate over expected averages actual dropback indicator minus nflfastR expected pass probability on plays with an available estimate. It is displayed in percentage points.
- Explosive RB runs gain at least 10 rushing yards; stuffed RB runs gain zero or fewer yards.
- Short targets have fewer than 10 air yards, including throws behind the line. Intermediate targets have 10–19 air yards; deep targets have at least 20. Targets missing air yards do not enter a depth bucket.
- YAC per reception includes only receptions with an available YAC field.

All measurements are aggregate outcomes against a position or play style. They do not isolate individual coverage assignments, true routes, line talent or pressure.

## Percentiles and ranks

For quality measures, a higher offensive percentile means stronger offensive results. Defensive quality reverses the raw concession direction: allowing fewer passing yards per attempt is stronger; generating more sacks is stronger. The raw units remain visible so the orientation can be checked.

The midrank percentile is:

```text
100 × (number strictly worse + (number tied − 1) / 2) / (usable teams − 1)
```

Equal values receive equal percentiles. With two unique values, the stronger value is 100 and the weaker is zero. A single usable observation receives 50; no usable observations receive no percentile. Ranks use competition ranking: tied leaders are both first, followed by third. The interface reports the number of teams ranked; it does not assume all 32 have data at every cutoff.

Pass rate, plays per game and position/depth target shares describe **tendency or exposure**, not inherent quality. Higher tendency percentiles mean more of that behavior. They are not “better football” and do not enter the V1 matchup signal.

## Matchup signal

The evidence panel selects twelve efficiency measures across QB passing, RB rushing/receiving, WR receiving, TE receiving and target depth. For sufficient samples:

```text
signal = (offensive strength percentile − opposing defensive strength percentile) / 2
```

The scale runs from −50 to +50. A signal at least +12.5 is labeled favorable; at most −12.5 is difficult; between them is balanced. These fixed thresholds are a presentation heuristic, not a fitted statistical rule. If either side is missing or below its minimum exposure threshold, the signal is unavailable even when raw observed values can be shown.

A favorable signal means strong offensive results align with relatively weaker opposing defensive results in the same measure. It does not mean an expected 12.5% increase, a 75% chance of success, a player prop edge or an opponent-adjusted forecast. The model has not established the out-of-sample predictive value of the signal yet. Do not combine correlated evidence rows into a single claimed probability.

## Sample badges

Low/moderate/high badges are configured exposure categories. They are **not** confidence intervals, calibrated prediction certainty or a guarantee of data quality. The smaller of the two sides determines a matchup's badge.

| Metric family | Minimum sample for a signal | High sample |
| --- | ---: | ---: |
| Team EPA / success | 150 eligible EPA plays | 400 |
| QB EPA / success / sack rate | 80 relevant dropbacks | 200 |
| Passing yards/attempt, completion/interception rate | 60 attempts | 180 |
| RB rushing | 40 relevant carries | 120 |
| RB receiving efficiency | 15 targets | 45 |
| WR receiving efficiency | 40 targets | 120 |
| WR YAC | 25 receptions with YAC | 80 |
| TE receiving efficiency | 15 targets | 50 |
| Short receiving efficiency | 35 targets | 100 |
| Intermediate receiving efficiency | 15 targets | 50 |
| Deep receiving efficiency | 10 targets | 35 |

Different denominators within a family are defined in the metric catalog. These starting thresholds require validation; they are not learned effective sample sizes. V1 does not model within-game dependence, opponent diversity or uncertainty from the position join.

## Player opportunity context

Player target share uses the selected team's total attributed targets. Carry share uses all eligible team rushing attempts, including scrambles but excluding kneels, matching the player carry numerator. These are observed shares in the selected games, not projected allocations or estimates conditional on an injury. A player's game count means games with a recorded player-stat row in the selected sample, rather than verified active games or snaps played. Historical team records retain the team associated with those observations.

Favorable conditions and high absolute volume remain separate questions. V1 does not assign future targets/carries, redistribute an inactive player's work, project touchdowns or produce sportsbook probabilities.

## Validation boundary

The automated tests cover calculation invariants, cutoff behavior, unavailable samples and direction. Passing tests establish that the implementation follows these definitions; they do not establish predictive accuracy. The next stage is a prospectively saved report series and held-out comparison against simple team/player baselines. See [the extension plan](architecture.md).
