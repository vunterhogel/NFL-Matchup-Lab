import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateTeamGames,
  getMatchup,
  getPlayers,
  getProfile,
} from "../src/data/selectors";
import type { Game, Snapshot, Team, TeamGameStats } from "../src/data/types";

const team = (id: string): Team => ({
  id,
  abbreviation: id,
  name: id,
  shortName: id,
  conference: "NFC",
  division: "East",
  color: "#123456",
  alternateColor: "#ffffff",
  logo: "",
});

function snapshot(games: Game[], teamGames: TeamGameStats[]): Snapshot {
  return {
    schemaVersion: 1,
    meta: {
      season: 2025,
      generatedAt: "2026-02-01T00:00:00.000Z",
      observedAt: "2026-02-01T00:00:00.000Z",
      asOf: "2026-02-01T00:00:00.000Z",
      latestGameDate: "2026-01-30",
      completedGames: games.length,
      latestWeek: 18,
      modelVersion: "test-fixture",
      coverage: {
        targets: 0,
        positionMatchedTargets: 0,
        targetPositionJoinRate: 0,
        unknownReceiverIds: [],
      },
      sources: [],
      notes: [],
    },
    teams: [team("AAA"), team("BBB")],
    games,
    teamGames,
    players: [],
    playerGames: [],
  };
}

function game(week: number, status: Game["status"] = "final"): Game {
  return {
    id: `2025_${week}_AAA_BBB`,
    season: 2025,
    week,
    seasonType: "REG",
    homeTeam: "AAA",
    awayTeam: "BBB",
    kickoff: `2026-01-${String(week * 3).padStart(2, "0")}T18:00:00.000Z`,
    status,
    homeScore: 24,
    awayScore: 17,
  };
}

function rows(
  g: Game,
  a: Record<string, number>,
  b: Record<string, number>,
): TeamGameStats[] {
  return [
    {
      gameId: g.id,
      teamId: "AAA",
      opponentId: "BBB",
      stats: { games: 1, ...a },
    },
    {
      gameId: g.id,
      teamId: "BBB",
      opponentId: "AAA",
      stats: { games: 1, ...b },
    },
  ];
}

test("a multi-game rate is opportunity weighted, not an average of per-game rates", () => {
  const g1 = game(1),
    g2 = game(2);
  const data = snapshot(
    [g1, g2],
    [
      ...rows(
        g1,
        { completions: 10, attempts: 10 },
        { completions: 5, attempts: 10 },
      ),
      ...rows(
        g2,
        { completions: 0, attempts: 90 },
        { completions: 45, attempts: 90 },
      ),
    ],
  );
  const result = getProfile(data, "AAA").offense.find(
    (item) => item.key === "completionRate",
  )!;
  assert.equal(result.value, 10);
  assert.equal(result.sample, 100);
  assert.equal(result.leagueAverage, 30);
});

test("cutoff is strict and scheduled or in-progress games never enter a profile", () => {
  const games = [
    game(1),
    game(2),
    game(3),
    game(4, "scheduled"),
    game(5, "in_progress"),
  ];
  const data = snapshot(
    games,
    games.flatMap((g) => rows(g, { attempts: 30 }, { attempts: 30 })),
  );
  const beforeThirdKickoff = getProfile(data, "AAA", {
    before: games[2].kickoff,
  });
  assert.deepEqual(beforeThirdKickoff.gameIds, [games[0].id, games[1].id]);
  assert.equal(beforeThirdKickoff.record.wins, 2);
  assert.equal(getProfile(data, "AAA").games, 3);
  assert.throws(
    () => getProfile(data, "AAA", { before: "yesterday-ish" }),
    /valid ISO date/,
  );
  assert.throws(() => getProfile(data, "UNKNOWN"), /Unknown team/);
});

test("last four means four eligible games per team and respects the week cap", () => {
  const games = [6, 2, 5, 1, 4, 3].map((week) => game(week));
  const data = snapshot(
    games,
    games.flatMap((g) => rows(g, { attempts: 30 }, { attempts: 30 })),
  );
  const result = getProfile(data, "AAA", { window: "last4", throughWeek: 5 });
  assert.deepEqual(
    result.gameIds,
    [2, 3, 4, 5].map((week) => game(week).id),
  );
  assert.equal(result.games, 4);
  const capped = getProfile(data, "AAA", { before: "2030-01-01T00:00:00Z" });
  assert.equal(capped.cutoff, data.meta.asOf);
});

