export type Side = "offense" | "defense";
export type PositionGroup = "QB" | "RB" | "WR" | "TE";
export type MetricGroup = PositionGroup | "TEAM" | "DEPTH";
export interface Team {
  id: string;
  abbreviation: string;
  name: string;
  shortName: string;
  conference: "AFC" | "NFC";
  division: string;
  color: string;
  alternateColor: string;
  logo: string;
}
export interface Game {
  id: string;
  season: number;
  week: number;
  seasonType: "REG";
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  completedAt?: string;
  status: "final" | "scheduled" | "in_progress";
  homeScore?: number;
  awayScore?: number;
  stadium?: string;
  espnId?: string;
}
export interface TeamGameStats {
  gameId: string;
  teamId: string;
  opponentId: string;
  stats: Record<string, number>;
}
export interface Player {
  id: string;
  name: string;
  position: string;
  teamId: string;
  headshot: string | null;
  espnId?: string;
}
export interface PlayerGameStats {
  gameId: string;
  teamId: string;
  playerId: string;
  stats: Record<string, number>;
}
export interface MetricDefinition {
  key: string;
  label: string;
  group: MetricGroup;
  numerator: string;
  denominator: string;
  multiplier: number;
  unit: "epa" | "percent" | "yards" | "count";
  higherIsBetter: boolean;
  description: string;
  minimumSample: number;
  highSample: number;
}
export interface MetricResult extends MetricDefinition {
  value: number | null;
  leagueAverage: number | null;
  percentile: number | null;
  rank: number | null;
  sample: number;
  reliability: "low" | "moderate" | "high";
  rankedTeams: number;
}
export interface ProfileOptions {
  before?: string;
  throughWeek?: number;
  window?: "season" | "last4";
}
export interface TeamProfile {
  teamId: string;
  games: number;
  gameIds: string[];
  cutoff: string;
  window: "season" | "last4";
  offense: MetricResult[];
  defense: MetricResult[];
  record: { wins: number; losses: number; ties: number };
}
export interface MatchupEvidence {
  key: string;
  label: string;
  group: MetricGroup;
  offense: MetricResult;
  defense: MetricResult;
  signal: number | null;
  direction: "favorable" | "difficult" | "balanced" | "unavailable";
  reliability: "low" | "moderate" | "high";
  explanation: string;
}
export interface Matchup {
  offense: TeamProfile;
  defense: TeamProfile;
  evidence: MatchupEvidence[];
}
export interface PlayerSummary extends Player {
  games: number;
  targets: number;
  carries: number;
  receivingYards: number;
  rushingYards: number;
  passingYards: number;
  passingAttempts: number;
  targetShare: number | null;
  carryShare: number | null;
  receptions: number;
  passingTouchdowns: number;
  rushingTouchdowns: number;
  receivingTouchdowns: number;
}
export interface Snapshot {
  schemaVersion: 1;
  meta: {
    season: number;
    generatedAt: string;
    observedAt: string;
    asOf: string;
    latestGameDate: string;
    completedGames: number;
    latestWeek: number;
    modelVersion: string;
    coverage: {
      targets: number;
      positionMatchedTargets: number;
      targetPositionJoinRate: number;
      unknownReceiverIds: string[];
      optionalFields?: {
        eligiblePlays: number;
        epaAvailable: number;
        xpassAvailable: number;
        targetsWithAirYards: number;
        completedTargets: number;
        completedTargetsWithYac: number;
        designedRushAttempts: number;
        positionMatchedDesignedRushes: number;
      };
    };
    sources: {
      name: string;
      url: string;
      fetchedAt: string;
      lastModified: string | null;
    }[];
    notes: string[];
  };
  teams: Team[];
  games: Game[];
  teamGames: TeamGameStats[];
  players: Player[];
  playerGames: PlayerGameStats[];
}
