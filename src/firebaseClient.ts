import { Match, ScheduleEntry, DailyStatsEntry } from "./types";
import { getBrowserSupabase } from "./supabaseBrowserClient";
import { calculatePlacementPoints } from "./utils";

const mapMatchFromDb = (row: any) => {
  if (!row) return null;
  return {
    id: String(row.id),
    date: row.date || "",
    time: row.match_time || "",
    matchCode: row.match_code || "",
    league: row.league || "",
    totalGame: row.total_game || "1",
    gameNo: row.game_no || "1",
    map: row.map || "Erangel",
    patch: row.patch || "",
    liveLink: row.live_link || "",
    teams: row.teams || [],
    isGrandFinal: !!row.is_grand_final,
    isSurvivalStage: !!row.is_survival_stage,
    isLastChanceQualifier: !!row.is_last_chance_qualifier,
    customColumns: row.custom_columns || undefined,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
};

const mapMatchToDb = (data: any) => {
  return {
    date: data.date || null,
    match_time: data.time || null,
    match_code: data.matchCode || null,
    league: data.league || null,
    total_game: data.totalGame ? String(data.totalGame) : null,
    game_no: data.gameNo ? String(data.gameNo) : null,
    map: data.map || null,
    patch: data.patch || null,
    live_link: data.liveLink || null,
    teams: data.teams || null,
    is_grand_final: !!data.isGrandFinal,
    is_survival_stage: !!data.isSurvivalStage,
    is_last_chance_qualifier: !!data.isLastChanceQualifier,
    custom_columns: data.customColumns || null,
  };
};

// Player Input Panel's daily/weekly/tournament-wide aggregated stats entries - kept in their own
// table, separate from real match results in `matches`.
const mapDailyStatsFromDb = (row: any): DailyStatsEntry => {
  return {
    id: String(row.id),
    league: row.league || "",
    matchCode: row.match_code || "",
    date: row.date || "",
    teams: row.teams || [],
    customColumns: row.custom_columns || undefined,
    isGrandFinal: !!row.is_grand_final,
    isSurvivalStage: !!row.is_survival_stage,
    isLastChanceQualifier: !!row.is_last_chance_qualifier,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
};

const mapDailyStatsToDb = (data: any) => {
  return {
    league: data.league || null,
    match_code: data.matchCode || null,
    date: data.date || null,
    teams: data.teams || null,
    custom_columns: data.customColumns || null,
    is_grand_final: !!data.isGrandFinal,
    is_survival_stage: !!data.isSurvivalStage,
    is_last_chance_qualifier: !!data.isLastChanceQualifier,
  };
};

const mapScheduleFromDb = (row: any): ScheduleEntry => {
  return {
    id: String(row.id),
    league: row.league || "",
    matchCode: row.match_code || "",
    gameNo: row.game_no || "",
    teams: row.teams || [],
    map: row.map || "",
    scheduledAt: row.scheduled_at || "",
    liveLink: row.live_link || "",
    isFinished: !!row.is_finished,
    isGrandFinal: !!row.is_grand_final,
    isSurvivalStage: !!row.is_survival_stage,
    isLastChanceQualifier: !!row.is_last_chance_qualifier,
    createdAt: row.created_at || "",
  };
};

const mapScheduleToDb = (data: any) => {
  return {
    league: data.league || null,
    match_code: data.matchCode || null,
    game_no: data.gameNo || null,
    teams: data.teams || null,
    map: data.map || null,
    scheduled_at: data.scheduledAt || null,
    live_link: data.liveLink || null,
    is_finished: !!data.isFinished,
    is_grand_final: !!data.isGrandFinal,
    is_survival_stage: !!data.isSurvivalStage,
    is_last_chance_qualifier: !!data.isLastChanceQualifier,
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
    previousNames: row.previous_names || [],
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
    previous_names: player.previousNames || [],
  };
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

// Helper: Sort matches by Date, then actual recorded Time, descending. Time (not the Match #/
// gameNo) is the dominant tiebreaker within a day - an organizer reshuffling the schedule (e.g. a
// tournament's last 2 games of Day 1 pushed into Day 2 as its first 2 games) leaves gameNo/
// matchCode reflecting the OLD slot instead of when the game actually happened, so sorting by
// those first showed games out of real chronological order. Falls back to the old totalGame/
// matchCode/gameNo chain only when Time is missing or tied on both sides (e.g. legacy entries
// saved before Time was required, or a genuine same-minute tie). Mirrors server.ts's copy of this
// same helper (the static/GitHub Pages build talks to Supabase directly and never goes through
// server.ts at all, so both copies need to stay in sync).
export const sortMatches = (matches: any[]) => {
  const getNumericValue = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const numMatch = String(val).match(/\d+/);
    return numMatch ? parseInt(numMatch[0], 10) : 0;
  };

  const getTimeMinutes = (val: any): number | null => {
    if (typeof val !== "string" || !val.trim()) return null;
    const parts = val.trim().split(":").map((n) => parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts[0] * 60 + (parts[1] || 0);
  };

  return [...matches].sort((a, b) => {
    const dateA = a.date || "";
    const dateB = b.date || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);

    const timeA = getTimeMinutes(a.time);
    const timeB = getTimeMinutes(b.time);
    if (timeA !== null && timeB !== null) {
      if (timeA !== timeB) return timeB - timeA;
    } else if (timeA !== null || timeB !== null) {
      return timeA !== null ? -1 : 1;
    }

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
    // Reclaim the ID if it was the highest one - lets the next insert reuse it instead of
    // leaving a permanent gap. Best-effort: an old database without this SQL function
    // shouldn't block the delete itself from succeeding.
    try {
      await getBrowserSupabase().rpc("reset_matches_id_seq");
    } catch (e) {}
  },

  getDailyStats: async (): Promise<DailyStatsEntry[]> => {
    const { data: rawRows, error } = await getBrowserSupabase().from("daily_stats").select("*");
    if (error) throw error;
    return sortMatches((rawRows || []).map((r: any) => mapDailyStatsFromDb(r)));
  },

  addDailyStats: async (entry: any): Promise<string> => {
    const dbObj: any = mapDailyStatsToDb(entry);
    dbObj.created_at = new Date().toISOString();
    const { data, error } = await getBrowserSupabase().from("daily_stats").insert([dbObj]).select("id").single();
    if (error) throw error;
    return String(data.id);
  },

  updateDailyStats: async (id: string, entry: any): Promise<void> => {
    const dbObj: any = mapDailyStatsToDb(entry);
    dbObj.updated_at = new Date().toISOString();
    const { error } = await getBrowserSupabase().from("daily_stats").update(dbObj).eq("id", id);
    if (error) throw error;
  },

  deleteDailyStats: async (id: string): Promise<void> => {
    const { error } = await getBrowserSupabase().from("daily_stats").delete().eq("id", id);
    if (error) throw error;
    // Reclaim the ID if it was the highest one - see deleteMatch for the same reasoning.
    try {
      await getBrowserSupabase().rpc("reset_daily_stats_id_seq");
    } catch (e) {}
  },

  getSchedules: async (): Promise<ScheduleEntry[]> => {
    const { data: rawSchedules, error } = await getBrowserSupabase().from("schedules").select("*");
    if (error) throw error;
    return (rawSchedules || []).map((s: any) => mapScheduleFromDb(s));
  },

  addSchedule: async (scheduleData: any): Promise<string> => {
    const dbObj: any = mapScheduleToDb(scheduleData);
    dbObj.created_at = new Date().toISOString();
    const { data, error } = await getBrowserSupabase().from("schedules").insert([dbObj]).select("id").single();
    if (error) throw error;
    return String(data.id);
  },

  updateSchedule: async (id: string, scheduleData: any): Promise<void> => {
    const dbObj: any = mapScheduleToDb(scheduleData);
    const { error } = await getBrowserSupabase().from("schedules").update(dbObj).eq("id", id);
    if (error) throw error;
  },

  deleteSchedule: async (id: string): Promise<void> => {
    const { error } = await getBrowserSupabase().from("schedules").delete().eq("id", id);
    if (error) throw error;
    // Reclaim the ID if it was the highest one - see deleteMatch for the same reasoning.
    try {
      await getBrowserSupabase().rpc("reset_schedules_id_seq");
    } catch (e) {}
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
    // Reclaim the ID if it was the highest one - see deleteMatch for the same reasoning.
    try {
      await getBrowserSupabase().rpc("reset_roster_id_seq");
    } catch (e) {}
  },

  getTournaments: async (): Promise<any[]> => {
    const { data, error } = await getBrowserSupabase().from("tournaments").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map((row: any) => ({ id: row.id, ...(row.data || {}) }));
  },

  // Full sync, matching the server's PUT /api/tournaments behavior: upserts
  // every tournament passed in and deletes any row not present in the list.
  saveTournaments: async (tournaments: any[]): Promise<void> => {
    const nowIso = new Date().toISOString();
    const rows = tournaments.map((t: any) => {
      const { id, ...rest } = t;
      return { id: String(id), data: rest, updated_at: nowIso };
    });
    const { error: upsertError } = await getBrowserSupabase().from("tournaments").upsert(rows, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const keepIds = rows.map((r: any) => r.id);
    const { error: deleteError } = await getBrowserSupabase().from("tournaments").delete().not("id", "in", `(${keepIds.join(",")})`);
    if (deleteError) throw deleteError;
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
