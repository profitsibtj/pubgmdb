export interface Player {
  name: string;
  role: string; // "Player" | "Coach" | "Analis"
  weapon?: string; // Primary weapon used (e.g. M416, SLR, DBS)
  elims: number; // Kills / Eliminations
  assists: number;
  damage: number; // Damage dealt
  survivalTime?: string; // e.g. "18:24" or seconds
  knocks?: number; // Opponents knocked down
  heals?: number; // Heals used
  mvp?: boolean; // Most Valuable Player
  // Automatically calculated properties (not strictly required to input)
  elimsPercent?: number;
  dmgPercent?: number;

  // Daily Stats Props
  matchesPlayed?: number;
  wwcdCount?: number;
  placementPoints?: number;
}

// Player Input Panel's per-tournament column layout for a daily/weekly stats record. "time"
// columns are entered as free text (e.g. "18:24" for Survival Time) but aggregated numerically as
// seconds in Player Stats, unlike a plain "string" column which is never summed.
export interface CustomColumn {
  key: string;
  label: string;
  type: "string" | "number" | "time";
}

export interface Team {
  name: string;
  placement: number; // 1 to 16
  placementPoints: number; // Points from rank (e.g. 1st = 10, 2nd = 6, 3rd = 5...)
  eliminationPoints: number; // Team total kills
  bonusPoints?: number; // Optional situational bonus/starting points (16-team lobbies only), added on top of placement + kills
  totalPoints: number; // placementPoints + eliminationPoints + bonusPoints
  wwcd: boolean; // Winner Winner Chicken Dinner
  players: Player[];
}

export interface ScheduleEntry {
  id?: string;
  league?: string; // e.g. PMSL, PMGC, PMCO
  matchCode: string; // e.g. "Week 1 Day 1" or "Grand Final"
  teams?: string[]; // Optional list of confirmed participating teams
  map?: string; // "Erangel" | "Miramar" | "Sanhok" | "Rondo"
  scheduledAt: string; // ISO datetime string - when the match is set to start
  liveLink?: string;
  isFinished?: boolean; // Manually flagged by an admin once the match wraps up
  createdAt?: string;
}

export interface Match {
  id?: string;
  date: string;
  time?: string; // "HH:MM" - the actual time this game was played, optional
  matchCode: string; // e.g. W1D1
  map: string; // "Erangel" | "Miramar" | "Sanhok" | "Vikendi"
  league?: string; // e.g. PMSL, PMGC, PMCO
  totalGame?: string; // e.g. Game 1
  gameNo?: string; // e.g. Game 1
  patch?: string; // e.g. 3.2
  liveLink?: string;
  createdAt?: string;
  teams: Team[]; // Dynamic list of competing squads
  // Client-side-only marker set when merging a DailyStatsEntry into a combined view for Player
  // Stats / Comparisons (see App.tsx) - never persisted on the matches table itself. Daily/weekly/
  // tournament-wide player stats live in their own `daily_stats` table (see DailyStatsEntry) so
  // Player Input Panel entries don't get mixed into actual match results.
  isDailyStats?: boolean;
  isGrandFinal?: boolean; // Marks this match as part of the Grand Final stage, kept separate from the overall/regular-season standings for the same league
  customColumns?: CustomColumn[];
}

// A single Player Input Panel entry (a day, a week, or a whole-tournament catch-all) of aggregated
// player stats for a league - stored in its own `daily_stats` table, separate from real match
// results in `matches`.
export interface DailyStatsEntry {
  id?: string;
  league?: string;
  matchCode: string; // e.g. DAILY_W1, DAILY_TOURNAMENT, DAILY_20260415
  date: string; // a week label, "Sepanjang Turnamen", or a calendar date, depending on granularity
  teams: Team[];
  customColumns?: CustomColumn[];
  createdAt?: string;
  updatedAt?: string;
}
