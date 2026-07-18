import { Match, Player } from "./types";

// Map standard PUBGM placement points system
const calculatePlacementPoints = (placement: number): number => {
  const p = Number(placement) || 0;
  if (p === 1) return 10;
  if (p === 2) return 6;
  if (p === 3) return 5;
  if (p === 4) return 4;
  if (p === 5) return 3;
  if (p === 6) return 2;
  if (p === 7 || p === 8) return 1;
  return 0;
};

// Format Match Data to compute percentages and totals dynamically
export const formatMatchData = (match: any): Match => {
  const teams = match.teams || [];
  const formattedTeams = teams.map((team: any) => {
    const players = team.players || [];
    const teamTotalElims = players.length > 0
      ? players.reduce((sum: number, p: any) => sum + (Number(p.elims) || 0), 0)
      : (Number(team.eliminationPoints) || 0);
    const teamTotalDamage = players.reduce((sum: number, p: any) => sum + (Number(p.damage) || 0), 0);

    const formattedPlayers = players.map((player: any) => {
      const elims = Number(player.elims) || 0;
      const damage = Number(player.damage) || 0;
      return {
        ...player,
        elims,
        assists: Number(player.assists) || 0,
        damage,
        knocks: Number(player.knocks) || 0,
        heals: Number(player.heals) || 0,
        mvp: !!player.mvp,
        elimsPercent: teamTotalElims > 0 ? Math.round((elims / teamTotalElims) * 1000) / 10 : 0,
        dmgPercent: teamTotalDamage > 0 ? Math.round((damage / teamTotalDamage) * 1000) / 10 : 0
      };
    });

    const placement = Number(team.placement) || 16;
    return {
      ...team,
      placement,
      placementPoints: calculatePlacementPoints(placement),
      eliminationPoints: teamTotalElims,
      totalPoints: calculatePlacementPoints(placement) + teamTotalElims,
      wwcd: placement === 1,
      players: formattedPlayers
    };
  });

  return { ...match, teams: formattedTeams };
};

// Helper: Sort matches by Date and Round/Game descending
export const sortMatches = (matches: any[]) => {
  const getNumericValue = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const numMatch = String(val).match(/\d+/);
    return numMatch ? parseInt(numMatch[0], 10) : 0;
  };

  return [...matches].sort((a, b) => {
    const dateA = a.date || "";
    const dateB = b.date || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);

    const totalGameA = getNumericValue(a.totalGame);
    const totalGameB = getNumericValue(b.totalGame);
    if (totalGameA !== totalGameB) return totalGameB - totalGameA;

    const codeA = a.matchCode || "";
    const codeB = b.matchCode || "";
    if (codeA !== codeB) return codeB.localeCompare(codeA, undefined, { numeric: true });

    return getNumericValue(b.gameNo) - getNumericValue(a.gameNo);
  });
};

const initialRoster = [
  { id: "1", name: "Microboy", role: "Player", team: "Level Up Indonesia", league: "PMSL SEA" },
  { id: "2", name: "Ryzen", role: "Player", team: "Level Up Indonesia", league: "PMSL SEA" },
  { id: "3", name: "Zuxxy", role: "Player", team: "Level Up Indonesia", league: "PMSL SEA" },
  { id: "4", name: "Luxxy", role: "Player", team: "Level Up Indonesia", league: "PMSL SEA" },
  { id: "5", name: "S1nyo", role: "Coach", team: "Level Up Indonesia", league: "PMSL SEA" },
  { id: "6", name: "Potato", role: "Player", team: "Alter Ego DX", league: "PMSL SEA" },
  { id: "7", name: "Rosemary", role: "Player", team: "Alter Ego DX", league: "PMSL SEA" },
  { id: "8", name: "Okta", role: "Player", team: "Alter Ego DX", league: "PMSL SEA" },
  { id: "9", name: "Lyle", role: "Player", team: "Alter Ego DX", league: "PMSL SEA" }
];

