#!/usr/bin/env node
/** Reproducible public-data ingest. Node 20+, no credentials or third-party runtime dependencies. */
import { gunzipSync } from "node:zlib";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_PBP_COLUMNS,
  REQUIRED_ROSTER_COLUMNS,
  assertColumns,
  assertBinaryFields,
  defaultSeason,
  optionalNumber,
  requireNumber,
  validateSchedule,
} from "./ingest-validation.mjs";

const args = process.argv.slice(2);
const seasonArg = args.indexOf("--season");
const season = seasonArg >= 0 ? Number(args[seasonArg + 1]) : defaultSeason();
if (
  !Number.isInteger(season) ||
  season < 1999 ||
  season > new Date().getUTCFullYear() + 1
)
  throw new Error("Use --season YYYY (1999 or newer).");
const observedAt = new Date().toISOString();
const sources = [
  {
    name: "nflverse play-by-play",
    url: `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`,
  },
  {
    name: "nflverse season roster",
    url: `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`,
  },
  {
    name: "nflverse schedule",
    url: "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
  },
];

function parseCsv(text) {
  // RFC 4180 fields, including escaped quotes and embedded newlines in play descriptions.
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift();
  if (!headers || quoted) throw new Error("Malformed upstream CSV.");
  return rows.map((values) =>
    Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ""])),
  );
}

const downloaded = await Promise.all(
  sources.map(async (source) => {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(120_000),
      headers: { "User-Agent": "NFL-Matchup-Lab/1.0 public-research-ingest" },
    });
    if (!response.ok)
      throw new Error(
        `${source.name}: HTTP ${response.status}. The existing snapshot was not changed.`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    const text = source.url.endsWith(".gz")
      ? gunzipSync(bytes).toString("utf8")
      : bytes.toString("utf8");
    return {
      rows: parseCsv(text),
      source: {
        ...source,
        fetchedAt: new Date().toISOString(),
        lastModified: response.headers.get("last-modified"),
      },
    };
  }),
);
const [pbpRows, rosterRows, scheduleRows] = downloaded.map(
  (result) => result.rows,
);
assertColumns(pbpRows, REQUIRED_PBP_COLUMNS, "nflverse play-by-play");
assertColumns(rosterRows, REQUIRED_ROSTER_COLUMNS, "nflverse roster");

