import { Match } from "./types";

// Displays a stored date as DD-MM-YYYY (the convention used everywhere on this site), matching
// how the native date input (AddMatchForm) already renders under an id-ID/en-GB locale. Only
// touches strings that actually look like a stored "YYYY-MM-DD" date - passed through unchanged
// otherwise, since some callers reuse the same field for a non-date label (e.g. "Week 1",
// "Sepanjang Turnamen") and those must keep displaying as-is.
export const formatDateDMY = (dateStr?: string | null): string => {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
};

// Compares two league/tournament name strings ignoring surrounding whitespace and casing - this
// exact normalization was previously reinvented inline (or skipped entirely, using a strict `===`)
// in nearly every component, which is the bug pattern behind several past fixes (a match/schedule/
// roster record meaning the same league but saved with a stray space or different casing was
// silently treated as a different league). Centralized here so every filter/lookup stays covered.
export const sameLeague = (a?: string | null, b?: string | null): boolean =>
  (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

export const calculatePlacementPoints = (placement: number): number => {
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

// Match Schedule's date/time is always meant as Indonesia local time (GMT+7, WIB - no DST), the
// tournament's home timezone, regardless of which timezone the admin's own device happens to be
// set to. Stored as a UTC instant (scheduledAt) so the countdown/live logic itself is unaffected,
// and so each viewer's own browser can render it back in their own local time automatically
// (`toLocaleString()` already does this without help) - only the admin-facing input/edit forms
// need to consistently mean GMT+7 rather than "whatever timezone this browser happens to be in".
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;

// Combines a GMT+7 wall-clock date+time into the UTC ISO instant it represents. Parsing
// "YYYY-MM-DDTHH:mm" directly (with no offset) would instead assume the *browser's* local
// timezone - correct only when the admin's device happens to already be set to WIB.
export const gmt7ToIso = (dateStr: string, timeStr: string): string => {
  if (!dateStr || !timeStr) return "";
  const dt = new Date(`${dateStr}T${timeStr}:00+07:00`);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
};

// Splits a UTC ISO instant back into the GMT+7 wall-clock date/time it represents. Reading it via
// Date's local getters (getHours(), getFullYear(), ...) would instead return the *browser's* local
// time - wrong whenever the admin viewing/editing it isn't themselves in WIB.
export const isoToGmt7Parts = (iso: string): { date: string; time: string } | null => {
  if (!iso) return null;
  const utcMs = new Date(iso).getTime();
  if (Number.isNaN(utcMs)) return null;
  const shifted = new Date(utcMs + GMT7_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  };
};

// "+ Add Column" always mints a custom_ key from whatever label is typed, even when that label
// (e.g. "Assist") actually means one of the standard Daily Stats fields (key "assists") that every
// hardcoded save/display/aggregation path elsewhere only ever reads by its real key. Without this,
// a manually re-added "Assist"/"Kill"/etc. column silently strands its data under a look-alike
// custom_ key that nothing else recognizes, and every hardcoded reader of the real key sees 0.
const STANDARD_KEY_BY_COMPACT_LABEL: Record<string, string> = {
  matches: "matchesPlayed", match: "matchesPlayed", matchesplayed: "matchesPlayed",
  kills: "elims", kill: "elims", elim: "elims", elims: "elims",
  damage: "damage",
  assists: "assists", assist: "assists",
  heals: "heals", heal: "heals",
  knock: "knocks", knocks: "knocks", dbno: "knocks", dbnos: "knocks",
  placementpoints: "placementPoints", placementpoint: "placementPoints",
  wwcd: "wwcdCount", wwcdcount: "wwcdCount",
  error: "error", errors: "error"
};

// A custom column's raw storage key can differ across periods even when it means the same stat -
// e.g. an older record saved before column keys were derived from the label, or a fresh "+ Add
// Column" click on a later period's blank record. Re-deriving the key from the label merges those
// back into one column regardless of how each period stored it, without a one-off DB migration.
// Used both when saving a new column (AddMatchForm) and when aggregating past ones (PlayerStats).
export const canonicalCustomKey = (rawKey: string, label: string): string => {
  if (!rawKey.startsWith("custom_")) return rawKey;
  const slug = (label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const standardKey = STANDARD_KEY_BY_COMPACT_LABEL[slug.replace(/_/g, "")];
  if (standardKey) return standardKey;
  return slug ? `custom_${slug}` : rawKey;
};

// Recognizes an "MM:SS" (or "H:MM:SS") value even on a column still marked as plain "string" type -
// e.g. a Survival Time column added before the dedicated Time column type existed.
export const looksLikeTimeValue = (value: any): boolean =>
  typeof value === "string" && /^\d{1,3}:\d{2}(:\d{2})?$/.test(value.trim());

// "Time" columns (e.g. Survival Time) are entered as free text like "18:24" or "1:02:03" - parsed
// to total seconds here so they can be summed like any other numeric stat.
export const parseTimeToSeconds = (value: any): number => {
  if (typeof value !== "string" || !value.trim()) return 0;
  const parts = value.trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
};

// Rewrites a Daily Stats player entry's custom-column keys to their canonical form (see
// canonicalCustomKey above), and converts a "time" column's text value into seconds, before it
// gets aggregated - so every period's copy of "the same" custom column sums into one bucket, and
// Survival Time-style columns can be summed at all. A plain "string" column is left alone (free
// text is never aggregated), unless its actual value looks like a time (see looksLikeTimeValue) -
// handles a Survival Time column saved before the dedicated Time type existed, without needing to
// reopen and re-save it. Used by both PlayerStats (per-period breakdown) and HeadToHead (overall
// comparison) so a manually-added column with a non-standard key (e.g. "Assist" -> custom_assist)
// contributes to both instead of silently reading as 0 in one of them.
export const remapPlayerCustomKeys = (p: any, customColumns?: { key: string; label: string; type: string }[]): any => {
  if (!customColumns || customColumns.length === 0) return p;
  const remapped: any = { ...p };
  customColumns.forEach((col) => {
    if (col.key === "name" || col.key === "team") return;
    if (p[col.key] === undefined) return;
    const isTime = col.type === "time" || (col.type === "string" && looksLikeTimeValue(p[col.key]));
    if (col.type === "string" && !isTime) return;
    const canonicalKey = canonicalCustomKey(col.key, col.label);
    const numericValue = isTime ? parseTimeToSeconds(p[col.key]) : (Number(p[col.key]) || 0);
    if (canonicalKey === col.key) {
      remapped[canonicalKey] = numericValue;
    } else {
      remapped[canonicalKey] = (typeof remapped[canonicalKey] === "number" ? remapped[canonicalKey] : 0) + numericValue;
      delete remapped[col.key];
    }
  });
  return remapped;
};

// Pulls just the Week number out of a matchCode, e.g. "W2D3" -> "Week 2".
// Returns null when no week is encoded (not every league uses a week structure).
export const getMatchWeekLabel = (match: Match): string | null => {
  const code = (match.matchCode || "").toUpperCase();
  const weekMatch = code.match(/W(\d+)/);
  return weekMatch ? `Week ${weekMatch[1]}` : null;
};

// Extracts the canonical list of team names configured for a tournament preset (format-aware:
// single 16-team lobby vs the grouped formats' A-E group lists across all weeks), used to
// reconcile team-name variants (e.g. an abbreviation typed instead of the full name) back to one
// consistent name for stats/standings aggregation.
export const getTournamentTeamList = (preset: any): string[] => {
  if (!preset) return [];
  const teamNames: string[] = [];
  if (preset.format === "16" || !preset.format) {
    teamNames.push(...(preset.teams16Text || "").split("\n").map((t: string) => t.trim()).filter(Boolean));
  } else {
    const groupKeys = [
      "groupAText", "groupBText", "groupCText", "groupDText", "groupEText",
      "groupAText_w2", "groupBText_w2", "groupCText_w2", "groupDText_w2", "groupEText_w2",
      "groupAText_w3", "groupBText_w3", "groupCText_w3", "groupDText_w3", "groupEText_w3"
    ];
    groupKeys.forEach(k => {
      teamNames.push(...(preset[k] || "").split("\n").map((t: string) => t.trim()).filter(Boolean));
    });
  }
  return Array.from(new Set(teamNames));
};

// Maps each team name in a grouped-format tournament (format "20"/"24"/"32" - format "16" is a
// single lobby with no groups) to its configured group letter (A-E), for filtering standings/team
// lists by group. Unioned across every week's group list (groupAText/_w2/_w3, etc.) since most
// leagues keep the same group all season - a team already found under an earlier letter/week keeps
// that one even if a later week's wildcard shuffle moves it, so this reflects a team's "home"
// group rather than tracking week-by-week reshuffles.
export const getTeamGroupMap = (preset: any): Record<string, string> => {
  const map: Record<string, string> = {};
  if (!preset || preset.format === "16" || !preset.format) return map;
  const letters = ["A", "B", "C", "D", "E"];
  const suffixes = ["", "_w2", "_w3"];
  letters.forEach(letter => {
    suffixes.forEach(suffix => {
      const text: string = preset[`group${letter}Text${suffix}`] || "";
      text.split("\n").map(t => t.trim()).filter(Boolean).forEach(team => {
        if (!map[team]) map[team] = letter;
      });
    });
  });
  return map;
};

// Reconciles a raw team-name string (which may be an abbreviation, or differently-cased entry)
// back to the tournament's canonical team name, using the configured team list plus any
// registered ABBR mapping (Squad Roster team ABBR). Falls back to the trimmed input unchanged
// when no match is found, so unrecognized/custom team names still pass through untouched.
export const canonicalizeTeamName = (
  rawName: string,
  teamList: string[],
  teamAbbreviations?: Record<string, string>
): string => {
  const trimmed = (rawName || "").trim();
  if (!trimmed) return trimmed;
  const upper = trimmed.toUpperCase();

  const exact = teamList.find(t => t.toUpperCase().trim() === upper);
  if (exact) return exact;

  if (teamAbbreviations) {
    for (const teamKeyUpper of Object.keys(teamAbbreviations)) {
      if ((teamAbbreviations[teamKeyUpper] || "").toUpperCase().trim() === upper) {
        const canonical = teamList.find(t => t.toUpperCase().trim() === teamKeyUpper);
        if (canonical) return canonical;
      }
    }
  }

  return trimmed;
};

// Resolves a raw player-name (plus the team it was actually recorded under) to the specific
// roster player it belongs to - so two different real people who happen to share a nickname
// (e.g. two players both going by "Shiro" on different teams) are never merged into one person's
// stats, without the admin having to type a fake/modified name for either of them. Also
// reconciles an old nickname (registered as a roster player's "previous name") back to that
// player's current one, so a rename doesn't split their stats in two.
//
// Matching: an exact name (or previous-name) match against exactly one roster player is the
// common case - unambiguous regardless of team (so a player's stats stay together across a
// mid-season transfer). When the SAME name matches more than one roster player, the current team
// recorded on this particular stat breaks the tie. `id` is the identity to group/aggregate by
// (stable and unique even when two players share a name); `name` is what to display.
// Falls back to a synthetic identity (id = the trimmed input) when no roster entry matches at
// all - e.g. a typo, or the roster hasn't been filled in yet - so that data still shows up as its
// own person instead of being silently dropped.
export interface RosterPlayerLike {
  id?: string;
  name: string;
  team?: string;
  previousNames?: string[];
}

export const matchRosterPlayer = (
  rawName: string,
  teamName: string,
  rosterForLeague: RosterPlayerLike[]
): { id: string; name: string } => {
  const trimmed = (rawName || "").trim();
  if (!trimmed) return { id: "", name: "" };
  const lower = trimmed.toLowerCase();
  const teamLower = (teamName || "").trim().toLowerCase();

  const matches = rosterForLeague.filter(r =>
    r.name.trim().toLowerCase() === lower ||
    (r.previousNames || []).some(pn => pn.trim().toLowerCase() === lower)
  );

  if (matches.length === 0) return { id: trimmed, name: trimmed };
  if (matches.length === 1) {
    const only = matches[0];
    return { id: only.id || only.name.trim(), name: only.name.trim() };
  }

  const teamMatch = matches.find(r => (r.team || "").trim().toLowerCase() === teamLower);
  const chosen = teamMatch || matches[0];
  return { id: chosen.id || chosen.name.trim(), name: chosen.name.trim() };
};

export interface LeagueRankStanding {
  team: string;
  totalLeaguePoints: number;
  totalRawPoints: number;
  totalWwcd: number;
  totalPlacementPoints: number;
  totalEliminationPoints: number;
  weeklyPoints: { week: string; rank: number; points: number }[];
}

// League Rank Points: at the end of each week, teams are ranked by that week's total points
// (placement + kills + bonus, summed across that week's matches), and that weekly RANK itself
// (not the raw points) is converted into "League Points" via a tournament-specific table.
// League Points accumulate across weeks, separately from the raw/overall standings total -
// used e.g. to seed a team's Bonus Point going into the Grand Final.
export const calculateLeagueRankStandings = (
  matches: Match[],
  leagueName: string,
  pointsTable: number[],
  tiebreaker: "WWCD-PlacementPoint-Kill" | "WWCD-Kill-PlacementPoint" = "WWCD-PlacementPoint-Kill",
  canonicalizeName: (rawName: string) => string = (n) => n.trim()
): LeagueRankStanding[] => {
  const relevantMatches = matches.filter(m =>
    !m.isDailyStats && !m.isGrandFinal && m.league === leagueName && getMatchWeekLabel(m) !== null
  );

  const byWeek: Record<string, Match[]> = {};
  relevantMatches.forEach(m => {
    const week = getMatchWeekLabel(m) as string;
    if (!byWeek[week]) byWeek[week] = [];
    byWeek[week].push(m);
  });

  const teamAgg: Record<string, LeagueRankStanding> = {};

  Object.entries(byWeek).forEach(([week, weekMatches]) => {
    const weekTeamTotals: Record<string, { totalPoints: number; wwcdCount: number; placementPoints: number; eliminationPoints: number }> = {};

    weekMatches.forEach(m => {
      m.teams.forEach(t => {
        const name = canonicalizeName(t.name.trim());
        if (!name) return;
        if (!weekTeamTotals[name]) {
          weekTeamTotals[name] = { totalPoints: 0, wwcdCount: 0, placementPoints: 0, eliminationPoints: 0 };
        }
        weekTeamTotals[name].totalPoints += Number(t.totalPoints) || 0;
        weekTeamTotals[name].wwcdCount += t.placement === 1 ? 1 : 0;
        weekTeamTotals[name].placementPoints += Number(t.placementPoints) || 0;
        weekTeamTotals[name].eliminationPoints += Number(t.eliminationPoints) || 0;
      });
    });

    const ranked = Object.entries(weekTeamTotals).sort(([, a], [, b]) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.wwcdCount !== a.wwcdCount) return b.wwcdCount - a.wwcdCount;
      if (tiebreaker === "WWCD-PlacementPoint-Kill") {
        if (b.placementPoints !== a.placementPoints) return b.placementPoints - a.placementPoints;
        return b.eliminationPoints - a.eliminationPoints;
      }
      if (b.eliminationPoints !== a.eliminationPoints) return b.eliminationPoints - a.eliminationPoints;
      return b.placementPoints - a.placementPoints;
    });

    ranked.forEach(([teamName, weekStats], idx) => {
      const rank = idx + 1;
      const points = pointsTable[rank - 1] || 0;
      if (!teamAgg[teamName]) {
        teamAgg[teamName] = { team: teamName, totalLeaguePoints: 0, totalRawPoints: 0, totalWwcd: 0, totalPlacementPoints: 0, totalEliminationPoints: 0, weeklyPoints: [] };
      }
      teamAgg[teamName].totalLeaguePoints += points;
      teamAgg[teamName].totalRawPoints += weekStats.totalPoints;
      teamAgg[teamName].totalWwcd += weekStats.wwcdCount;
      teamAgg[teamName].totalPlacementPoints += weekStats.placementPoints;
      teamAgg[teamName].totalEliminationPoints += weekStats.eliminationPoints;
      teamAgg[teamName].weeklyPoints.push({ week, rank, points });
    });
  });

  // Tiebreaker chain: total League Points first (the weekly-rank-to-points conversion), then
  // total raw match points across the league (placement + kills + bonus, summed), then total
  // WWCD, then total Placement Points, then total Eliminations - all accumulated across the
  // whole league (every week), not per-week.
  return Object.values(teamAgg).sort((a, b) => {
    if (b.totalLeaguePoints !== a.totalLeaguePoints) return b.totalLeaguePoints - a.totalLeaguePoints;
    if (b.totalRawPoints !== a.totalRawPoints) return b.totalRawPoints - a.totalRawPoints;
    if (b.totalWwcd !== a.totalWwcd) return b.totalWwcd - a.totalWwcd;
    if (b.totalPlacementPoints !== a.totalPlacementPoints) return b.totalPlacementPoints - a.totalPlacementPoints;
    return b.totalEliminationPoints - a.totalEliminationPoints;
  });
};

// Ranks teams within just the Survival Stage or Last Chance Qualifier matches of one league (same
// points-then-WWCD-then-tiebreaker order as Tournament Standings' own table), so the confirmed top
// N teams there can be carried straight into the next stage's team list instead of an admin
// re-typing them from the Standings screen by hand.
export const calculateStageStandingsOrder = (
  matches: Match[],
  leagueName: string,
  stage: "survival" | "lcq",
  tiebreaker: "WWCD-PlacementPoint-Kill" | "WWCD-Kill-PlacementPoint" = "WWCD-PlacementPoint-Kill",
  canonicalizeName: (rawName: string) => string = (n) => n.trim()
): string[] => {
  const relevantMatches = matches.filter(m =>
    !m.isDailyStats && m.league === leagueName &&
    (stage === "survival" ? m.isSurvivalStage : m.isLastChanceQualifier)
  );

  const teamAgg: Record<string, {
    totalPoints: number;
    wwcdCount: number;
    placementPoints: number;
    eliminationPoints: number;
    matchesPlayed: number;
  }> = {};

  relevantMatches.forEach(m => {
    m.teams.forEach(t => {
      const name = canonicalizeName(t.name.trim());
      if (!name) return;
      if (!teamAgg[name]) {
        teamAgg[name] = { totalPoints: 0, wwcdCount: 0, placementPoints: 0, eliminationPoints: 0, matchesPlayed: 0 };
      }
      const stats = teamAgg[name];
      stats.totalPoints += Number(t.totalPoints) || 0;
      stats.wwcdCount += t.placement === 1 ? 1 : 0;
      stats.placementPoints += Number(t.placementPoints) || 0;
      stats.eliminationPoints += Number(t.eliminationPoints) || 0;
      stats.matchesPlayed += 1;
    });
  });

  return Object.entries(teamAgg)
    .sort(([, a], [, b]) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.wwcdCount !== a.wwcdCount) return b.wwcdCount - a.wwcdCount;
      if (tiebreaker === "WWCD-PlacementPoint-Kill") {
        if (b.placementPoints !== a.placementPoints) return b.placementPoints - a.placementPoints;
        if (b.eliminationPoints !== a.eliminationPoints) return b.eliminationPoints - a.eliminationPoints;
      } else {
        if (b.eliminationPoints !== a.eliminationPoints) return b.eliminationPoints - a.eliminationPoints;
        if (b.placementPoints !== a.placementPoints) return b.placementPoints - a.placementPoints;
      }
      return a.matchesPlayed - b.matchesPlayed;
    })
    .map(([name]) => name);
};

