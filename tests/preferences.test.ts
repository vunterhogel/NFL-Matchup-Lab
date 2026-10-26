import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePreferences,
  readPreferences,
} from "../src/state/preferences";

const teams = [
  { id: "DAL", abbreviation: "DAL" },
  { id: "PHI", abbreviation: "PHI" },
  { id: "LA", abbreviation: "LAR" },
  { id: "WAS", abbreviation: "WSH" },
];
const games = [{ id: "historical-game" }];
const stored = JSON.stringify({
  offenseId: "LA",
  defenseId: "WAS",
  window: "last4",
  page: "rankings",
  gameId: "historical-game",
});

test("legacy preferences work without a query while corrupt storage is safely ignored", () => {
  assert.deepEqual(readPreferences(null, ""), {
    offenseId: "DAL",
    defenseId: "PHI",
    window: "season",
    page: "matchup",
    gameId: "",
  });
  assert.equal(readPreferences(stored, "").gameId, "historical-game");
  assert.equal(readPreferences(stored, "").page, "rankings");
  for (const corrupt of [
    "{",
    "null",
    "[]",
    "12",
    '{"offenseId":9,"page":"unknown","window":true}',
  ]) {
    assert.deepEqual(readPreferences(corrupt, ""), readPreferences(null, ""));
  }
  assert.deepEqual(
    readPreferences(
      JSON.stringify({
        offenseId: "LA",
        defenseId: "WAS",
        window: "last4",
        page: "teams",
      }),
      "",
    ),
    {
      offenseId: "LA",
      defenseId: "WAS",
      window: "last4",
      page: "teams",
      gameId: "",
    },
  );
});

test("a shared latest comparison cannot inherit the recipient’s stored historical cutoff or page", () => {
  const result = readPreferences(
    stored,
    "?offense=DAL&defense=PHI&window=season",
  );
  assert.deepEqual(result, {
    offenseId: "DAL",
    defenseId: "PHI",
    window: "season",
    page: "matchup",
    gameId: "",
  });
  assert.equal(readPreferences(stored, "?offense=DAL&game=").gameId, "");
  assert.equal(readPreferences(stored, "?window=last4").gameId, "");
});

test("historical links retain their cutoff and an explicit valid URL page takes precedence", () => {
  const result = readPreferences(
    stored,
    "?offense=PHI&defense=DAL&window=last4&game=historical-game&page=teams",
  );
  assert.deepEqual(result, {
    offenseId: "PHI",
    defenseId: "DAL",
    window: "last4",
    page: "teams",
    gameId: "historical-game",
  });
  assert.equal(
    readPreferences(stored, "?offense=PHI&page=invalid").page,
    "matchup",
  );
  assert.equal(
    readPreferences(stored, "?page=methodology").page,
    "methodology",
  );
});

test("normalization resolves stable IDs and display abbreviations without allowing self-matchups", () => {
  const aliases = normalizePreferences(
    readPreferences(null, "?offense=lar&defense=wsh"),
    teams,
    games,
  );
  assert.equal(aliases.offenseId, "LA");
  assert.equal(aliases.defenseId, "WAS");
  const self = normalizePreferences(
    readPreferences(null, "?offense=PHI&defense=PHI"),
    teams,
    games,
  );
  assert.equal(self.offenseId, "PHI");
  assert.equal(self.defenseId, "DAL");
  const invalid = normalizePreferences(
    readPreferences(null, "?offense=unknown&defense=DAL"),
    teams,
    games,
  );
  assert.equal(invalid.offenseId, "DAL");
  assert.equal(invalid.defenseId, "PHI");
});

test("normalization removes unknown games, retains valid global cutoffs and leaves inputs untouched", () => {
  const input = readPreferences(stored, "");
  const original = { ...input };
  assert.equal(
    normalizePreferences(input, teams, games).gameId,
    "historical-game",
  );
  assert.equal(normalizePreferences(input, teams, []).gameId, "");
  assert.deepEqual(input, original);
  const otherTeams = [
    { id: "SEA", abbreviation: "SEA" },
    { id: "SF", abbreviation: "SF" },
  ];
  const normalized = normalizePreferences(input, otherTeams, []);
  assert.equal(normalized.offenseId, "SEA");
  assert.equal(normalized.defenseId, "SF");
  assert.throws(
    () => normalizePreferences(input, [teams[0]], []),
    /at least two distinct teams/,
  );
});
