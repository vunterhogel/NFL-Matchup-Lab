import { METRICS, computePercentile, evaluateMetric } from "./metrics";
import type {
  Matchup,
  MatchupEvidence,
  MetricResult,
  PlayerSummary,
  ProfileOptions,
  Side,
  Snapshot,
  TeamGameStats,
  TeamProfile,
} from "./types";

export { computePercentile, evaluateMetric } from "./metrics";

const profileCache = new WeakMap<Snapshot, Map<string, TeamProfile>>();
const leagueCache = new WeakMap<
  Snapshot,
  Map<string, { id: string; stats: Record<string, number> }[]>
>();
const rowIndexCache = new WeakMap<Snapshot, Set<string>>();
const optionKey = (options: ProfileOptions) =>
  `${options.before ?? ""}|${options.throughWeek ?? ""}|${options.window ?? "season"}`;

export function aggregateTeamGames(
  rows: TeamGameStats[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows)
    for (const [key, value] of Object.entries(row.stats)) {
      if (Number.isFinite(value)) totals[key] = (totals[key] ?? 0) + value;
    }
  return totals;
}

function selection(
  snapshot: Snapshot,
  teamId: string,
  options: ProfileOptions = {},
) {
  const requested = options.before
    ? Date.parse(options.before)
    : Date.parse(snapshot.meta.asOf);
  if (!Number.isFinite(requested))
    throw new Error("The profile cutoff must be a valid ISO date.");
  const cutoff = Math.min(requested, Date.parse(snapshot.meta.asOf));
  let rowIndex = rowIndexCache.get(snapshot);
  if (!rowIndex) {
    rowIndex = new Set(
      snapshot.teamGames.map((row) => `${row.gameId}:${row.teamId}`),
    );
    rowIndexCache.set(snapshot, rowIndex);
  }
  const eligible = snapshot.games
    .filter(
      (g) =>
        g.status === "final" &&
        Date.parse(g.kickoff) < cutoff &&
        Date.parse(
          g.completedAt ??
            new Date(Date.parse(g.kickoff) + 6 * 3_600_000).toISOString(),
        ) < cutoff &&
        (options.throughWeek === undefined || g.week <= options.throughWeek) &&
        (g.homeTeam === teamId || g.awayTeam === teamId) &&
        rowIndex!.has(`${g.id}:${teamId}`),
    )
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  return {
    cutoff: new Date(cutoff).toISOString(),
    games: options.window === "last4" ? eligible.slice(-4) : eligible,
  };
}

function rowsFor(
  snapshot: Snapshot,
  teamId: string,
  side: Side,
  options: ProfileOptions,
): TeamGameStats[] {
  const ids = new Set(
    selection(snapshot, teamId, options).games.map((g) => g.id),
  );
  return snapshot.teamGames.filter(
    (row) =>
      ids.has(row.gameId) &&
      (side === "offense" ? row.teamId === teamId : row.opponentId === teamId),
  );
}

function metricsFor(
  snapshot: Snapshot,
  teamId: string,
  side: Side,
  options: ProfileOptions,
): MetricResult[] {
  let cachedLeague = leagueCache.get(snapshot);
  if (!cachedLeague) {
    cachedLeague = new Map();
    leagueCache.set(snapshot, cachedLeague);
  }
  const cacheKey = `${side}|${optionKey(options)}`;
  let league = cachedLeague.get(cacheKey);
  if (!league) {
    league = snapshot.teams.map((team) => ({
      id: team.id,
      stats: aggregateTeamGames(rowsFor(snapshot, team.id, side, options)),
    }));
    cachedLeague.set(cacheKey, league);
  }
  const own = league.find((row) => row.id === teamId)?.stats ?? {};
  const pooled = league.reduce(
    (sum, row) => {
      for (const [key, value] of Object.entries(row.stats))
        sum[key] = (sum[key] ?? 0) + value;
      return sum;
    },
    {} as Record<string, number>,
  );
  return METRICS.map((definition) => {
    const higherIsBetter =
      side === "defense"
        ? !definition.higherIsBetter
        : definition.higherIsBetter;
    const value = evaluateMetric(definition, own);
    const values = league.map((row) => evaluateMetric(definition, row.stats));
    const valid = values.filter((v): v is number => v !== null);
    const sample = own[definition.denominator] ?? 0;
    const rank =
      value === null
        ? null
        : 1 +
          valid.filter((v) =>
            higherIsBetter ? v > value + 1e-10 : v < value - 1e-10,
          ).length;
    return {
      ...definition,
      higherIsBetter,
      value,
      leagueAverage: evaluateMetric(definition, pooled),
      percentile: computePercentile(value, values, higherIsBetter),
      rank,
      sample,
      reliability:
        sample < definition.minimumSample
          ? "low"
          : sample < definition.highSample
            ? "moderate"
            : "high",
      rankedTeams: valid.length,
    };
  });
}

export function getProfile(
  snapshot: Snapshot,
  teamId: string,
  options: ProfileOptions = {},
): TeamProfile {
  if (!snapshot.teams.some((team) => team.id === teamId))
    throw new Error(`Unknown team: ${teamId}`);
  let cached = profileCache.get(snapshot);
  if (!cached) {
    cached = new Map();
    profileCache.set(snapshot, cached);
  }
  const cacheKey = `${teamId}|${optionKey(options)}`;
  const existing = cached.get(cacheKey);
  if (existing) return existing;
  const selected = selection(snapshot, teamId, options);
  const record = { wins: 0, losses: 0, ties: 0 };
  for (const game of selected.games) {
    if (game.homeScore === undefined || game.awayScore === undefined) continue;
    const margin =
      (game.homeScore - game.awayScore) * (game.homeTeam === teamId ? 1 : -1);
    record[margin > 0 ? "wins" : margin < 0 ? "losses" : "ties"]++;
  }
  const profile: TeamProfile = {
    teamId,
    games: selected.games.length,
    gameIds: selected.games.map((g) => g.id),
    cutoff: selected.cutoff,
    window: options.window ?? "season",
    record,
    offense: metricsFor(snapshot, teamId, "offense", options),
    defense: metricsFor(snapshot, teamId, "defense", options),
  };
  cached.set(cacheKey, profile);
  return profile;
}

