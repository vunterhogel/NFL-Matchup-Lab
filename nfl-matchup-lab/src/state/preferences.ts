export type PreferencePage = "matchup" | "rankings" | "teams" | "methodology";

export interface Preferences {
  offenseId: string;
  defenseId: string;
  window: "season" | "last4";
  page: PreferencePage;
  gameId: string;
}

const DEFAULTS: Preferences = {
  offenseId: "DAL",
  defenseId: "PHI",
  window: "season",
  page: "matchup",
  gameId: "",
};
const PAGES = new Set<PreferencePage>([
  "matchup",
  "rankings",
  "teams",
  "methodology",
]);
const nonempty = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const page = (value: unknown): PreferencePage | null =>
  typeof value === "string" && PAGES.has(value as PreferencePage)
    ? (value as PreferencePage)
    : null;

/** URL comparisons own their cutoff; an absent URL game never inherits another viewer's history. */
export function readPreferences(
  storageValue: string | null,
  search: string,
): Preferences {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = storageValue ? JSON.parse(storageValue) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      stored = parsed as Record<string, unknown>;
  } catch {
    /* Corrupt or older preferences must not block opening a comparison. */
  }

  const params = new URLSearchParams(search);
  const comparison = ["offense", "defense", "window", "game"].some((key) =>
    params.has(key),
  );
  return {
    offenseId:
      nonempty(params.get("offense")) ??
      nonempty(stored.offenseId) ??
      DEFAULTS.offenseId,
    defenseId:
      nonempty(params.get("defense")) ??
      nonempty(stored.defenseId) ??
      DEFAULTS.defenseId,
    window: params.has("window")
      ? params.get("window") === "last4"
        ? "last4"
        : "season"
      : stored.window === "last4"
        ? "last4"
        : "season",
    page:
      page(params.get("page")) ??
      (comparison ? "matchup" : (page(stored.page) ?? DEFAULTS.page)),
    gameId: params.has("game")
      ? (nonempty(params.get("game")) ?? "")
      : comparison
        ? ""
        : (nonempty(stored.gameId) ?? ""),
  };
}

/** Resolve display abbreviations to stable IDs and guarantee two distinct, known clubs. */
export function normalizePreferences(
  state: Preferences,
  teams: readonly { id: string; abbreviation: string }[],
  games: readonly { id: string }[],
): Preferences {
  if (new Set(teams.map((team) => team.id)).size < 2)
    throw new Error("A comparison requires at least two distinct teams.");
  const resolve = (value: string) => {
    const key = value.trim().toUpperCase();
    return teams.find(
      (team) =>
        team.id.toUpperCase() === key ||
        team.abbreviation.toUpperCase() === key,
    )?.id;
  };
  const offenseId =
    resolve(state.offenseId) ?? resolve(DEFAULTS.offenseId) ?? teams[0].id;
  const requestedDefense = resolve(state.defenseId);
  const defaultDefense = resolve(DEFAULTS.defenseId);
  const defenseId =
    requestedDefense && requestedDefense !== offenseId
      ? requestedDefense
      : defaultDefense && defaultDefense !== offenseId
        ? defaultDefense
        : teams.find((team) => team.id !== offenseId)!.id;
  return {
    ...state,
    offenseId,
    defenseId,
    gameId: games.some((game) => game.id === state.gameId) ? state.gameId : "",
  };
}
