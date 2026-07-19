import { Match, Player } from "./types";
import { getBrowserSupabase } from "./supabaseBrowserClient";

const mapMatchFromDb = (row: any) => {
  if (!row) return null;
  return {
    id: String(row.id),
    date: row.date || "",
    matchCode: row.match_code || "",
    league: row.league || "",
    totalGame: row.total_game || "1",
    gameNo: row.game_no || "1",
    map: row.map || "Erangel",
    liveLink: row.live_link || "",
    teams: row.teams || [],
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
};

const mapMatchToDb = (data: any) => {
  return {
    date: data.date || null,
    match_code: data.matchCode || null,
    league: data.league || null,
    total_game: data.totalGame ? String(data.totalGame) : null,
    game_no: data.gameNo ? String(data.gameNo) : null,
    map: data.map || null,
    live_link: data.liveLink || null,
    teams: data.teams || null,
  };
};

const mapRosterFromDb = (row: any) => {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name || "",
    role: row.role || "",
    team: row.team || "",
    league: row.league || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
};

const mapRosterToDb = (player: any) => {
  return {
    name: player.name || "",
    role: player.role || null,
    team: player.team || null,
    league: player.league || null,
  };
};

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

export const clientDb = {
  getIsStatic: () => {
    return window.location.hostname.endsWith(".github.io") || window.location.search.includes("mode=static");
  },

  // Static/GitHub Pages mode has no server, so it talks to Supabase directly
  // from the browser using the (safe-to-expose) anon key - same tables and
  // column mapping as server.ts, so data is shared with everyone, not just
  // the local browser.
  getMatches: async (): Promise<Match[]> => {
    const { data: rawMatches, error } = await getBrowserSupabase().from("matches").select("*");
    if (error) throw error;
    const formatted = (rawMatches || []).map((m: any) => mapMatchFromDb(m));
    return sortMatches(formatted.map((m: any) => formatMatchData(m)));
  },

  addMatch: async (matchData: any): Promise<string> => {
    const dbObj: any = mapMatchToDb(matchData);
    dbObj.created_at = new Date().toISOString();
    const { data, error } = await getBrowserSupabase().from("matches").insert([dbObj]).select("id").single();
    if (error) throw error;
    return String(data.id);
  },

  updateMatch: async (id: string, matchData: any): Promise<void> => {
    const dbObj: any = mapMatchToDb(matchData);
    dbObj.updated_at = new Date().toISOString();
    const { error } = await getBrowserSupabase().from("matches").update(dbObj).eq("id", id);
    if (error) throw error;
  },

  deleteMatch: async (id: string): Promise<void> => {
    const { error } = await getBrowserSupabase().from("matches").delete().eq("id", id);
    if (error) throw error;
  },

  getRoster: async (): Promise<any[]> => {
    const { data: rawRoster, error } = await getBrowserSupabase().from("roster").select("*");
    if (error) throw error;
    return (rawRoster || []).map((r: any) => mapRosterFromDb(r));
  },

  saveRosterPlayer: async (player: any): Promise<string> => {
    if (player.id) {
      const dbObj: any = mapRosterToDb(player);
      dbObj.updated_at = new Date().toISOString();
      const { error } = await getBrowserSupabase().from("roster").update(dbObj).eq("id", player.id);
      if (error) throw error;
      return player.id;
    }
    const dbObj: any = mapRosterToDb(player);
    dbObj.created_at = new Date().toISOString();
    const { data: inserted, error } = await getBrowserSupabase().from("roster").insert([dbObj]).select("id").single();
    if (error) throw error;
    return String(inserted.id);
  },

  deleteRosterPlayer: async (id: string): Promise<void> => {
    const { error } = await getBrowserSupabase().from("roster").delete().eq("id", id);
    if (error) throw error;
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
