import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  ExternalLink,
  Filter,
  Grid2X2,
  Info,
  Layers3,
  Menu,
  Radar,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Target,
  Users,
  X,
} from "lucide-react";
import {
  ComparisonChart,
  PercentileBar,
  TrendChart,
} from "./components/Charts";
import { METRICS, evaluateMetric } from "./data/metrics";
import { getMatchup, getPlayers, getProfile } from "./data/selectors";
import { normalizePreferences, readPreferences } from "./state/preferences";
import type { Preferences } from "./state/preferences";
import type {
  Game,
  MatchupEvidence,
  MetricResult,
  PlayerSummary,
  ProfileOptions,
  Side,
  Snapshot,
  Team,
  TeamProfile,
} from "./data/types";

type Page = "matchup" | "rankings" | "teams" | "methodology";
type PositionFilter = "ALL" | "QB" | "RB" | "WR" | "TE" | "DEPTH";
type SavedState = Preferences;
const NAV = [
  { id: "matchup" as const, label: "Matchup explorer", icon: Radar },
  { id: "rankings" as const, label: "League rankings", icon: BarChart3 },
  { id: "teams" as const, label: "Team profiles", icon: Shield },
  { id: "methodology" as const, label: "The methodology", icon: BookOpen },
];
const DOMAINS = [
  {
    key: "qbEpa",
    label: "QB passing",
    short: "QB",
    detail: "EPA / dropback",
    icon: Target,
  },
  {
    key: "rbYardsPerCarry",
    label: "RB rushing",
    short: "RB",
    detail: "Yards / carry",
    icon: Activity,
  },
  {
    key: "rbYardsPerTarget",
    label: "RB receiving",
    short: "RB",
    detail: "Yards / target",
    icon: Users,
  },
  {
    key: "wrYardsPerTarget",
    label: "WR receiving",
    short: "WR",
    detail: "Yards / target",
    icon: ArrowUpRight,
  },
  {
    key: "teYardsPerTarget",
    label: "TE receiving",
    short: "TE",
    detail: "Yards / target",
    icon: Grid2X2,
  },
  {
    key: "deepYardsPerTarget",
    label: "Deep passing",
    short: "20+",
    detail: "Yards / deep target",
    icon: Radar,
  },
];
const tendencyKeys = new Set([
  "playsPerGame",
  "neutralPassRate",
  "passRateOverExpected",
  "rbTargetShare",
  "wrTargetShare",
  "teTargetShare",
  "shortTargetShare",
  "intermediateTargetShare",
  "deepTargetShare",
]);
const RANKING_KEYS = [
  "epaPlay",
  "qbEpa",
  "rbYardsPerCarry",
  "rbYardsPerTarget",
  "wrYardsPerTarget",
  "teYardsPerTarget",
  "sackRate",
];

function readSaved(): SavedState {
  let storage: string | null = null;
  try {
    storage = localStorage.getItem("matchup-lab.preferences.v1");
  } catch {
    /* URL state remains usable without storage. */
  }
  return readPreferences(storage, window.location.search);
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function formatMetric(
  metric: Pick<MetricResult, "value" | "unit"> | undefined,
): string {
  if (!metric || metric.value === null || !Number.isFinite(metric.value))
    return "—";
  const n = metric.value;
  return metric.unit === "epa"
    ? `${n > 0 ? "+" : ""}${n.toFixed(3)}`
    : metric.unit === "percent"
      ? `${n.toFixed(1)}%`
      : n.toFixed(1);
}
function dateLabel(iso: string, options?: Intl.DateTimeFormatOptions) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00`)
    : new Date(iso);
  return Number.isNaN(d.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat(
        "en-US",
        options || { month: "short", day: "numeric", year: "numeric" },
      ).format(d);
}
function recordLabel(profile: TeamProfile) {
  const r = profile.record;
  return `${r.wins}–${r.losses}${r.ties ? `–${r.ties}` : ""}`;
}
function teamStyle(team: Team): CSSProperties {
  return {
    "--team-color": team.color.startsWith("#") ? team.color : `#${team.color}`,
  } as CSSProperties;
}
function metricOf(profile: TeamProfile, key: string, side: Side = "offense") {
  return profile[side].find((m) => m.key === key);
}
function reliabilityLabel(reliability: string) {
  return reliability === "high"
    ? "Established sample"
    : reliability === "moderate"
      ? "Building sample"
      : "Small sample";
}