const EVIDENCE_KEYS = [
  "qbEpa",
  "yardsPerAttempt",
  "sackRate",
  "rbYardsPerCarry",
  "rbRushEpa",
  "rbYardsPerTarget",
  "wrYardsPerTarget",
  "wrYac",
  "teYardsPerTarget",
  "shortYardsPerTarget",
  "intermediateYardsPerTarget",
  "deepYardsPerTarget",
];

/** Descriptive percentile alignment only: no fitted adjustment, outcome probability or player projection. */
export function getMatchup(
  snapshot: Snapshot,
  offenseId: string,
  defenseId: string,
  options: ProfileOptions = {},
): Matchup {
  const offense = getProfile(snapshot, offenseId, options);
  const defense = getProfile(snapshot, defenseId, options);
  const evidence: MatchupEvidence[] = EVIDENCE_KEYS.map((key) => {
    const attack = offense.offense.find((metric) => metric.key === key)!;
    const resistance = defense.defense.find((metric) => metric.key === key)!;
    const reliability =
      attack.reliability === "low" || resistance.reliability === "low"
        ? "low"
        : attack.reliability === "moderate" ||
            resistance.reliability === "moderate"
          ? "moderate"
          : "high";
    const signal =
      attack.percentile === null ||
      resistance.percentile === null ||
      reliability === "low"
        ? null
        : (attack.percentile - resistance.percentile) / 2;
    const direction =
      signal === null
        ? "unavailable"
        : signal >= 12.5
          ? "favorable"
          : signal <= -12.5
            ? "difficult"
            : "balanced";
    const explanation =
      signal === null
        ? "Too few eligible observations to describe an alignment."
        : `Offense ranks ${attack.rank} of ${attack.rankedTeams}; opposing defense ranks ${resistance.rank} of ${resistance.rankedTeams} in the same measure. Percentile alignment is descriptive, not a forecast.`;
    return {
      key,
      label: attack.label,
      group: attack.group,
      offense: attack,
      defense: resistance,
      signal,
      direction,
      reliability,
      explanation,
    };
  });
  return { offense, defense, evidence };
}

export function getPlayers(
  snapshot: Snapshot,
  teamId: string,
  options: ProfileOptions = {},
): PlayerSummary[] {
  const gameIds = new Set(
    selection(snapshot, teamId, options).games.map((g) => g.id),
  );
  const own = snapshot.playerGames.filter(
    (row) => row.teamId === teamId && gameIds.has(row.gameId),
  );
  const teamTotals = aggregateTeamGames(
    rowsFor(snapshot, teamId, "offense", options),
  );
  const byPlayer = new Map<
    string,
    { stats: Record<string, number>; games: Set<string> }
  >();
  for (const row of own) {
    const current = byPlayer.get(row.playerId) ?? {
      stats: {},
      games: new Set<string>(),
    };
    current.games.add(row.gameId);
    for (const [key, value] of Object.entries(row.stats))
      current.stats[key] = (current.stats[key] ?? 0) + value;
    byPlayer.set(row.playerId, current);
  }
  return Array.from(byPlayer.entries())
    .map(([playerId, { stats, games }]) => {
      const player = snapshot.players.find((p) => p.id === playerId)!;
      const targets = stats.targets ?? 0,
        carries = stats.carries ?? 0;
      return {
        ...player,
        teamId,
        games: games.size,
        targets,
        carries,
        receivingYards: stats.receivingYards ?? 0,
        rushingYards: stats.rushingYards ?? 0,
        passingYards: stats.passingYards ?? 0,
        passingAttempts: stats.passingAttempts ?? 0,
        receptions: stats.receptions ?? 0,
        passingTouchdowns: stats.passingTouchdowns ?? 0,
        rushingTouchdowns: stats.rushingTouchdowns ?? 0,
        receivingTouchdowns: stats.receivingTouchdowns ?? 0,
        targetShare:
          (teamTotals.targets ?? 0) > 0
            ? (targets / teamTotals.targets) * 100
            : null,
        carryShare:
          (teamTotals.carries ?? 0) > 0
            ? (carries / teamTotals.carries) * 100
            : null,
      };
    })
    .sort(
      (a, b) =>
        b.targets +
        b.carries +
        b.passingAttempts -
        (a.targets + a.carries + a.passingAttempts),
    );
}

export function getTrend(
  snapshot: Snapshot,
  teamId: string,
  key: string,
  side: Side = "offense",
  options: ProfileOptions = {},
) {
  const definition = METRICS.find((metric) => metric.key === key);
  if (!definition) return [];
  const selected = selection(snapshot, teamId, options);
  return selected.games.map((game) => {
    const row = snapshot.teamGames.find(
      (r) =>
        r.gameId === game.id &&
        (side === "offense" ? r.teamId === teamId : r.opponentId === teamId),
    );
    return {
      week: game.week,
      gameId: game.id,
      opponentId: game.homeTeam === teamId ? game.awayTeam : game.homeTeam,
      value: row ? evaluateMetric(definition, row.stats) : null,
    };
  });
}