const teamRows = [
  ["ARI", "Arizona Cardinals", "Cardinals", "NFC", "West", "97233F", "000000"],
  ["ATL", "Atlanta Falcons", "Falcons", "NFC", "South", "A71930", "000000"],
  ["BAL", "Baltimore Ravens", "Ravens", "AFC", "North", "241773", "9E7C0C"],
  ["BUF", "Buffalo Bills", "Bills", "AFC", "East", "00338D", "C60C30"],
  ["CAR", "Carolina Panthers", "Panthers", "NFC", "South", "0085CA", "101820"],
  ["CHI", "Chicago Bears", "Bears", "NFC", "North", "0B162A", "C83803"],
  ["CIN", "Cincinnati Bengals", "Bengals", "AFC", "North", "FB4F14", "000000"],
  ["CLE", "Cleveland Browns", "Browns", "AFC", "North", "311D00", "FF3C00"],
  ["DAL", "Dallas Cowboys", "Cowboys", "NFC", "East", "003594", "869397"],
  ["DEN", "Denver Broncos", "Broncos", "AFC", "West", "FB4F14", "002244"],
  ["DET", "Detroit Lions", "Lions", "NFC", "North", "0076B6", "B0B7BC"],
  ["GB", "Green Bay Packers", "Packers", "NFC", "North", "203731", "FFB612"],
  ["HOU", "Houston Texans", "Texans", "AFC", "South", "03202F", "A71930"],
  ["IND", "Indianapolis Colts", "Colts", "AFC", "South", "002C5F", "A2AAAD"],
  [
    "JAX",
    "Jacksonville Jaguars",
    "Jaguars",
    "AFC",
    "South",
    "006778",
    "D7A22A",
  ],
  ["KC", "Kansas City Chiefs", "Chiefs", "AFC", "West", "E31837", "FFB81C"],
  ["LA", "Los Angeles Rams", "Rams", "NFC", "West", "003594", "FFA300"],
  [
    "LAC",
    "Los Angeles Chargers",
    "Chargers",
    "AFC",
    "West",
    "0080C6",
    "FFC20E",
  ],
  ["LV", "Las Vegas Raiders", "Raiders", "AFC", "West", "000000", "A5ACAF"],
  ["MIA", "Miami Dolphins", "Dolphins", "AFC", "East", "008E97", "FC4C02"],
  ["MIN", "Minnesota Vikings", "Vikings", "NFC", "North", "4F2683", "FFC62F"],
  ["NE", "New England Patriots", "Patriots", "AFC", "East", "002244", "C60C30"],
  ["NO", "New Orleans Saints", "Saints", "NFC", "South", "D3BC8D", "101820"],
  ["NYG", "New York Giants", "Giants", "NFC", "East", "0B2265", "A71930"],
  ["NYJ", "New York Jets", "Jets", "AFC", "East", "125740", "FFFFFF"],
  ["PHI", "Philadelphia Eagles", "Eagles", "NFC", "East", "004C54", "A5ACAF"],
  [
    "PIT",
    "Pittsburgh Steelers",
    "Steelers",
    "AFC",
    "North",
    "FFB612",
    "101820",
  ],
  ["SEA", "Seattle Seahawks", "Seahawks", "NFC", "West", "002244", "69BE28"],
  ["SF", "San Francisco 49ers", "49ers", "NFC", "West", "AA0000", "B3995D"],
  [
    "TB",
    "Tampa Bay Buccaneers",
    "Buccaneers",
    "NFC",
    "South",
    "D50A0A",
    "34302B",
  ],
  ["TEN", "Tennessee Titans", "Titans", "AFC", "South", "0C2340", "4B92DB"],
  [
    "WAS",
    "Washington Commanders",
    "Commanders",
    "NFC",
    "East",
    "5A1414",
    "FFB612",
  ],
];
const teams = teamRows.map(
  ([id, name, shortName, conference, division, color, alternateColor]) => ({
    id,
    abbreviation: id === "LA" ? "LAR" : id === "WAS" ? "WSH" : id,
    name,
    shortName,
    conference,
    division,
    color: `#${color}`,
    alternateColor: `#${alternateColor}`,
    logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${{ LA: "lar", WAS: "wsh" }[id] ?? id.toLowerCase()}.png`,
  }),
);
const num = optionalNumber;
const one = (value) => value === "1";
const canonical = (id) =>
  ({ LAR: "LA", WSH: "WAS", OAK: "LV", SD: "LAC", STL: "LA" })[id] ?? id;
const seasonSchedule = validateSchedule(
  scheduleRows,
  season,
  new Set(teams.map((team) => team.id)),
  canonical,
);
const roster = new Map();
for (const row of rosterRows) {
  if (!row.gsis_id) continue;
  const previous = roster.get(row.gsis_id);
  if (!previous || (num(row.week) ?? 0) >= (num(previous.week) ?? 0))
    roster.set(row.gsis_id, row);
}
const completeIds = new Set(
  pbpRows
    .filter((row) => row.season_type === "REG" && /^END GAME\b/.test(row.desc))
    .map((row) => row.game_id),
);
const presentIds = new Set(pbpRows.map((row) => row.game_id));
const latestEvent = new Map();
for (const row of pbpRows)
  for (const key of ["time_of_day", "end_clock_time"]) {
    const time = Date.parse(row[key]);
    if (Number.isFinite(time) && time > (latestEvent.get(row.game_id) ?? 0))
      latestEvent.set(row.game_id, time);
  }
function kickoffUtc(day, time) {
  // nflverse gametime is America/New_York. Derive the date-specific UTC offset (DST included).
  const naive = new Date(`${day}T${time || "13:00"}:00Z`);
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(naive)
    .find((part) => part.type === "timeZoneName").value;
  const match = zone.match(/GMT([+-])(\d+)(?::(\d+))?/);
  const minutes = match
    ? (match[1] === "+" ? 1 : -1) *
      (Number(match[2]) * 60 + Number(match[3] ?? 0))
    : 0;
  return new Date(naive.getTime() - minutes * 60_000).toISOString();
}
const games = seasonSchedule
  .map((row) => {
    const homeScore = num(row.home_score),
      awayScore = num(row.away_score);
    if (
      completeIds.has(row.game_id) &&
      (homeScore === null || awayScore === null)
    )
      throw new Error(
        `Schedule missing final score for completed play-by-play game ${row.game_id}. Retry when sources agree.`,
      );
    const status =
      completeIds.has(row.game_id) || (homeScore !== null && awayScore !== null)
        ? "final"
        : presentIds.has(row.game_id)
          ? "in_progress"
          : "scheduled";
    const kickoff = kickoffUtc(row.gameday, row.gametime);
    const completedAt = completeIds.has(row.game_id)
      ? new Date(
          latestEvent.has(row.game_id)
            ? latestEvent.get(row.game_id) + 15 * 60_000
            : Date.parse(kickoff) + 6 * 3_600_000,
        ).toISOString()
      : undefined;
    return {
      id: row.game_id,
      season,
      week: Number(row.week),
      seasonType: "REG",
      homeTeam: canonical(row.home_team),
      awayTeam: canonical(row.away_team),
      kickoff,
      completedAt,
      status,
      ...(homeScore === null ? {} : { homeScore }),
      ...(awayScore === null ? {} : { awayScore }),
      stadium: row.stadium || undefined,
      espnId: row.espn || undefined,
    };
  })
  .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
const eligibleIds = new Set(
  games
    .filter(
      (game) =>
        completeIds.has(game.id) &&
        Date.parse(game.kickoff) < Date.parse(observedAt),
    )
    .map((game) => game.id),
);
const gameById = new Map(games.map((game) => [game.id, game]));
if (!eligibleIds.size)
  throw new Error(
    `No completed regular-season play-by-play games found for ${season}; existing snapshot preserved.`,
  );
const teamGameMap = new Map(),
  playerGameMap = new Map(),
  playerMap = new Map();
const add = (stats, key, value = 1) => {
  if (value !== null && Number.isFinite(value))
    stats[key] = (stats[key] ?? 0) + value;
};
function teamGame(row) {
  const teamId = canonical(row.posteam),
    opponentId = canonical(row.defteam),
    key = `${row.game_id}:${teamId}`;
  if (!teamGameMap.has(key))
    teamGameMap.set(key, {
      gameId: row.game_id,
      teamId,
      opponentId,
      stats: { games: 1 },
    });
  return teamGameMap.get(key).stats;
}
function playerGame(row, id, fallbackName) {
  if (!id) return null;
  const position = roster.get(id),
    teamId = canonical(row.posteam),
    key = `${row.game_id}:${id}:${teamId}`;
  if (!playerMap.has(id))
    playerMap.set(id, {
      id,
      name: position?.full_name || fallbackName || id,
      position: position?.position || "UNK",
      teamId: canonical(position?.team || teamId),
      headshot: position?.headshot_url || null,
      espnId: position?.espn_id || undefined,
    });
  if (!playerGameMap.has(key))
    playerGameMap.set(key, {
      gameId: row.game_id,
      teamId,
      playerId: id,
      stats: {},
    });
  return playerGameMap.get(key).stats;
}
let targets = 0,
  positionMatchedTargets = 0;
const optionalFields = {
  eligiblePlays: 0,
  epaAvailable: 0,
  xpassAvailable: 0,
  targetsWithAirYards: 0,
  completedTargets: 0,
  completedTargetsWithYac: 0,
  designedRushAttempts: 0,
  positionMatchedDesignedRushes: 0,
};
const unknownReceiverIds = new Set();
for (const row of pbpRows) {
  if (!eligibleIds.has(row.game_id) || !["run", "pass"].includes(row.play_type))
    continue;
  assertBinaryFields(row, [
    "qb_kneel",
    "qb_spike",
    "two_point_attempt",
    "play_deleted",
    "qb_dropback",
    "rush_attempt",
  ]);
  if (
    one(row.qb_kneel) ||
    one(row.qb_spike) ||
    one(row.two_point_attempt) ||
    one(row.play_deleted) ||
    (!one(row.qb_dropback) && !one(row.rush_attempt))
  )
    continue;
  assertBinaryFields(row, [
    "qb_scramble",
    "sack",
    "pass_attempt",
    "complete_pass",
    "interception",
    "pass_touchdown",
    "rush_touchdown",
  ]);
  const game = gameById.get(row.game_id),
    offense = canonical(row.posteam),
    defense = canonical(row.defteam);
  if (
    !row.posteam ||
    !row.defteam ||
    offense === defense ||
    ![game.homeTeam, game.awayTeam].includes(offense) ||
    ![game.homeTeam, game.awayTeam].includes(defense)
  )
    throw new Error(
      `Play-by-play ${row.game_id}: inconsistent offense/defense identity.`,
    );
  const quarter = requireNumber(row.qtr, `Play-by-play ${row.game_id} quarter`);
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 6)
    throw new Error(`Play-by-play ${row.game_id}: invalid quarter.`);
  const stats = teamGame(row),
    epa = num(row.epa),
    success = epa === null ? null : epa > 0 ? 1 : 0;
  const dropback = one(row.qb_dropback),
    scramble = one(row.qb_scramble),
    sack = one(row.sack);
  optionalFields.eligiblePlays++;
  if (epa !== null) optionalFields.epaAvailable++;
  add(stats, "plays");
  if (epa !== null) {
    add(stats, "epa", epa);
    add(stats, "epaPlays");
    add(stats, "successes", success);
  }
  const xpass = num(row.xpass);
  if (xpass !== null) {
    if (xpass < 0 || xpass > 1)
      throw new Error(
        `Play-by-play ${row.game_id}: xpass must be between zero and one.`,
      );
    optionalFields.xpassAvailable++;
  }
  if (xpass !== null) {
    add(stats, "passOe", (dropback ? 1 : 0) - xpass);
    add(stats, "passOePlays");
  }
  const differential = requireNumber(
    row.score_differential,
    `Play-by-play ${row.game_id} score differential`,
  );
  if (quarter <= 3 && Math.abs(differential) <= 8) {
    add(stats, "neutralPlays");
    if (dropback) add(stats, "neutralDropbacks");
  }
  if (dropback) {
    add(stats, "dropbacks");
    if (sack) add(stats, "sacks");
    if (epa !== null) {
      add(stats, "passEpa", epa);
      add(stats, "passEpaPlays");
      add(stats, "passSuccesses", success);
    }
  }
  const attempt = one(row.pass_attempt) && !sack && !scramble;
  if (attempt) {
    if (!row.passer_player_id)
      throw new Error(
        `Play-by-play ${row.game_id}: pass attempt missing passer ID.`,
      );
    const passingYards = one(row.complete_pass)
      ? requireNumber(
          row.passing_yards,
          `Play-by-play ${row.game_id} completed-pass yards`,
        )
      : (num(row.passing_yards) ?? 0);
    if (one(row.complete_pass) && !row.receiver_player_id)
      throw new Error(
        `Play-by-play ${row.game_id}: completion missing receiver ID.`,
      );
    add(stats, "attempts");
    add(stats, "passingYards", passingYards);
    add(stats, "completions", one(row.complete_pass) ? 1 : 0);
    add(stats, "interceptions", one(row.interception) ? 1 : 0);
    const passer = playerGame(
      row,
      row.passer_player_id,
      row.passer_player_name,
    );
    if (passer) {
      add(passer, "passingAttempts");
      add(passer, "passingYards", passingYards);
      add(passer, "passingTouchdowns", one(row.pass_touchdown) ? 1 : 0);
    }
  }
  if (one(row.rush_attempt)) {
    if (!row.rusher_player_id)
      throw new Error(
        `Play-by-play ${row.game_id}: rush attempt missing rusher ID.`,
      );
    const yards =
      num(row.rushing_yards) ??
      requireNumber(
        row.yards_gained,
        `Play-by-play ${row.game_id} rushing yards`,
      );
    if (!scramble) {
      optionalFields.designedRushAttempts++;
      if (roster.get(row.rusher_player_id)?.position)
        optionalFields.positionMatchedDesignedRushes++;
    }
    add(stats, "carries");
    if (!scramble) add(stats, "designedCarries");
    const rusher = playerGame(
      row,
      row.rusher_player_id,
      row.rusher_player_name,
    );
    if (rusher) {
      add(rusher, "carries");
      add(rusher, "rushingYards", yards);
      add(rusher, "rushingTouchdowns", one(row.rush_touchdown) ? 1 : 0);
    }
    if (
      !scramble &&
      ["RB", "FB"].includes(roster.get(row.rusher_player_id)?.position) &&
      yards !== null
    ) {
      add(stats, "rbCarries");
      add(stats, "rbRushYards", yards);
      add(stats, "rbExplosiveRushes", yards >= 10 ? 1 : 0);
      add(stats, "rbStuffs", yards <= 0 ? 1 : 0);
      if (epa !== null) {
        add(stats, "rbRushEpa", epa);
        add(stats, "rbRushEpaPlays");
        add(stats, "rbRushSuccesses", success);
      }
    }
  }
  if (attempt && row.receiver_player_id) {
    const reception = one(row.complete_pass) ? 1 : 0;
    const yards = reception
      ? requireNumber(
          row.receiving_yards,
          `Play-by-play ${row.game_id} completed-target yards`,
        )
      : (num(row.receiving_yards) ?? 0);
    add(stats, "targets");
    targets++;
    const receiver = playerGame(
      row,
      row.receiver_player_id,
      row.receiver_player_name,
    );
    if (receiver) {
      add(receiver, "targets");
      add(receiver, "receivingYards", yards);
      add(receiver, "receptions", reception);
      add(receiver, "receivingTouchdowns", one(row.pass_touchdown) ? 1 : 0);
    }
    const position = roster.get(row.receiver_player_id)?.position;
    if (position) positionMatchedTargets++;
    else unknownReceiverIds.add(row.receiver_player_id);
    const prefix = ["RB", "FB"].includes(position)
      ? "rb"
      : position === "WR"
        ? "wr"
        : position === "TE"
          ? "te"
          : null;
    const yac = num(row.yards_after_catch);
    if (reception) {
      optionalFields.completedTargets++;
      if (yac !== null) optionalFields.completedTargetsWithYac++;
    }
    if (prefix) {
      add(stats, `${prefix}Targets`);
      add(stats, `${prefix}ReceivingYards`, yards);
      add(stats, `${prefix}Receptions`, reception);
      if (reception && yac !== null) {
        add(stats, `${prefix}Yac`, yac);
        add(stats, `${prefix}YacReceptions`);
      }
    }
    const air = num(row.air_yards);
    if (air !== null) {
      optionalFields.targetsWithAirYards++;
      const depth = air < 10 ? "short" : air < 20 ? "intermediate" : "deep";
      add(stats, "depthTargets");
      add(stats, `${depth}Targets`);
      add(stats, `${depth}ReceivingYards`, yards);
    }
  }
}
const completed = games.filter((game) => eligibleIds.has(game.id));
const roundStats = (row) => ({
  ...row,
  stats: Object.fromEntries(
    Object.entries(row.stats).map(([key, value]) => [
      key,
      Number(value.toFixed(6)),
    ]),
  ),
});
const snapshot = {
  schemaVersion: 1,
  meta: {
    season,
    generatedAt: new Date().toISOString(),
    observedAt,
    asOf: observedAt,
    latestGameDate: scheduleRows.find(
      (row) => row.game_id === completed.at(-1).id,
    ).gameday,
    completedGames: completed.length,
    latestWeek: Math.max(...completed.map((game) => game.week)),
    modelVersion: "observed-profile-v1",
    coverage: {
      targets,
      positionMatchedTargets,
      targetPositionJoinRate: targets ? positionMatchedTargets / targets : 0,
      unknownReceiverIds: [...unknownReceiverIds],
      optionalFields,
    },
    sources: downloaded.map((result) => result.source),
    notes: [
      "Only regular-season games with an END GAME marker in the downloaded play-by-play contribute statistics. Partial games are excluded.",
      "Profile cutoffs require kickoff and a conservative completion proxy strictly before the requested time, capped at snapshot observation time. Completion proxy is the latest recorded wall-clock event plus 15 minutes, or kickoff plus six hours if timestamps are absent. Historical profiles use revised data, not archived provider vintages.",
      "Ratios use summed numerators and denominators. Percentiles rank the available league. No fitted opponent adjustment, player forecast, coverage assignment or route participation is claimed.",
      "Eligible plays are run/pass plays marked as rush attempts or dropbacks, excluding kneels, spikes, two-point attempts, deleted plays and no-play penalties. Player totals follow these analytical masks and may differ from official box scores.",
      "Position splits join GSIS player IDs to the latest row in the downloaded season roster. FB is grouped with RB; unmatched receivers are excluded from position splits and reported in coverage.",
      "Depth uses recorded air yards: short <10, intermediate 10–19, deep ≥20. Target depth does not measure slot/outside alignment.",
      "Roster/headshot information reflects the downloaded season roster, not historical availability or injury status. Player cards show observed usage, not projected participation.",
      "League averages are opportunity-weighted pooled rates; percentile ranks weight each eligible team equally. Last-four uses each team’s four most recent eligible completed games.",
      "Required source columns, identities, final scores and completed-play yardage are validated before replacing the snapshot. Missing optional EPA/xpass/air-yard/YAC observations are excluded from their metric denominator; availability counts are retained in metadata.",
    ],
  },
  teams,
  games,
  teamGames: [...teamGameMap.values()].map(roundStats),
  players: [...playerMap.values()],
  playerGames: [...playerGameMap.values()].map(roundStats),
};
for (const game of completed)
  if (snapshot.teamGames.filter((row) => row.gameId === game.id).length !== 2)
    throw new Error(`Missing team-game data for ${game.id}`);
if (targets && snapshot.meta.coverage.targetPositionJoinRate < 0.98)
  throw new Error(
    "Target position join coverage below 98%; existing snapshot preserved.",
  );
const output = fileURLToPath(
  new URL("../public/data/snapshot.json", import.meta.url),
);
await mkdir(fileURLToPath(new URL("../public/data/", import.meta.url)), {
  recursive: true,
});
const pendingOutput = `${output}.pending`;
await writeFile(pendingOutput, `${JSON.stringify(snapshot)}\n`);
await rename(pendingOutput, output);
console.log(
  `Saved ${season} snapshot: ${completed.length} complete games, ${teams.length} teams, ${snapshot.players.length} players, ${targets} targets (${(snapshot.meta.coverage.targetPositionJoinRate * 100).toFixed(2)}% position joins), ${(Buffer.byteLength(JSON.stringify(snapshot)) / 1024).toFixed(0)} KiB.`,
);