function TeamLogo({
  team,
  className = "",
}: {
  team: Team;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [team.logo]);
  return (
    <span className={`team-logo ${className}`} style={teamStyle(team)}>
      {failed ? (
        <span>{team.abbreviation}</span>
      ) : (
        <img
          src={team.logo}
          alt={`${team.name} logo`}
          onError={() => setFailed(true)}
          loading="lazy"
        />
      )}
    </span>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      panel.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, select, a[href], [tabindex="0"]',
      );
    focusable()?.[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const els = focusable();
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">MATCHUP LAB / FIELD NOTES</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TeamPicker({
  team,
  teams,
  onChange,
  label,
}: {
  team: Team;
  teams: Team[];
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="team-picker">
      <label>
        <span className="sr-only">{label}</span>
        <select
          aria-label={label}
          value={team.id}
          onChange={(e) => onChange(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <ChevronDown size={17} aria-hidden="true" />
    </div>
  );
}

function Signal({
  direction,
  small = false,
}: {
  direction: MatchupEvidence["direction"];
  small?: boolean;
}) {
  const label = {
    favorable: "Favorable",
    difficult: "Challenging",
    balanced: "Balanced",
    unavailable: "Not enough data",
  }[direction];
  const Icon =
    direction === "favorable"
      ? ArrowUpRight
      : direction === "difficult"
        ? ArrowDownLeft
        : ArrowLeftRight;
  return (
    <span
      className={`signal signal-${direction} ${small ? "signal-small" : ""}`}
    >
      <Icon size={small ? 12 : 14} />
      {label}
    </span>
  );
}

function EvidenceModal({
  evidence: e,
  offense,
  defense,
  onClose,
}: {
  evidence: MatchupEvidence;
  offense: Team;
  defense: Team;
  onClose: () => void;
}) {
  return (
    <Modal
      title={e.label}
      subtitle={`${offense.name} offense · ${defense.name} defense`}
      onClose={onClose}
    >
      <div className="evidence-intro">
        <Signal direction={e.direction} />
        <span className={`reliability reliability-${e.reliability}`}>
          <i />
          {reliabilityLabel(e.reliability)}
        </span>
      </div>
      <p className="evidence-explanation">{e.explanation}</p>
      <div className="evidence-numbers">
        {[
          { team: offense, m: e.offense, label: "Offensive production" },
          { team: defense, m: e.defense, label: "Defensive allowance" },
        ].map(({ team, m, label }) => (
          <div key={team.id}>
            <TeamLogo team={team} />
            <span className="eyebrow">{label}</span>
            <strong>{formatMetric(m)}</strong>
            <span>
              {m.rank ? `Rank ${m.rank} of ${m.rankedTeams}` : "Unranked"} ·{" "}
              {Math.round(m.sample).toLocaleString()} opportunities
            </span>
            <PercentileBar
              value={m.percentile}
              tone={team.color}
              label={`${team.abbreviation} strength`}
            />
          </div>
        ))}
      </div>
      <div className="note-box">
        <Info size={17} />
        <div>
          <strong>What this measures</strong>
          <p>{e.offense.description}</p>
          <p>
            Defensive percentiles are reversed: a higher percentile indicates
            stronger prevention. League baseline:{" "}
            {formatMetric({
              value: e.offense.leagueAverage,
              unit: e.offense.unit,
            })}
            .
          </p>
        </div>
      </div>
      <div className="evidence-method">
        <span className="eyebrow">V1 INTERPRETATION</span>
        <p>
          The matchup label compares observed offensive performance with
          defensive allowances. It is a descriptive research signal, not a
          fitted production lift or a probability. Opponent quality, personnel
          and game state can influence these results.
        </p>
      </div>
    </Modal>
  );
}

function Skeleton() {
  return (
    <div className="boot-screen">
      <div className="boot-mark">
        M<span>↗</span>
      </div>
      <span className="eyebrow">NFL MATCHUP LAB</span>
      <h1>Preparing the research desk.</h1>
      <div className="loading-line" />
      <p>Loading the bundled league snapshot</p>
    </div>
  );
}

export default function App() {
  const [saved] = useState(readSaved);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState<Page>(saved.page);
  const [offenseId, setOffenseId] = useState(saved.offenseId);
  const [defenseId, setDefenseId] = useState(saved.defenseId);
  const [windowMode, setWindowMode] = useState<"season" | "last4">(
    saved.window,
  );
  const [selectedGame, setSelectedGame] = useState(saved.gameId);
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [slateOpen, setSlateOpen] = useState(false);
  const [slateWeek, setSlateWeek] = useState(7);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const [toast, setToast] = useState("");
  const [activeEvidence, setActiveEvidence] = useState<MatchupEvidence | null>(
    null,
  );
  const [rankSide, setRankSide] = useState<Side>("offense");
  const [rankSort, setRankSort] = useState("epaPlay");
  const [rankAscending, setRankAscending] = useState(false);
  const [rankSearch, setRankSearch] = useState("");
  const [conference, setConference] = useState("ALL");
  const [teamSide, setTeamSide] = useState<Side>("offense");
  const [trendMetric, setTrendMetric] = useState("epaPlay");
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (reload = false) => {
    setRefreshing(true);
    setError("");
    try {
      const r = await fetch(
        `${import.meta.env.BASE_URL}data/snapshot.json${reload ? `?t=${Date.now()}` : ""}`,
        { cache: reload ? "reload" : "default" },
      );
      if (!r.ok) throw new Error(`Snapshot request returned ${r.status}`);
      const s = (await r.json()) as Snapshot;
      if (
        s.schemaVersion !== 1 ||
        !Array.isArray(s.teams) ||
        s.teams.length < 2 ||
        !s.teamGames ||
        !s.meta?.asOf
      )
        throw new Error(
          "The snapshot format is not supported. Run npm run data:refresh.",
        );
      setSnapshot(s);
      setSlateWeek(s.meta.latestWeek);
      if (reload)
        setToast(
          "Bundled snapshot reloaded. Refresh upstream data with npm run data:refresh.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load the snapshot.");
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setIsMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 5500);
    return () => window.clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "matchup-lab.preferences.v1",
        JSON.stringify({
          offenseId,
          defenseId,
          window: windowMode,
          page,
          gameId: selectedGame,
        }),
      );
    } catch {
      /* Preferences are optional. */
    }
  }, [offenseId, defenseId, windowMode, page, selectedGame]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const normalized = normalizePreferences(
      { offenseId, defenseId, gameId: selectedGame, window: windowMode, page },
      snapshot.teams,
      snapshot.games,
    );
    if (normalized.offenseId !== offenseId) setOffenseId(normalized.offenseId);
    if (normalized.defenseId !== defenseId) setDefenseId(normalized.defenseId);
    if (normalized.gameId !== selectedGame) setSelectedGame(normalized.gameId);
  }, [snapshot, offenseId, defenseId, selectedGame, windowMode, page]);

  const teams = useMemo(
    () =>
      [...(snapshot?.teams || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot],
  );
  const offense =
    teams.find((t) => t.id === offenseId) ||
    teams.find((t) => t.abbreviation === "DAL") ||
    teams[0];
  const defense =
    teams.find((t) => t.id === defenseId) ||
    teams.find((t) => t.abbreviation === "PHI") ||
    teams[1];
  const game = snapshot?.games.find((g) => g.id === selectedGame);
  const options: ProfileOptions = useMemo(
    () => ({ window: windowMode, ...(game ? { before: game.kickoff } : {}) }),
    [windowMode, game],
  );
  const matchup = useMemo(
    () =>
      snapshot && offense && defense
        ? getMatchup(snapshot, offense.id, defense.id, options)
        : null,
    [snapshot, offense, defense, options],
  );
  const playerRows = useMemo(
    () =>
      snapshot && offense ? getPlayers(snapshot, offense.id, options) : [],
    [snapshot, offense, options],
  );
  const profiles = useMemo(
    () =>
      snapshot
        ? new Map(
            snapshot.teams.map((t) => [
              t.id,
              getProfile(snapshot, t.id, options),
            ]),
          )
        : new Map<string, TeamProfile>(),
    [snapshot, options],
  );
  const domains = useMemo(
    () =>
      DOMAINS.map((d) => ({
        ...d,
        evidence: matchup?.evidence.find((e) => e.key === d.key),
      })),
    [matchup],
  );
  const evidenceRows = useMemo(
    () =>
      (matchup?.evidence || []).filter(
        (e) =>
          (position === "ALL" || e.group === position) &&
          !tendencyKeys.has(e.key),
      ),
    [matchup, position],
  );
  const strongest = useMemo(
    () =>
      domains
        .filter(
          (d) =>
            d.evidence &&
            d.evidence.signal !== null &&
            d.evidence.reliability !== "low",
        )
        .sort(
          (a, b) => (b.evidence?.signal || 0) - (a.evidence?.signal || 0),
        )[0],
    [domains],
  );
  const cutoffIsPast = game
    ? Date.parse(game.kickoff) < Date.parse(snapshot?.meta.asOf || "")
    : false;
  const matchingGames = useMemo(
    () =>
      snapshot?.games.filter(
        (g) =>
          (g.homeTeam === offense?.id && g.awayTeam === defense?.id) ||
          (g.awayTeam === offense?.id && g.homeTeam === defense?.id),
      ) || [],
    [snapshot, offense, defense],
  );
  const trend = useMemo(() => {
    if (!snapshot || !offense) return [];
    const def = METRICS.find((m) => m.key === trendMetric)!;
    const profile = profiles.get(offense.id);
    return snapshot.teamGames
      .filter(
        (tg) =>
          tg.teamId === offense.id && profile?.gameIds.includes(tg.gameId),
      )
      .map((tg) => {
        const gm = snapshot.games.find((g) => g.id === tg.gameId)!;
        const stats =
          teamSide === "offense"
            ? tg.stats
            : snapshot.teamGames.find(
                (t) => t.gameId === tg.gameId && t.teamId === tg.opponentId,
              )?.stats || {};
        return {
          label: `W${gm.week} ${tg.opponentId}`,
          value: evaluateMetric(def, { ...stats, games: 1 }),
          kickoff: gm.kickoff,
        };
      })
      .filter(
        (p): p is { label: string; value: number; kickoff: string } =>
          p.value !== null,
      )
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  }, [snapshot, offense, profiles, teamSide, trendMetric]);

  function navigate(next: Page) {
    setPage(next);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function chooseOffense(id: string) {
    if (id === defense?.id) setDefenseId(offense.id);
    setOffenseId(id);
    setSelectedGame("");
  }
  function inspectTeam(id: string, side: Side = "offense") {
    if (id === defense.id) setDefenseId(offense.id);
    setOffenseId(id);
    setTeamSide(side);
    navigate("teams");
  }
  function chooseDefense(id: string) {
    if (id === offense?.id) setOffenseId(defense.id);
    setDefenseId(id);
    setSelectedGame("");
  }
  function swap() {
    setOffenseId(defense.id);
    setDefenseId(offense.id);
  }
  function chooseGame(g: Game) {
    setOffenseId(g.awayTeam);
    setDefenseId(g.homeTeam);
    setSelectedGame(g.id);
    setPage("matchup");
    setSlateOpen(false);
  }
  function exportReport() {
    if (!snapshot || !matchup) return;
    const report =
      page === "teams"
        ? {
            team: offense,
            profile: profiles.get(offense.id),
            displayedSide: teamSide,
            players: playerRows,
          }
        : page === "methodology"
          ? {
              metricDefinitions: METRICS,
              sources: snapshot.meta.sources,
              notes: snapshot.meta.notes,
            }
          : { matchup, players: playerRows };
    download(
      `matchup-lab-${page}-${offense.abbreviation}.json`,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          sourceSnapshot: snapshot.meta,
          options,
          ...report,
          interpretation:
            "Observed descriptive profiles. Not a fitted projection or betting probability.",
        },
        null,
        2,
      ),
      "application/json",
    );
    setToast(
      "Research report exported with source metadata and sample counts.",
    );
  }
  async function share() {
    const u = new URL(window.location.href);
    u.search = new URLSearchParams({
      offense: offense.id,
      defense: defense.id,
      window: windowMode,
      page: "matchup",
      ...(selectedGame ? { game: selectedGame } : {}),
    }).toString();
    try {
      await navigator.clipboard.writeText(u.href);
      setCopied(true);
      setToast(
        "Comparison link copied. The recipient needs access to this app.",
      );
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setToast(
        "Clipboard unavailable. Export the report to share this comparison.",
      );
    }
  }
  function exportRankings() {
    const keys = ["Team", "Side", "Games", ...METRICS.map((m) => m.label)];
    const rows = teams.map((t) => {
      const p = profiles.get(t.id)!;
      return [
        t.name,
        rankSide,
        p.games,
        ...METRICS.map((m) => metricOf(p, m.key, rankSide)?.value ?? ""),
      ];
    });
    const csv = [keys, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    download("matchup-lab-league-rankings.csv", csv, "text/csv;charset=utf-8;");
    setToast("League measurements exported to CSV.");
  }

  if (!snapshot || !offense || !defense || !matchup)
    return error ? (
      <div className="boot-screen">
        <Database size={36} />
        <h1>The snapshot couldn’t load.</h1>
        <p>{error}</p>
        <button
          className="button button-primary"
          onClick={() => void load(true)}
        >
          Try again <RefreshCw size={16} />
        </button>
        <small>
          The bundled data file belongs in public/data/snapshot.json.
        </small>
      </div>
    ) : (
      <Skeleton />
    );
  const offProfile = matchup.offense,
    defProfile = matchup.defense;
  const rankingKeys = [
    rankSort,
    ...RANKING_KEYS.filter((k) => k !== rankSort),
  ].slice(0, 7);
  const sortedRankingTeams = teams
    .filter(
      (t) =>
        (conference === "ALL" || t.conference === conference) &&
        `${t.name} ${t.abbreviation}`
          .toLowerCase()
          .includes(rankSearch.toLowerCase()),
    )
    .sort((a, b) => {
      const av = metricOf(profiles.get(a.id)!, rankSort, rankSide)?.percentile,
        bv = metricOf(profiles.get(b.id)!, rankSort, rankSide)?.percentile;
      return av == null
        ? 1
        : bv == null
          ? -1
          : rankAscending
            ? av - bv
            : bv - av;
    });
  const teamProfile = profiles.get(offense.id)!;
  const teamMetrics = teamProfile[teamSide];
  const topMetrics = teamMetrics
    .filter(
      (m) =>
        !tendencyKeys.has(m.key) &&
        m.percentile !== null &&
        m.reliability !== "low",
    )
    .sort((a, b) => (b.percentile || 0) - (a.percentile || 0));
  const slateGames = snapshot.games
    .filter((g) => g.week === slateWeek)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const joinRate = snapshot.meta.coverage.targetPositionJoinRate;
  const joinPct = joinRate > 1 ? joinRate : joinRate * 100;

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}
        inert={isMobile && !mobileOpen}
        aria-hidden={isMobile && !mobileOpen ? true : undefined}
      >
        {isMobile && (
          <button
            className="mobile-nav-close icon-button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        )}
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("matchup");
          }}
          aria-label="Matchup Lab home"
        >
          <span className="brand-mark">
            M<span>↗</span>
          </span>
          <span>
            MATCHUP
            <span className="brand-lab">
              LAB<span className="brand-dot">●</span>
            </span>
          </span>
        </a>
        <div className="league-pill">
          <span className="league-shield">NFL</span>
          <span>National Football League</span>
          <ChevronDown size={13} />
        </div>
        <span className="nav-eyebrow">THE RESEARCH DESK</span>
        <nav aria-label="Main navigation">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(n.id)}
              className={`nav-item ${page === n.id ? "nav-active" : ""}`}
              aria-current={page === n.id ? "page" : undefined}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {page === n.id && <ChevronRight size={13} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <span className="nav-eyebrow">ON YOUR RADAR</span>
        <button
          className="radar-team"
          onClick={() => inspectTeam(offense.id, "offense")}
        >
          <TeamLogo team={offense} />
          <span>
            <strong>{offense.shortName}</strong>
            <small>Offensive profile</small>
          </span>
          <ArrowUpRight size={14} />
        </button>
        <button
          className="radar-team"
          onClick={() => inspectTeam(defense.id, "defense")}
        >
          <TeamLogo team={defense} />
          <span>
            <strong>{defense.shortName}</strong>
            <small>Defensive profile</small>
          </span>
          <ArrowUpRight size={14} />
        </button>
        <div className="sidebar-bottom">
          <div className="version-card">
            <div>
              <span className="status-dot" />
              THE BASELINE EDITION<span className="version-tag">V1</span>
            </div>
            <p>
              Football evidence.
              <br />A clearer point of view.
            </p>
            <button onClick={() => navigate("methodology")}>
              Inside the model <ArrowRight size={14} />
            </button>
          </div>
          <span className="sidebar-foot">
            BUILT FOR THE GAME WITHIN THE GAME.
          </span>
        </div>
      </aside>

      <div className="workspace" inert={isMobile && mobileOpen}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="topbar-breadcrumb">
              NFL RESEARCH <ChevronRight size={12} />{" "}
              <strong>{NAV.find((n) => n.id === page)?.label}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <button
              className="search-trigger"
              aria-label="Find a team"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={15} />
              <span>Find a team</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-season">
              {snapshot.meta.season}
              <span>REGULAR SEASON</span>
            </span>
            <span className="user-avatar">ML</span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow heading-eyebrow">
                <span className="tiny-line" />
                {page === "matchup"
                  ? "THE GAME WITHIN THE GAME"
                  : page === "rankings"
                    ? "ALL 32. ONE PERSPECTIVE."
                    : page === "teams"
                      ? "KNOW THE IDENTITY"
                      : "OPEN THE PLAYBOOK"}
              </div>
              <h1>
                {page === "matchup"
                  ? "Read the matchup."
                  : page === "rankings"
                    ? "The league, in context."
                    : page === "teams"
                      ? "Every team has a story."
                      : "Evidence before opinion."}
              </h1>
              <p>
                {page === "matchup"
                  ? "Find positional strengths. Explore defensive weaknesses. Follow the evidence."
                  : page === "rankings"
                    ? "Compare the measurements behind every offense and every defense."
                    : page === "teams"
                      ? "A complete view of the tendencies, strengths and opportunities."
                      : "A transparent baseline. Clear definitions. No black box."}
              </p>
            </div>
            <button
              className="button button-outline heading-export"
              onClick={page === "rankings" ? exportRankings : exportReport}
            >
              <ArrowDownToLine size={16} />
              {page === "rankings" ? "Export rankings" : "Export report"}
            </button>
          </div>

          <div className="data-strip">
            <div>
              <span className="status-dot" />
              <strong>Real NFL data</strong>
              <span className="strip-separator">/</span>
              <span>{snapshot.meta.completedGames} completed games</span>
              <span className="strip-separator">/</span>
              <span>
                Through{" "}
                {dateLabel(snapshot.meta.latestGameDate || snapshot.meta.asOf, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <button
              onClick={() => void load(true)}
              disabled={refreshing}
              title="Reload the bundled file. Upstream ingestion runs with npm run data:refresh."
            >
              <RefreshCw size={12} className={refreshing ? "spinning" : ""} />
              {refreshing ? "Reloading" : "Reload snapshot"}
            </button>
          </div>
          {error && (
            <div className="inline-error" role="alert">
              {error} The previously loaded snapshot is still shown.
            </div>
          )}
          {game && (
            <div className="cutoff-banner">
              <Clock3 size={14} />
              <span>
                <strong>
                  {cutoffIsPast
                    ? "Historical cutoff active"
                    : "Pregame early look"}
                </strong>{" "}
                · Before {game.awayTeam}@{game.homeTeam}, W{game.week},{" "}
                {dateLabel(game.kickoff)}. Samples are capped at the snapshot
                date.
              </span>
              <button onClick={() => setSelectedGame("")}>
                Return to latest <X size={12} />
              </button>
            </div>
          )}

          {page === "matchup" && (
            <div className="page-enter" key={`${offense.id}-${defense.id}`}>
              <section
                className="matchup-hero"
                aria-label="Select teams for comparison"
              >
                <div className="field-markings" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="hero-topline">
                  <span>
                    <span className="live-square" />
                    {game
                      ? `WEEK ${game.week} · ${cutoffIsPast ? "RECONSTRUCTED PREGAME" : "PREGAME EARLY LOOK"}`
                      : "CUSTOM MATCHUP · OBSERVED PROFILES"}
                  </span>
                  <button onClick={() => setSlateOpen(true)}>
                    <CalendarDays size={14} />
                    Browse the slate
                    <ArrowUpRight size={13} />
                  </button>
                </div>
                <div
                  className="hero-team hero-offense"
                  style={teamStyle(offense)}
                >
                  <span className="hero-role">01 / ON OFFENSE</span>
                  <div className="hero-team-name">
                    <div>
                      <span className="team-city">
                        {offense.name.replace(offense.shortName, "").trim()}
                      </span>
                      <h2>{offense.shortName}</h2>
                      <div className="team-caption">
                        <span>
                          {offense.conference} {offense.division}
                        </span>
                        <i />
                        <span>{recordLabel(offProfile)} in sample</span>
                      </div>
                    </div>
                    <TeamLogo team={offense} className="hero-logo" />
                  </div>
                  <TeamPicker
                    team={offense}
                    teams={teams}
                    label="Offensive team"
                    onChange={chooseOffense}
                  />
                </div>
                <div className="hero-versus">
                  <span>VS</span>
                  <button
                    onClick={swap}
                    aria-label="Swap offense and defense"
                    title="Reverse the matchup"
                  >
                    <ArrowLeftRight size={18} />
                  </button>
                </div>
                <div
                  className="hero-team hero-defense"
                  style={teamStyle(defense)}
                >
                  <span className="hero-role">02 / ON DEFENSE</span>
                  <div className="hero-team-name">
                    <div>
                      <span className="team-city">
                        {defense.name.replace(defense.shortName, "").trim()}
                      </span>
                      <h2>{defense.shortName}</h2>
                      <div className="team-caption">
                        <span>
                          {defense.conference} {defense.division}
                        </span>
                        <i />
                        <span>{recordLabel(defProfile)} in sample</span>
                      </div>
                    </div>
                    <TeamLogo team={defense} className="hero-logo" />
                  </div>
                  <TeamPicker
                    team={defense}
                    teams={teams}
                    label="Defensive team"
                    onChange={chooseDefense}
                  />
                </div>
                <div className="hero-bottomline">
                  <span>
                    <Layers3 size={13} />
                    {offProfile.games} offensive games · {defProfile.games}{" "}
                    defensive games
                  </span>
                  <span>
                    {game
                      ? `Data before ${dateLabel(game.kickoff)}`
                      : "Same window. League-relative measurements."}
                  </span>
                </div>
              </section>

              <div className="toolbar">
                <div className="toolbar-window">
                  <span className="toolbar-label">
                    <SlidersHorizontal size={14} />
                    SAMPLE WINDOW
                  </span>
                  <div className="segmented">
                    <button
                      className={windowMode === "season" ? "selected" : ""}
                      onClick={() => setWindowMode("season")}
                    >
                      Season
                    </button>
                    <button
                      className={windowMode === "last4" ? "selected" : ""}
                      onClick={() => setWindowMode("last4")}
                    >
                      Last 4 games
                    </button>
                  </div>
                </div>
                <label className="snapshot-select">
                  <Clock3 size={14} />
                  <select
                    aria-label="Report time cutoff"
                    value={selectedGame}
                    onChange={(e) => setSelectedGame(e.target.value)}
                  >
                    <option value="">Latest snapshot</option>
                    {(game && !matchingGames.some((g) => g.id === game.id)
                      ? [game, ...matchingGames]
                      : matchingGames
                    ).map((g) => (
                      <option key={g.id} value={g.id}>
                        Before W{g.week} · {g.awayTeam}@{g.homeTeam}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </label>
                <button className="share-button" onClick={() => void share()}>
                  {copied ? <Check size={14} /> : <ExternalLink size={14} />}
                  {copied ? "Copied" : "Share comparison"}
                </button>
              </div>

              <div className="section-heading">
                <div>
                  <span className="eyebrow">THE POSITIONAL PICTURE</span>
                  <h2>Six angles. A sharper view.</h2>
                </div>
                <span className="subtle-label">
                  <span className="legend-dot favorable-dot" />
                  Favorable
                  <span className="legend-dot difficult-dot" />
                  Challenging
                </span>
              </div>
              <div className="domain-grid">
                {domains.map((d) => (
                  <button
                    className={`domain-card ${d.evidence?.direction || ""}`}
                    key={d.key}
                    onClick={() => d.evidence && setActiveEvidence(d.evidence)}
                    disabled={!d.evidence}
                  >
                    <div className="domain-card-top">
                      <span className="domain-icon">
                        <d.icon size={17} />
                      </span>
                      <span className="domain-position">{d.short}</span>
                      <ArrowUpRight size={14} className="domain-arrow" />
                    </div>
                    <h3>{d.label}</h3>
                    <span className="domain-measure">{d.detail}</span>
                    <div className="domain-values">
                      <strong>{formatMetric(d.evidence?.offense)}</strong>
                      <span>vs</span>
                      <strong>{formatMetric(d.evidence?.defense)}</strong>
                    </div>
                    <div className="domain-team-labels">
                      <span>{offense.abbreviation} OFF</span>
                      <span>{defense.abbreviation} ALLOWED</span>
                    </div>
                    <div className="domain-card-bottom">
                      {d.evidence && (
                        <Signal direction={d.evidence.direction} small />
                      )}
                      <span
                        className={`sample-dot sample-${d.evidence?.reliability || "low"}`}
                        title={reliabilityLabel(
                          d.evidence?.reliability || "low",
                        )}
                      />
                    </div>
                  </button>
                ))}
              </div>

              <div className="analysis-layout">
                <section className="panel matchup-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">SHOW YOUR WORK</span>
                      <h2>Inside the matchup</h2>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => navigate("methodology")}
                      aria-label="Read matchup methodology"
                    >
                      <CircleHelp size={17} />
                    </button>
                  </div>
                  <div
                    className="position-tabs"
                    role="group"
                    aria-label="Filter position"
                  >
                    {(
                      [
                        "ALL",
                        "QB",
                        "RB",
                        "WR",
                        "TE",
                        "DEPTH",
                      ] as PositionFilter[]
                    ).map((p) => (
                      <button
                        className={position === p ? "active" : ""}
                        key={p}
                        onClick={() => setPosition(p)}
                      >
                        {p === "ALL"
                          ? "All positions"
                          : p === "DEPTH"
                            ? "Pass depth"
                            : p}
                      </button>
                    ))}
                  </div>
                  <div className="matchup-table-wrap">
                    <table className="matchup-table">
                      <thead>
                        <tr>
                          <th>MEASUREMENT</th>
                          <th>{offense.abbreviation} OFFENSE</th>
                          <th>{defense.abbreviation} DEFENSE</th>
                          <th>READ</th>
                          <th>
                            <span className="sr-only">Details</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {evidenceRows.map((e) => (
                          <tr key={e.key}>
                            <td>
                              <button
                                className="metric-name"
                                onClick={() => setActiveEvidence(e)}
                              >
                                <span>{e.label}</span>
                                <small>
                                  {Math.round(e.offense.sample)} /{" "}
                                  {Math.round(e.defense.sample)} opportunities
                                </small>
                              </button>
                            </td>
                            <td>
                              <strong>{formatMetric(e.offense)}</strong>
                              <PercentileBar
                                value={e.offense.percentile}
                                compact
                                tone="#3673ed"
                                label={`${offense.abbreviation} offense`}
                              />
                            </td>
                            <td>
                              <strong>{formatMetric(e.defense)}</strong>
                              <PercentileBar
                                value={e.defense.percentile}
                                compact
                                tone="#5c9186"
                                label={`${defense.abbreviation} defense`}
                              />
                            </td>
                            <td>
                              <Signal direction={e.direction} small />
                            </td>
                            <td>
                              <button
                                className="table-arrow"
                                aria-label={`Inspect ${e.label}`}
                                onClick={() => setActiveEvidence(e)}
                              >
                                <ChevronRight size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="panel-footnote">
                    <Info size={13} />
                    <span>
                      Percentiles: higher = stronger. Defensive values show
                      production allowed. Labels describe observed results.
                    </span>
                  </div>
                </section>
                <aside className="insight-column">
                  <section className="field-note">
                    <div className="field-note-icon">
                      <BookOpen size={19} />
                      <span>FIELD NOTE / 001</span>
                    </div>
                    <h2>
                      {strongest?.evidence?.direction === "favorable"
                        ? "A lane worth exploring."
                        : strongest?.evidence?.direction === "difficult"
                          ? "A defense to respect."
                          : "Look beyond the headline."}
                    </h2>
                    <p>
                      {strongest?.evidence?.explanation ||
                        "Compare each position’s efficiency with the opportunities it actually receives. A favorable matchup still needs a meaningful role."}
                    </p>
                    <div className="note-rule" />
                    <span className="note-kicker">MATCHUP ≠ OPPORTUNITY</span>
                    <p className="note-small">
                      A favorable environment can help a player. His share of
                      targets and carries determines how much it matters.
                    </p>
                    <button
                      onClick={() =>
                        document
                          .getElementById("player-usage")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                    >
                      Explore {offense.abbreviation} usage
                      <ArrowRight size={15} />
                    </button>
                  </section>
                  <section className="coverage-card">
                    <div>
                      <Database size={16} />
                      <strong>The data behind the read</strong>
                    </div>
                    <dl>
                      <div>
                        <dt>Player-position joins</dt>
                        <dd>{joinPct.toFixed(1)}%</dd>
                      </div>
                      <div>
                        <dt>Model approach</dt>
                        <dd>Observed baseline</dd>
                      </div>
                      <div>
                        <dt>Opponent adjustment</dt>
                        <dd className="muted">Not fitted in V1</dd>
                      </div>
                    </dl>
                    <button onClick={() => navigate("methodology")}>
                      Sources & definitions <ArrowUpRight size={13} />
                    </button>
                  </section>
                </aside>
              </div>

              <section className="panel players-panel" id="player-usage">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">FOLLOW THE OPPORTUNITY</span>
                    <h2>The players behind the profile</h2>
                  </div>
                  <span className="subtle-label">
                    {offense.abbreviation} · observed usage
                  </span>
                </div>
                <div className="player-grid">
                  {playerRows
                    .filter((p) =>
                      ["QB", "RB", "WR", "TE"].includes(p.position),
                    )
                    .slice(0, 8)
                    .map((p) => (
                      <button
                        key={p.id}
                        className="player-card"
                        onClick={() => setPlayer(p)}
                      >
                        <div className="player-photo">
                          {p.headshot ? (
                            <img
                              loading="lazy"
                              src={p.headshot}
                              alt=""
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <Users size={24} />
                          )}
                          <span>{p.position}</span>
                        </div>
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.games} games in sample</small>
                          <div className="player-stat">
                            <b>
                              {p.position === "QB"
                                ? `${p.passingAttempts}`
                                : p.position === "RB"
                                  ? `${p.carries}`
                                  : `${p.targets}`}
                            </b>
                            <span>
                              {p.position === "QB"
                                ? "pass attempts"
                                : p.position === "RB"
                                  ? "carries"
                                  : "targets"}
                            </span>
                          </div>
                        </div>
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                </div>
                {!playerRows.length && (
                  <div className="empty-state">
                    <Users size={26} />
                    <h3>No player sample before this cutoff.</h3>
                    <p>Choose the latest snapshot or a later game.</p>
                  </div>
                )}
                <div className="panel-footnote">
                  <Info size={13} />
                  <span>
                    Historical involvement, not projected usage. Click a player
                    for actual shares and production.
                  </span>
                </div>
              </section>
            </div>
          )}

          {page === "rankings" && (
            <div className="page-enter">
              <div className="rankings-intro">
                <div>
                  <span className="eyebrow">THE FULL FIELD</span>
                  <h2>
                    32 teams.
                    <br />
                    <em>Nowhere to hide.</em>
                  </h2>
                  <p>
                    Explore the underlying values and league percentiles. Every
                    column has a consistent sample window.
                  </p>
                </div>
                <div className="rankings-stat">
                  <strong>32</strong>
                  <span>TEAMS</span>
                </div>
                <div className="rankings-stat">
                  <strong>{METRICS.length}</strong>
                  <span>MEASUREMENTS PER SIDE</span>
                </div>
                <div className="rankings-stat">
                  <strong>
                    {snapshot.meta.latestWeek.toString().padStart(2, "0")}
                  </strong>
                  <span>LATEST WEEK WITH DATA</span>
                </div>
              </div>
              <section className="panel rankings-panel">
                <div className="ranking-controls">
                  <div className="segmented">
                    <button
                      className={rankSide === "offense" ? "selected" : ""}
                      onClick={() => setRankSide("offense")}
                    >
                      Offense
                    </button>
                    <button
                      className={rankSide === "defense" ? "selected" : ""}
                      onClick={() => setRankSide("defense")}
                    >
                      Defense
                    </button>
                  </div>
                  <div className="segmented">
                    <button
                      className={windowMode === "season" ? "selected" : ""}
                      onClick={() => setWindowMode("season")}
                    >
                      Season
                    </button>
                    <button
                      className={windowMode === "last4" ? "selected" : ""}
                      onClick={() => setWindowMode("last4")}
                    >
                      Last 4
                    </button>
                  </div>
                  <label className="rank-metric-select">
                    <span>RANK BY</span>
                    <select
                      aria-label="Rank by measurement"
                      value={rankSort}
                      onChange={(e) => {
                        setRankSort(e.target.value);
                        setRankAscending(false);
                      }}
                    >
                      {METRICS.filter((m) => !tendencyKeys.has(m.key)).map(
                        (m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="conference-select">
                    <Filter size={14} />
                    <select
                      aria-label="Conference filter"
                      value={conference}
                      onChange={(e) => setConference(e.target.value)}
                    >
                      <option value="ALL">All conferences</option>
                      <option value="AFC">AFC</option>
                      <option value="NFC">NFC</option>
                    </select>
                  </label>
                  <label className="input-search">
                    <Search size={15} />
                    <input
                      aria-label="Filter ranking teams"
                      placeholder="Search teams"
                      value={rankSearch}
                      onChange={(e) => setRankSearch(e.target.value)}
                    />
                  </label>
                </div>
                <div className="rankings-scroll">
                  <table className="rankings-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>TEAM</th>
                        <th>GP</th>
                        {rankingKeys.map((k) => (
                          <th key={k}>
                            <button
                              className={rankSort === k ? "sort-active" : ""}
                              onClick={() => {
                                if (rankSort === k) setRankAscending((v) => !v);
                                else {
                                  setRankSort(k);
                                  setRankAscending(false);
                                }
                              }}
                            >
                              {(
                                {
                                  epaPlay: "EPA / play",
                                  qbEpa: "QB passing",
                                  rbYardsPerCarry: "RB rushing",
                                  rbYardsPerTarget: "RB receiving",
                                  wrYardsPerTarget: "WR receiving",
                                  teYardsPerTarget: "TE receiving",
                                  sackRate: "Sack rate",
                                } as Record<string, string>
                              )[k] || METRICS.find((m) => m.key === k)?.label}
                              {rankSort === k && (
                                <ArrowDown
                                  size={12}
                                  className={rankAscending ? "rotate-180" : ""}
                                />
                              )}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRankingTeams.map((t, idx) => {
                        const p = profiles.get(t.id)!;
                        return (
                          <tr key={t.id}>
                            <td className="rank-index">
                              {String(idx + 1).padStart(2, "0")}
                            </td>
                            <td>
                              <button
                                className="ranking-team"
                                onClick={() => inspectTeam(t.id, rankSide)}
                              >
                                <TeamLogo team={t} />
                                <span>
                                  <strong>{t.name}</strong>
                                  <small>
                                    {t.conference} {t.division}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td className="games-cell">{p.games}</td>
                            {rankingKeys.map((k) => {
                              const m = metricOf(p, k, rankSide);
                              const pct = m?.percentile;
                              return (
                                <td key={k}>
                                  <button
                                    className={`heat-cell ${pct == null ? "" : pct >= 75 ? "heat-high" : pct <= 25 ? "heat-low" : ""}`}
                                    title={`${m?.label}: ${formatMetric(m)} · ${m?.rank || "—"} of ${m?.rankedTeams || 32} · ${m?.sample || 0} opportunities`}
                                    onClick={() => inspectTeam(t.id, rankSide)}
                                  >
                                    <strong>{formatMetric(m)}</strong>
                                    <span>
                                      {pct == null
                                        ? "No sample"
                                        : `${Math.round(pct)} pct`}
                                    </span>
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!sortedRankingTeams.length && (
                  <div className="empty-state">
                    <Search />
                    <h3>No matching teams</h3>
                    <button
                      className="text-link"
                      onClick={() => {
                        setRankSearch("");
                        setConference("ALL");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                <div className="panel-footnote">
                  <Info size={13} />
                  <span>
                    Click a column to sort by strength. Green = top quartile;
                    warm = bottom quartile. Defense shows allowed values with
                    strength percentiles reversed.
                  </span>
                </div>
              </section>
            </div>
          )}

          {page === "teams" && (
            <div className="page-enter">
              <section className="team-dossier-hero" style={teamStyle(offense)}>
                <div className="dossier-identity">
                  <TeamLogo team={offense} />
                  <div>
                    <span className="eyebrow">
                      {offense.conference} {offense.division} / TEAM DOSSIER
                    </span>
                    <h2>{offense.name}</h2>
                    <TeamPicker
                      team={offense}
                      teams={teams}
                      label="Profile team"
                      onChange={(id) => inspectTeam(id, teamSide)}
                    />
                  </div>
                </div>
                <div className="dossier-record">
                  <strong>{recordLabel(teamProfile)}</strong>
                  <span>{teamProfile.games} GAMES IN SAMPLE</span>
                </div>
              </section>
              <div className="toolbar">
                <div className="segmented">
                  <button
                    className={teamSide === "offense" ? "selected" : ""}
                    onClick={() => setTeamSide("offense")}
                  >
                    Offensive identity
                  </button>
                  <button
                    className={teamSide === "defense" ? "selected" : ""}
                    onClick={() => setTeamSide("defense")}
                  >
                    Defensive identity
                  </button>
                </div>
                <div className="segmented">
                  <button
                    className={windowMode === "season" ? "selected" : ""}
                    onClick={() => setWindowMode("season")}
                  >
                    Season
                  </button>
                  <button
                    className={windowMode === "last4" ? "selected" : ""}
                    onClick={() => setWindowMode("last4")}
                  >
                    Last 4 games
                  </button>
                </div>
                <span className="subtle-label">
                  {game
                    ? `Before ${dateLabel(game.kickoff)}`
                    : "Latest snapshot"}
                </span>
              </div>
              <div className="dossier-summary-grid">
                <section className="panel dossier-strengths">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">WHERE THEY STAND OUT</span>
                      <h2>Measured strengths</h2>
                    </div>
                    <ArrowUpRight size={21} />
                  </div>
                  {topMetrics.slice(0, 3).map((m) => (
                    <div className="dossier-metric" key={m.key}>
                      <div>
                        <strong>{m.label}</strong>
                        <span>
                          {formatMetric(m)} · #{m.rank} in the league
                        </span>
                      </div>
                      <PercentileBar
                        value={m.percentile}
                        tone="#348574"
                        label={m.label}
                      />
                    </div>
                  ))}
                </section>
                <section className="panel dossier-weaknesses">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">WHERE TO LOOK CLOSER</span>
                      <h2>Areas to examine</h2>
                    </div>
                    <ArrowDownLeft size={21} />
                  </div>
                  {[...topMetrics]
                    .reverse()
                    .slice(0, 3)
                    .map((m) => (
                      <div className="dossier-metric" key={m.key}>
                        <div>
                          <strong>{m.label}</strong>
                          <span>
                            {formatMetric(m)} · #{m.rank} in the league
                          </span>
                        </div>
                        <PercentileBar
                          value={m.percentile}
                          tone="#c18b67"
                          label={m.label}
                        />
                      </div>
                    ))}
                </section>
              </div>
              <div className="dossier-chart-grid">
                <section className="panel trend-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">THE WEEKLY PICTURE</span>
                      <h2>Performance, game by game</h2>
                    </div>
                    <select
                      className="metric-select"
                      aria-label="Trend measurement"
                      value={trendMetric}
                      onChange={(e) => setTrendMetric(e.target.value)}
                    >
                      {METRICS.filter((m) => !tendencyKeys.has(m.key)).map(
                        (m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <TrendChart
                    points={trend}
                    color="#1761ec"
                    unit={
                      METRICS.find((m) => m.key === trendMetric)?.unit ===
                      "percent"
                        ? "%"
                        : ""
                    }
                  />
                  <div className="panel-footnote">
                    Actual individual-game values. Hover or focus a point for
                    detail.
                  </div>
                </section>
                <section className="panel team-comparison">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">TWO SIDES OF THE BALL</span>
                      <h2>Team balance</h2>
                    </div>
                  </div>
                  <ComparisonChart
                    rows={DOMAINS.slice(0, 5).map((d) => ({
                      label: d.label,
                      home: metricOf(teamProfile, d.key)?.percentile ?? null,
                      away:
                        metricOf(teamProfile, d.key, "defense")?.percentile ??
                        null,
                    }))}
                    homeLabel="Offense"
                    awayLabel="Defense"
                    homeColor="#3673ed"
                    awayColor="#6a9a8e"
                  />
                </section>
              </div>
              <section className="panel profile-metrics">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">THE COMPLETE PROFILE</span>
                    <h2>All measurements</h2>
                  </div>
                  <span className="subtle-label">
                    {teamSide === "defense"
                      ? "Production allowed"
                      : "Production generated"}
                  </span>
                </div>
                <div className="all-metrics-grid">
                  {teamMetrics.map((m) => (
                    <div className="profile-metric" key={m.key}>
                      <div>
                        <span>{m.label}</span>
                        <span
                          className={`metric-kind ${tendencyKeys.has(m.key) ? "kind-tendency" : ""}`}
                        >
                          {tendencyKeys.has(m.key) ? "TENDENCY" : m.group}
                        </span>
                      </div>
                      <strong>{formatMetric(m)}</strong>
                      {tendencyKeys.has(m.key) ? (
                        <small>
                          League average{" "}
                          {formatMetric({
                            value: m.leagueAverage,
                            unit: m.unit,
                          })}
                        </small>
                      ) : (
                        <PercentileBar
                          value={m.percentile}
                          compact
                          tone="#3673ed"
                          label={m.label}
                        />
                      )}
                      <small>
                        {Math.round(m.sample).toLocaleString()} opportunities ·{" "}
                        {reliabilityLabel(m.reliability).toLowerCase()}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {page === "methodology" && (
            <div className="page-enter methodology-page">
              <div className="method-hero">
                <span className="eyebrow">VERSION 1.0 / THE FOUNDATION</span>
                <h2>
                  A useful read starts
                  <br />
                  with <em>honest numbers.</em>
                </h2>
                <p>
                  Matchup Lab puts real play-by-play measurements in context.
                  This first edition helps you inspect positional performance
                  and defensive allowances. It does not claim a trained
                  forecast, a precise matchup lift, or a betting probability.
                </p>
                <div className="method-pills">
                  <span>
                    <Check size={14} />
                    Real observations
                  </span>
                  <span>
                    <Check size={14} />
                    Transparent samples
                  </span>
                  <span>
                    <Check size={14} />
                    Reproducible data
                  </span>
                </div>
              </div>
              <div className="method-cards">
                {[
                  {
                    n: "01",
                    title: "Measure the play.",
                    text: "Rates use summed numerators and opportunities, never averages of averages. Kneels, spikes and no-play penalties are excluded from analytical efficiency.",
                  },
                  {
                    n: "02",
                    title: "Make it comparable.",
                    text: "Teams use the same sample window. Percentiles compare eligible teams, with defensive strength inverted so better prevention scores higher.",
                  },
                  {
                    n: "03",
                    title: "Respect the sample.",
                    text: "Every metric has opportunity thresholds. Small samples stay visible. A missing measurement is unavailable, never an artificial average.",
                  },
                ].map((m) => (
                  <section className="panel method-card" key={m.n}>
                    <span>{m.n}</span>
                    <h3>{m.title}</h3>
                    <p>{m.text}</p>
                  </section>
                ))}
              </div>
              <section className="panel definitions-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">THE RESEARCH CONTRACT</span>
                    <h2>What a label actually means</h2>
                  </div>
                  <BookOpen size={20} />
                </div>
                <div className="definitions-grid">
                  <div>
                    <h3>Favorable / challenging</h3>
                    <p>
                      Descriptive intersections of offensive performance and
                      defensive allowances. These labels are research prompts;
                      they are not calibrated success probabilities.
                    </p>
                  </div>
                  <div>
                    <h3>Strength / tendency</h3>
                    <p>
                      Higher strength percentiles indicate better performance.
                      Pass rates and target shares describe style and
                      allocation; a larger share is not inherently better.
                    </p>
                  </div>
                  <div>
                    <h3>Last four games</h3>
                    <p>
                      The four most recent completed games available before the
                      cutoff, selected separately for each team. Ratios are
                      recalculated from their combined opportunities.
                    </p>
                  </div>
                  <div>
                    <h3>Pregame reconstruction</h3>
                    <p>
                      Only earlier completed games enter a selected game's
                      profile. Source files may contain later statistical
                      corrections, so this is not an archived as-published
                      forecast.
                    </p>
                  </div>
                  <div>
                    <h3>Positions / receiving depth</h3>
                    <p>
                      RB/WR/TE splits use receiver identifiers matched to roster
                      positions. Short, intermediate and deep targets describe
                      air-yard depth, not slot alignment or coverage assignment.
                    </p>
                  </div>
                  <div>
                    <h3>The next layer</h3>
                    <p>
                      Opponent adjustment, uncertainty estimates, injury
                      scenarios and coherent player projections belong in a
                      later validated model. V1 deliberately exposes its
                      baseline.
                    </p>
                  </div>
                </div>
              </section>
              <section className="panel source-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">PROVENANCE, INCLUDED</span>
                    <h2>Source ledger</h2>
                  </div>
                  <span className="data-version">
                    {snapshot.meta.modelVersion}
                  </span>
                </div>
                <div className="source-ledger">
                  {snapshot.meta.sources.map((s, i) => (
                    <a
                      key={`${s.name}-${i}`}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="source-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          Retrieved {dateLabel(s.fetchedAt)}
                          {s.lastModified
                            ? ` · source updated ${dateLabel(s.lastModified)}`
                            : ""}
                        </small>
                      </div>
                      <ExternalLink size={15} />
                    </a>
                  ))}
                </div>
                <div className="source-summary">
                  <div>
                    <span>SNAPSHOT GENERATED</span>
                    <strong>{dateLabel(snapshot.meta.generatedAt)}</strong>
                  </div>
                  <div>
                    <span>TARGET POSITION COVERAGE</span>
                    <strong>{joinPct.toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>COMPLETED GAMES</span>
                    <strong>{snapshot.meta.completedGames}</strong>
                  </div>
                </div>
                {snapshot.meta.notes.length > 0 && (
                  <div className="source-notes">
                    {snapshot.meta.notes.map((n, i) => (
                      <p key={i}>
                        <Info size={13} />
                        {n}
                      </p>
                    ))}
                  </div>
                )}
              </section>
              <section className="panel metric-dictionary">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">LOOK UNDER THE HOOD</span>
                    <h2>Metric dictionary</h2>
                  </div>
                  <span className="subtle-label">
                    {METRICS.length} defined measurements
                  </span>
                </div>
                {METRICS.map((m) => (
                  <details key={m.key}>
                    <summary>
                      <span>{m.label}</span>
                      <span>
                        {m.group}
                        <ChevronDown size={14} />
                      </span>
                    </summary>
                    <div>
                      <p>{m.description}</p>
                      <code>
                        {m.numerator} ÷ {m.denominator}
                        {m.multiplier === 100 ? " × 100" : ""}
                      </code>
                      <p>
                        Sample guide: below {m.minimumSample} opportunities =
                        small; {m.minimumSample}–{m.highSample - 1} = building;{" "}
                        {m.highSample}+ = established. These are exposure
                        labels, not statistical confidence intervals.
                      </p>
                    </div>
                  </details>
                ))}
              </section>
            </div>
          )}

          <footer className="footer">
            <span className="footer-brand">
              MATCHUP LAB<span> / </span>THE BASELINE EDITION
            </span>
            <span>Stats via nflverse · Team imagery via ESPN</span>
            <button onClick={() => navigate("methodology")}>
              Built on evidence <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>

      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {activeEvidence && (
        <EvidenceModal
          evidence={activeEvidence}
          offense={offense}
          defense={defense}
          onClose={() => setActiveEvidence(null)}
        />
      )}
      {searchOpen && (
        <Modal
          title="Find your team."
          subtitle="Open a team profile to explore its identity."
          onClose={() => setSearchOpen(false)}
        >
          <label className="modal-search">
            <Search size={19} />
            <input
              aria-label="Search NFL teams"
              placeholder="Team, city or abbreviation…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <div className="search-results">
            {teams
              .filter((t) =>
                `${t.name} ${t.abbreviation}`
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase()),
              )
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    chooseOffense(t.id);
                    setPage("teams");
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                >
                  <TeamLogo team={t} />
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      {t.conference} {t.division}
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
          </div>
          {!teams.some((t) =>
            `${t.name} ${t.abbreviation}`
              .toLowerCase()
              .includes(searchQuery.toLowerCase()),
          ) && (
            <div className="empty-state">
              <Search />
              <h3>No matching teams.</h3>
              <p>Try a city or an abbreviation.</p>
            </div>
          )}
        </Modal>
      )}
      {slateOpen && (
        <Modal
          title="Pick a game."
          subtitle="Open a matchup using only games completed before its kickoff."
          onClose={() => setSlateOpen(false)}
          wide
        >
          <div className="slate-controls">
            <CalendarDays size={17} />
            <label>
              WEEK
              <select
                aria-label="Slate week"
                value={slateWeek}
                onChange={(e) => setSlateWeek(Number(e.target.value))}
              >
                {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <span>{snapshot.meta.season} REGULAR SEASON</span>
          </div>
          <div className="slate-grid">
            {slateGames.map((g) => {
              const away = teams.find((t) => t.id === g.awayTeam)!,
                home = teams.find((t) => t.id === g.homeTeam)!;
              if (!away || !home) return null;
              return (
                <button
                  key={g.id}
                  className="slate-game"
                  onClick={() => chooseGame(g)}
                >
                  <div className="slate-game-meta">
                    <span>
                      {dateLabel(g.kickoff, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span>
                      {g.status === "final"
                        ? "FINAL"
                        : g.status === "in_progress"
                          ? "IN PROGRESS"
                          : new Date(g.kickoff).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                    </span>
                  </div>
                  <div>
                    <TeamLogo team={away} />
                    <strong>{away.name}</strong>
                    {g.status === "final" && <b>{g.awayScore}</b>}
                  </div>
                  <div>
                    <TeamLogo team={home} />
                    <strong>{home.name}</strong>
                    {g.status === "final" && <b>{g.homeScore}</b>}
                  </div>
                  <span className="slate-action">
                    Explore pregame profile
                    <ArrowRight size={14} />
                  </span>
                </button>
              );
            })}
          </div>
          {!slateGames.length && (
            <div className="empty-state">
              <CalendarDays />
              <h3>No games in this snapshot for Week {slateWeek}.</h3>
              <p>Try another week or refresh the source data.</p>
            </div>
          )}
        </Modal>
      )}
      {player && (
        <Modal
          title={player.name}
          subtitle={`${offense.name} · ${player.position} · ${player.games} games in sample`}
          onClose={() => setPlayer(null)}
        >
          <div className="player-detail-hero">
            <div className="player-detail-photo">
              {player.headshot ? (
                <img
                  src={player.headshot}
                  alt={player.name}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <Users size={44} />
              )}
            </div>
            <div>
              <span className="eyebrow">ACTUAL INVOLVEMENT</span>
              <h3>
                A role has to earn
                <br />
                its opportunities.
              </h3>
              <p>
                Observed production in the selected window, before the report
                cutoff.
              </p>
            </div>
          </div>
          <div className="player-detail-stats">
            {(player.position === "QB"
              ? [
                  { l: "Pass attempts", v: player.passingAttempts },
                  { l: "Passing yards", v: player.passingYards },
                  { l: "Passing TDs", v: player.passingTouchdowns },
                  { l: "Rushing yards", v: player.rushingYards },
                ]
              : [
                  { l: "Targets", v: player.targets },
                  {
                    l: "Target share",
                    v:
                      player.targetShare == null
                        ? "—"
                        : `${player.targetShare.toFixed(1)}%`,
                  },
                  { l: "Carries", v: player.carries },
                  {
                    l: "Carry share",
                    v:
                      player.carryShare == null
                        ? "—"
                        : `${player.carryShare.toFixed(1)}%`,
                  },
                  { l: "Receiving yards", v: player.receivingYards },
                  { l: "Rushing yards", v: player.rushingYards },
                ]
            ).map((s) => (
              <div key={s.l}>
                <span>{s.l}</span>
                <strong>{s.v}</strong>
              </div>
            ))}
          </div>
          <div className="note-box">
            <Info size={17} />
            <p>
              These are historical totals and shares, not player projections.
              Snap counts, routes, injury adjustments and predictive role
              allocation are outside this baseline.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
