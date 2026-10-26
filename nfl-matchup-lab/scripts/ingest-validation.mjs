/** Pure guards shared by the refresh job and ingest-contract tests. */
export const REQUIRED_PBP_COLUMNS = [
  "game_id",
  "season_type",
  "desc",
  "play_type",
  "posteam",
  "defteam",
  "qb_dropback",
  "qb_kneel",
  "qb_spike",
  "qb_scramble",
  "rush_attempt",
  "pass_attempt",
  "sack",
  "two_point_attempt",
  "play_deleted",
  "qtr",
  "score_differential",
  "epa",
  "xpass",
  "passing_yards",
  "complete_pass",
  "interception",
  "pass_touchdown",
  "rush_touchdown",
  "passer_player_id",
  "passer_player_name",
  "rusher_player_id",
  "rusher_player_name",
  "receiver_player_id",
  "receiver_player_name",
  "rushing_yards",
  "yards_gained",
  "receiving_yards",
  "air_yards",
  "yards_after_catch",
];
export const REQUIRED_ROSTER_COLUMNS = [
  "gsis_id",
  "position",
  "full_name",
  "team",
  "week",
];
export const REQUIRED_SCHEDULE_COLUMNS = [
  "game_id",
  "season",
  "game_type",
  "week",
  "gameday",
  "gametime",
  "home_team",
  "away_team",
  "home_score",
  "away_score",
];

/** Before September, the latest regular season belongs to the previous calendar year. */
export function defaultSeason(date = new Date()) {
  if (!Number.isFinite(date.getTime()))
    throw new Error("A valid clock date is required.");
  return date.getUTCFullYear() - (date.getUTCMonth() < 8 ? 1 : 0);
}

export function assertColumns(rows, required, source) {
  if (!rows.length)
    throw new Error(
      `${source}: no rows were returned; existing snapshot preserved.`,
    );
  const missing = required.filter((key) => !Object.hasOwn(rows[0], key));
  if (missing.length)
    throw new Error(
      `${source}: missing required columns: ${missing.join(", ")}. Existing snapshot preserved.`,
    );
}

export function optionalNumber(value, label = "Numeric source field") {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error(
      `${label}: invalid numeric value ${JSON.stringify(value)}.`,
    );
  return number;
}

export function validateSchedule(
  rows,
  season,
  knownTeams,
  canonical = (value) => value,
) {
  assertColumns(rows, REQUIRED_SCHEDULE_COLUMNS, "nflverse schedule");
  const selected = rows.filter(
    (row) => Number(row.season) === season && row.game_type === "REG",
  );
  if (!selected.length)
    throw new Error(`No regular-season schedule found for ${season}.`);
  const seen = new Set();
  for (const row of selected) {
    const context = `Schedule ${row.game_id || "(missing game ID)"}`;
    const week = Number(row.week);
    if (!Number.isInteger(week) || week < 1 || week > 18)
      throw new Error(`${context}: invalid regular-season week.`);
    const expectedId = `${season}_${String(week).padStart(2, "0")}_${row.away_team}_${row.home_team}`;
    if (row.game_id !== expectedId || seen.has(row.game_id))
      throw new Error(`${context}: duplicate or inconsistent game identity.`);
    seen.add(row.game_id);
    if (
      !knownTeams.has(canonical(row.home_team)) ||
      !knownTeams.has(canonical(row.away_team)) ||
      canonical(row.home_team) === canonical(row.away_team)
    )
      throw new Error(`${context}: invalid home/away team identity.`);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(row.gameday)
      ? Date.parse(`${row.gameday}T00:00:00Z`)
      : NaN;
    if (
      !Number.isFinite(day) ||
      new Date(day).toISOString().slice(0, 10) !== row.gameday
    )
      throw new Error(`${context}: invalid game date.`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.gametime))
      throw new Error(
        `${context}: kickoff time missing or invalid; no assumed kickoff is permitted.`,
      );
    const home = optionalNumber(row.home_score, `${context} home score`),
      away = optionalNumber(row.away_score, `${context} away score`);
    if (
      (home === null) !== (away === null) ||
      [home, away].some(
        (value) => value !== null && (!Number.isInteger(value) || value < 0),
      )
    )
      throw new Error(
        `${context}: scores must both be missing or nonnegative whole numbers.`,
      );
  }
  return selected;
}

export function assertBinaryFields(row, fields) {
  for (const key of fields)
    if (row[key] !== "0" && row[key] !== "1")
      throw new Error(
        `Play-by-play ${row.game_id}: ${key} must be 0 or 1; received ${JSON.stringify(row[key])}.`,
      );
}

export function requireNumber(value, label) {
  const number = optionalNumber(value, label);
  if (number === null)
    throw new Error(`${label}: required measurement is missing.`);
  return number;
}