export const clientDb = {
  getIsStatic: () => {
    return window.location.hostname.endsWith(".github.io") || window.location.search.includes("mode=static");
  },

  getMatches: async (): Promise<Match[]> => {
    const stored = localStorage.getItem("pubgm_static_matches");
    if (!stored) return [];
    try {
      const matches = JSON.parse(stored);
      return sortMatches(matches.map((m: any) => formatMatchData(m)));
    } catch {
      return [];
    }
  },

  addMatch: async (matchData: any): Promise<string> => {
    const stored = localStorage.getItem("pubgm_static_matches");
    const matches = stored ? JSON.parse(stored) : [];
    const newId = String(Date.now());
    const newMatch = { ...matchData, id: newId, createdAt: new Date().toISOString() };
    matches.push(newMatch);
    localStorage.setItem("pubgm_static_matches", JSON.stringify(matches));
    return newId;
  },

  updateMatch: async (id: string, matchData: any): Promise<void> => {
    const stored = localStorage.getItem("pubgm_static_matches");
    if (!stored) return;
    try {
      const matches = JSON.parse(stored);
      const index = matches.findIndex((m: any) => String(m.id) === id);
      if (index !== -1) {
        const { id: _, ...toSave } = matchData;
        matches[index] = { ...matches[index], ...toSave, updatedAt: new Date().toISOString() };
        localStorage.setItem("pubgm_static_matches", JSON.stringify(matches));
      }
    } catch (e) {
      console.error(e);
    }
  },

  deleteMatch: async (id: string): Promise<void> => {
    const stored = localStorage.getItem("pubgm_static_matches");
    if (!stored) return;
    try {
      const matches = JSON.parse(stored);
      const filtered = matches.filter((m: any) => String(m.id) !== id);
      localStorage.setItem("pubgm_static_matches", JSON.stringify(filtered));
    } catch (e) {
      console.error(e);
    }
  },

  getRoster: async (): Promise<any[]> => {
    const stored = localStorage.getItem("pubgm_static_roster");
    if (!stored) {
      localStorage.setItem("pubgm_static_roster", JSON.stringify(initialRoster));
      return initialRoster;
    }
    try {
      return JSON.parse(stored);
    } catch {
      return initialRoster;
    }
  },

  saveRosterPlayer: async (player: any): Promise<string> => {
    const stored = localStorage.getItem("pubgm_static_roster");
    const roster = stored ? JSON.parse(stored) : [...initialRoster];
    if (player.id) {
      const index = roster.findIndex((p: any) => String(p.id) === String(player.id));
      if (index !== -1) {
        const { id, ...data } = player;
        roster[index] = { ...roster[index], ...data, updatedAt: new Date().toISOString() };
      }
      localStorage.setItem("pubgm_static_roster", JSON.stringify(roster));
      return player.id;
    } else {
      const newId = String(Date.now());
      const newPlayer = { ...player, id: newId, createdAt: new Date().toISOString() };
      roster.push(newPlayer);
      localStorage.setItem("pubgm_static_roster", JSON.stringify(roster));
      return newId;
    }
  },

  deleteRosterPlayer: async (id: string): Promise<void> => {
    const stored = localStorage.getItem("pubgm_static_roster");
    if (!stored) return;
    try {
      const roster = JSON.parse(stored);
      const filtered = roster.filter((p: any) => String(p.id) !== String(id));
      localStorage.setItem("pubgm_static_roster", JSON.stringify(filtered));
    } catch (e) {
      console.error(e);
    }
  },

  // NOTE: this only gates local-only (per-browser) data in static/GitHub Pages
  // mode. Vite bakes VITE_-prefixed env vars into the public JS bundle at build
  // time, so this is not a real secret and should not be relied on to protect
  // anything sensitive — configure it via a GitHub Actions secret, not by
  // hardcoding a value here.
  verifyAccessPassword: async (password: string): Promise<boolean> => {
    const expected = import.meta.env.VITE_ACCESS_PASSWORD;
    return !!expected && password === expected;
  },

  verifyActionPassword: async (password: string): Promise<boolean> => {
    const expected = import.meta.env.VITE_ACTION_PASSWORD;
    return !!expected && password === expected;
  }
};