test("a final game cannot leak its finished results into a cutoff while it was still underway", () => {
  const g = { ...game(1), completedAt: "2026-01-03T21:45:00.000Z" };
  const data = snapshot([g], rows(g, { attempts: 30 }, { attempts: 30 }));
  assert.equal(
    getProfile(data, "AAA", { before: "2026-01-03T21:25:00.000Z" }).games,
    0,
  );
  assert.equal(getProfile(data, "AAA", { before: g.completedAt }).games, 0);
  assert.equal(
    getProfile(data, "AAA", { before: "2026-01-03T21:46:00.000Z" }).games,
    1,
  );
});

test("defensive strength rewards lower yards allowed but higher sacks generated", () => {
  const g = game(1);
  const data = snapshot(
    [g],
    rows(
      g,
      { passingYards: 800, attempts: 100, sacks: 2, dropbacks: 102 },
      { passingYards: 500, attempts: 100, sacks: 10, dropbacks: 110 },
    ),
  );
  const a = getProfile(data, "AAA");
  const b = getProfile(data, "BBB");
  const get = (profile: typeof a, key: string) =>
    profile.defense.find((item) => item.key === key)!;
  assert.equal(get(a, "yardsPerAttempt").value, 5);
  assert.equal(get(b, "yardsPerAttempt").value, 8);
  assert.equal(get(a, "yardsPerAttempt").percentile, 100);
  assert.equal(get(b, "yardsPerAttempt").percentile, 0);
  assert.equal(get(a, "sackRate").percentile, 100);
  assert.equal(get(b, "sackRate").percentile, 0);
});

test("matchup direction is offense relative to opposing defensive strength; sparse splits are unavailable", () => {
  const g = game(1);
  const data = snapshot(
    [g],
    rows(
      g,
      { passEpa: 50, passEpaPlays: 100, teReceivingYards: 20, teTargets: 2 },
      { passEpa: -30, passEpaPlays: 100, teReceivingYards: 8, teTargets: 2 },
    ),
  );
  const attack = getMatchup(data, "AAA", "BBB");
  const reverse = getMatchup(data, "BBB", "AAA");
  assert.equal(
    attack.evidence.find((item) => item.key === "qbEpa")?.direction,
    "favorable",
  );
  assert.equal(
    reverse.evidence.find((item) => item.key === "qbEpa")?.direction,
    "difficult",
  );
  const sparse = attack.evidence.find(
    (item) => item.key === "teYardsPerTarget",
  )!;
  assert.equal(sparse.offense.value, 10);
  assert.equal(sparse.reliability, "low");
  assert.equal(sparse.signal, null);
  assert.equal(sparse.direction, "unavailable");
});

test("player opportunity shares use the selected team exposure and respect the cutoff", () => {
  const g1 = game(1),
    g2 = game(2);
  const data = snapshot(
    [g1, g2],
    [
      ...rows(g1, { targets: 20, carries: 10 }, {}),
      ...rows(g2, { targets: 40, carries: 20 }, {}),
    ],
  );
  data.players = [
    {
      id: "p1",
      name: "Fixture Receiver",
      position: "WR",
      teamId: "AAA",
      headshot: null,
    },
  ];
  data.playerGames = [
    {
      gameId: g1.id,
      teamId: "AAA",
      playerId: "p1",
      stats: { targets: 10, receivingYards: 90, carries: 2 },
    },
    {
      gameId: g2.id,
      teamId: "AAA",
      playerId: "p1",
      stats: { targets: 20, receivingYards: 150, carries: 1 },
    },
  ];
  const [result] = getPlayers(data, "AAA", { before: g2.kickoff });
  assert.equal(result.games, 1);
  assert.equal(result.targets, 10);
  assert.equal(result.targetShare, 50);
  assert.equal(result.carryShare, 20);
  assert.equal(result.receivingYards, 90);
});

test("aggregation keeps signed outcomes and ignores non-finite source values", () => {
  const total = aggregateTeamGames([
    {
      gameId: "1",
      teamId: "AAA",
      opponentId: "BBB",
      stats: { epa: -2, plays: 1 },
    },
    {
      gameId: "2",
      teamId: "AAA",
      opponentId: "BBB",
      stats: { epa: 5, plays: 2, invalid: Number.NaN },
    },
  ]);
  assert.equal(total.epa, 3);
  assert.equal(total.plays, 3);
  assert.equal(total.invalid, undefined);
});
