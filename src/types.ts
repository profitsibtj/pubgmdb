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

export interface Match {
  id?: string;
  date: string;
  matchCode: string; // e.g. W1D1
  map: string; // "Erangel" | "Miramar" | "Sanhok" | "Vikendi"
  league?: string; // e.g. PMSL, PMGC, PMCO
  totalGame?: string; // e.g. Game 1
  gameNo?: string; // e.g. Game 1
  patch?: string; // e.g. 3.2
  liveLink?: string;
  createdAt?: string;
  teams: Team[]; // Dynamic list of competing squads
  isDailyStats?: boolean; // Flag to filter daily accumulated stats
  isGrandFinal?: boolean; // Marks this match as part of the Grand Final stage, kept separate from the overall/regular-season standings for the same league
  customColumns?: { key: string; label: string; type: "string" | "number" }[]; // Player Input Panel's per-tournament column layout for a daily/weekly stats record
}