export interface WinProbabilityResult {
  team: string;
  gamesPlayed: number;
  currentPoints: number;
  maxPoints: number;
  winProbability: number; // 0-100, two decimal places
}

// Monte Carlo win probability for a stage's remaining games. Each simulated game, a team's score
// is bootstrap-resampled (drawn with replacement) from its OWN real per-game results so far this
// stage - a team that's been performing consistently well keeps a proportionally higher chance of
// doing so again, instead of every team being treated as equally likely regardless of form so far.
// A team with no real games yet in this stage draws from the whole stage's pooled results instead
// (nothing personal to sample from). "Maximum" points assumes every remaining game goes as well as
// the single best real game recorded so far by ANY team this stage - an empirical ceiling, since
// PUBG Mobile has no fixed kill cap to derive a theoretical one from.
//
// manualTeams: used only when this stage has no real match data recorded yet at all (e.g. a Grand
// Final that hasn't started) - lets the caller supply the participating team list directly instead
// of returning nothing. With no history to bootstrap from, every simulated game instead assigns
// each team a uniformly-random distinct placement (fair since nothing distinguishes them yet),
// converted to points the same way a real placement would be, plus a modest random kill estimate.
export const simulateWinProbability = (
  matches: Match[],
  leagueName: string,
  stage: "group" | "survival" | "lcq" | "final",
  totalGames: number,
  canonicalizeName: (rawName: string) => string = (n) => n.trim(),
  smashRule?: { enabled: boolean; lockAfterGame: number | null; bonus: number },
  simulations: number = 100000,
  manualTeams?: string[],
  startingBonus?: Record<string, number>
): WinProbabilityResult[] => {
  const relevantMatches = matches.filter(m => {
    if (m.isDailyStats || !sameLeague(m.league, leagueName)) return false;
    if (stage === "final") return !!m.isGrandFinal;
    if (stage === "survival") return !!m.isSurvivalStage;
    if (stage === "lcq") return !!m.isLastChanceQualifier;
    return !m.isGrandFinal && !m.isSurvivalStage && !m.isLastChanceQualifier;
  });
  if (!totalGames || totalGames < 1) return [];

  // Distinct games in play order - matchCode+gameNo, not date+gameNo (a postponed match keeps its
  // original Match Code even when played on a later calendar date - see Smash Rule's own note).
  const gameKeyMap = new Map<string, { matchCode: string; gameNo: string; date: string; time: string }>();
  relevantMatches.forEach(m => {
    const key = `${m.matchCode || ""}__${m.gameNo || ""}`;
    if (!gameKeyMap.has(key)) gameKeyMap.set(key, { matchCode: m.matchCode || "", gameNo: m.gameNo || "", date: m.date, time: m.time || "" });
  });
  const timeToMinutes = (t: string): number => {
    if (!t) return Number.MAX_SAFE_INTEGER;
    const parts = t.split(":").map(n => parseInt(n, 10));
    if (parts.some(n => Number.isNaN(n))) return Number.MAX_SAFE_INTEGER;
    return parts[0] * 60 + (parts[1] || 0);
  };
  const gameKeys = Array.from(gameKeyMap.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });

  const teamPool: string[] = [];
  const teamHistory: Record<string, number[]> = {};
  const allPointsPool: number[] = [];
  const currentPoints: Record<string, number> = {};

  gameKeys.forEach(key => {
    relevantMatches
      .filter(m => (m.matchCode || "") === key.matchCode && (m.gameNo || "") === key.gameNo)
      .forEach(m => {
        m.teams.forEach(t => {
          const name = canonicalizeName(t.name.trim());
          if (!name) return;
          const pts = Number(t.totalPoints) || 0;
          if (!teamHistory[name]) { teamHistory[name] = []; teamPool.push(name); currentPoints[name] = 0; }
          teamHistory[name].push(pts);
          allPointsPool.push(pts);
          currentPoints[name] += pts;
        });
      });
  });

  // No real match data recorded for this stage yet - fall back to the manually-supplied team list,
  // starting everyone at 0 with no history to bootstrap from.
  let usingManualTeams = false;
  if (teamPool.length === 0) {
    const manual = (manualTeams || []).map(t => canonicalizeName(t.trim())).filter(Boolean);
    if (manual.length < 2) return [];
    usingManualTeams = true;
    Array.from(new Set(manual)).forEach(name => {
      teamHistory[name] = [];
      teamPool.push(name);
      currentPoints[name] = 0;
    });
  }

  // A one-time starting bonus (e.g. Grand Final's, entered once in Tournament Settings - see
  // grandFinalBonusByTeam) applied on top of each team's baseline exactly once, the same way
  // Standings folds it into the real total - works whether that baseline came from real match
  // history or the manual team list (a fresh Grand Final that hasn't started yet still has a
  // seeded bonus to simulate from).
  if (startingBonus) {
    Object.entries(startingBonus).forEach(([rawName, bonus]) => {
      const name = canonicalizeName(rawName.trim());
      if (!name || !(name in currentPoints)) return;
      currentPoints[name] += Number(bonus) || 0;
    });
  }

  const gamesPlayed = usingManualTeams ? 0 : gameKeys.length;
  const remainingGames = Math.max(0, totalGames - gamesPlayed);
  // With no real games yet, there's no empirical ceiling to draw from - estimate it as a placement-1
  // finish plus a generous kill count instead (matches the same estimate used to simulate a "no
  // history" team's games below).
  const maxPointsPerGame = usingManualTeams ? calculatePlacementPoints(1) + 8 : Math.max(...allPointsPool);

  const results: WinProbabilityResult[] = teamPool.map(name => ({
    team: name,
    gamesPlayed,
    currentPoints: currentPoints[name],
    maxPoints: currentPoints[name] + maxPointsPerGame * remainingGames,
    winProbability: 0
  }));

  const n = teamPool.length;

  // No games left to simulate - today's leader (or whoever already smashed for real) is the
  // deterministic winner, no Monte Carlo needed.
  if (remainingGames === 0) {
    let winnerIdx = 0;
    for (let i = 1; i < n; i++) if (results[i].currentPoints > results[winnerIdx].currentPoints) winnerIdx = i;
    results[winnerIdx].winProbability = 100;
    return results.sort((a, b) => b.currentPoints - a.currentPoints);
  }

  // If the Smash Rule's lock-in game has already been played for real, replay up to it to find the
  // real Match Point target and who's already eligible, so simulations continue from today's actual
  // state instead of re-locking a target from a simulated game that never happens.
  let realMatchPointTarget: number | null = null;
  const realEligible = new Set<string>();
  const useSmash = stage === "final" && !!smashRule?.enabled && !!smashRule.lockAfterGame && smashRule.lockAfterGame >= 1;
  if (useSmash && gamesPlayed >= (smashRule!.lockAfterGame as number)) {
    // Seeded with the same one-time starting bonus already folded into currentPoints, so the real
    // Match Point target lines up with the bonus-inclusive totals Standings shows.
    const runningAtLock: Record<string, number> = {};
    if (startingBonus) {
      Object.entries(startingBonus).forEach(([rawName, teamBonus]) => {
        const name = canonicalizeName(rawName.trim());
        if (!name) return;
        runningAtLock[name] = (runningAtLock[name] || 0) + (Number(teamBonus) || 0);
      });
    }
    for (let g = 0; g < (smashRule!.lockAfterGame as number); g++) {
      const key = gameKeys[g];
      relevantMatches.filter(m => (m.matchCode || "") === key.matchCode && (m.gameNo || "") === key.gameNo).forEach(m => {
        m.teams.forEach(t => {
          const name = canonicalizeName(t.name.trim());
          if (!name) return;
          runningAtLock[name] = (runningAtLock[name] || 0) + (Number(t.totalPoints) || 0);
        });
      });
    }
    realMatchPointTarget = (Object.values(runningAtLock).length > 0 ? Math.max(...Object.values(runningAtLock)) : 0) + (smashRule!.bonus || 0);
    teamPool.forEach(name => { if (currentPoints[name] >= realMatchPointTarget!) realEligible.add(name); });
  }

  const histories = teamPool.map(name => teamHistory[name]);
  const startTotals = teamPool.map(name => currentPoints[name]);
  const startEligible = teamPool.map(name => realEligible.has(name));
  // Which simulated game (1-indexed among the remaining ones) locks the target, if it hasn't
  // locked in reality yet.
  const lockGameOffset = useSmash ? (smashRule!.lockAfterGame as number) - gamesPlayed : -1;

  const wins = new Array(n).fill(0);

  for (let s = 0; s < simulations; s++) {
    const totals = startTotals.slice();
    const eligible = startEligible.slice();
    let target = realMatchPointTarget;
    let champion = -1;

    for (let g = 1; g <= remainingGames; g++) {
      let bestIdx = 0;
      let bestPts = -Infinity;
      const gamePts: number[] = new Array(n);
      if (usingManualTeams) {
        // Nothing to bootstrap from yet - a fair random placement order per simulated game, same
        // points formula a real placement would earn, plus a modest random kill estimate (0-8).
        const order = shuffleArray(teamPool.map((_, i) => i));
        for (let rank = 0; rank < n; rank++) {
          const i = order[rank];
          const pts = calculatePlacementPoints(rank + 1) + Math.floor(Math.random() * 9);
          gamePts[i] = pts;
          if (pts > bestPts) { bestPts = pts; bestIdx = i; }
        }
      } else {
        for (let i = 0; i < n; i++) {
          const pool = histories[i].length > 0 ? histories[i] : allPointsPool;
          const pts = pool[(Math.random() * pool.length) | 0];
          gamePts[i] = pts;
          if (pts > bestPts) { bestPts = pts; bestIdx = i; }
        }
      }

      // A team can only cash in a Match Point threshold it already held BEFORE this game - see the
      // same "eligible for subsequent matches" timing fix applied to the real Smash Rule state.
      if (useSmash && target !== null && champion === -1 && eligible[bestIdx]) {
        champion = bestIdx;
        break;
      }

      for (let i = 0; i < n; i++) totals[i] += gamePts[i];

      if (useSmash && target === null && g === lockGameOffset) {
        let leader = -Infinity;
        for (let i = 0; i < n; i++) if (totals[i] > leader) leader = totals[i];
        target = leader + (smashRule!.bonus || 0);
      }
      if (useSmash && target !== null) {
        for (let i = 0; i < n; i++) if (totals[i] >= target!) eligible[i] = true;
      }
    }

    if (champion === -1) {
      champion = 0;
      for (let i = 1; i < n; i++) if (totals[i] > totals[champion]) champion = i;
    }
    wins[champion]++;
  }

  for (let i = 0; i < n; i++) {
    results[i].winProbability = Math.round((wins[i] / simulations) * 10000) / 100;
  }

  return results.sort((a, b) => b.winProbability - a.winProbability || b.currentPoints - a.currentPoints);
};

// Fisher-Yates shuffle, used to randomize the order advancing teams get carried into the next
// stage's team list - their Survival Stage/LCQ standing rank shouldn't leak into the next lobby's
// seed order.
export const shuffleArray = <T,>(arr: T[]): T[] => {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

