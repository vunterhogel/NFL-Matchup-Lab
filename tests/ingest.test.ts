import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBinaryFields,
  assertColumns,
  defaultSeason,
  optionalNumber,
  requireNumber,
  validateSchedule,
} from "../scripts/ingest-validation.mjs";

const fixtureSchedule = () => ({
  game_id: "2026_01_AAA_BBB",
  season: "2026",
  game_type: "REG",
  week: "1",
  gameday: "2026-09-13",
  gametime: "13:00",
  home_team: "BBB",
  away_team: "AAA",
  home_score: "24",
  away_score: "17",
});
const knownTeams = new Set(["AAA", "BBB"]);

test("default season follows the regular-season year through the offseason", () => {
  assert.equal(defaultSeason(new Date("2027-01-01T00:00:00Z")), 2026);
  assert.equal(defaultSeason(new Date("2027-08-31T23:59:59Z")), 2026);
  assert.equal(defaultSeason(new Date("2027-09-01T00:00:00Z")), 2027);
  assert.equal(defaultSeason(new Date("2026-10-25T00:00:00Z")), 2026);
  assert.throws(() => defaultSeason(new Date("invalid")), /valid clock date/);
});

test("source schema changes and empty responses fail instead of becoming zero-valued data", () => {
  assert.throws(() => assertColumns([], ["game_id"], "fixture"), /no rows/);
  assert.throws(
    () => assertColumns([{ game_id: "1" }], ["game_id", "epa"], "fixture"),
    /missing required columns: epa/,
  );
  assert.doesNotThrow(() =>
    assertColumns([{ game_id: "1", epa: "" }], ["game_id", "epa"], "fixture"),
  );
  assert.equal(optionalNumber(""), null);
  assert.equal(optionalNumber(null), null);
  assert.equal(optionalNumber(undefined), null);
  assert.equal(optionalNumber("-0.25"), -0.25);
  assert.equal(requireNumber("0", "measured zero"), 0);
  assert.throws(() => optionalNumber("not-a-number"), /invalid numeric value/);
  assert.throws(() => optionalNumber("Infinity"), /invalid numeric value/);
  assert.throws(
    () => requireNumber("", "yards"),
    /required measurement is missing/,
  );
});

test("ambiguous binary play flags are rejected rather than interpreted as false", () => {
  assert.doesNotThrow(() =>
    assertBinaryFields({ game_id: "1", rush_attempt: "1", qb_dropback: "0" }, [
      "rush_attempt",
      "qb_dropback",
    ]),
  );
  assert.throws(
    () =>
      assertBinaryFields({ game_id: "1", rush_attempt: "" }, ["rush_attempt"]),
    /must be 0 or 1/,
  );
  assert.throws(
    () =>
      assertBinaryFields({ game_id: "1", rush_attempt: "2" }, ["rush_attempt"]),
    /must be 0 or 1/,
  );
});

test("schedule identity, kickoff and score guards reject inputs that would corrupt historical selection", () => {
  const base = fixtureSchedule();
  assert.equal(validateSchedule([base], 2026, knownTeams).length, 1);
  assert.throws(
    () => validateSchedule([base, { ...base }], 2026, knownTeams),
    /duplicate or inconsistent game identity/,
  );
  assert.throws(
    () =>
      validateSchedule([{ ...base, game_id: "wrong-id" }], 2026, knownTeams),
    /inconsistent game identity/,
  );
  assert.throws(
    () => validateSchedule([{ ...base, gametime: "" }], 2026, knownTeams),
    /kickoff time missing or invalid/,
  );
  assert.throws(
    () => validateSchedule([{ ...base, gametime: "25:30" }], 2026, knownTeams),
    /kickoff time missing or invalid/,
  );
  assert.throws(
    () =>
      validateSchedule([{ ...base, gameday: "2026-02-30" }], 2026, knownTeams),
    /invalid game date/,
  );
  assert.throws(
    () => validateSchedule([{ ...base, home_score: "" }], 2026, knownTeams),
    /scores must both be missing/,
  );
  assert.throws(
    () => validateSchedule([{ ...base, home_score: "24.5" }], 2026, knownTeams),
    /nonnegative whole numbers/,
  );
  assert.throws(
    () => validateSchedule([{ ...base, home_score: "-1" }], 2026, knownTeams),
    /nonnegative whole numbers/,
  );
  assert.doesNotThrow(() =>
    validateSchedule(
      [{ ...base, home_score: "", away_score: "" }],
      2026,
      knownTeams,
    ),
  );
  const aliasSelf = {
    ...base,
    game_id: "2026_01_LAR_LA",
    home_team: "LA",
    away_team: "LAR",
  };
  assert.throws(
    () =>
      validateSchedule([aliasSelf], 2026, new Set(["LA"]), (id: string) =>
        id === "LAR" ? "LA" : id,
      ),
    /invalid home\/away team identity/,
  );
});
