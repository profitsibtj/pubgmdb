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

// Parses "Day N" / "Week N - Day N" out of a matchCode like "D8" or "W2D3" - the session-label
// convention Tournament Standings' "Filter Day" already uses. Week is only included alongside Day
// when both are present, since Day alone would otherwise collide across weeks (W1D1 and W2D1 both
// reading as "Day 1"). Returns null when the matchCode doesn't encode a day number at all.
export const parseMatchCodeDayLabel = (matchCode?: string | null): string | null => {
  const code = (matchCode || "").toUpperCase();
  const weekMatch = code.match(/W(\d+)/);
  const dayMatch = code.match(/\bD(\d+)\b/) || code.match(/D(\d+)/) || code.match(/DAY\s*(\d+)/);
  if (weekMatch && dayMatch) return `Week ${weekMatch[1]} - Day ${dayMatch[1]}`;
  if (dayMatch) return `Day ${dayMatch[1]}`;
  return null;
};

// A Daily Stats record (Player Input Panel) is only ever keyed by calendar date, with no
// matchCode/session-label of its own - so a "day" period there would otherwise always show a raw
// date, inconsistent with Standings' "Day N" labels for the exact same real day. Finds a real
// match (not Daily Stats) in the same league on that date and borrows its Day/Week-Day label;
// falls back to the formatted date itself if no such match exists (e.g. stats logged for a day
// whose match result hasn't been entered yet).
export const getDayLabelForDate = (dateStr: string, leagueName: string, allMatches: Match[]): string => {
  const realMatch = allMatches.find(m => !m.isDailyStats && sameLeague(m.league, leagueName) && m.date === dateStr);
  return parseMatchCodeDayLabel(realMatch?.matchCode) || formatDateDMY(dateStr) || dateStr;
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

// Some teams compete under an entirely different name in another tournament - e.g. a domestic
// squad rebranding as a sponsor's name for a world event ("Bigetron by Vitality" -> "Team
// Vitality") - same roster, different branding per competition. teamAliases (set per-team in
// Squad Roster, on whichever tournament preset that team's "home"/canonical name belongs to) is
// a canonical name -> comma-separated list of the other names it's also known by. Union every
// preset's teamAliases into one global "any known alias -> canonical name" lookup, so a
// cross-league view (Player Stats "ALL Competitions", Comparisons) recognizes it's the same team
// instead of splitting its stats across both names. Unlike teamAbbreviations (per-tournament,
// used to autocorrect a typed abbreviation back to that SAME tournament's own team list), this
// deliberately spans every tournament preset at once.
export const buildGlobalTeamAliasMap = (presets: any[]): Record<string, string> => {
  const map: Record<string, string> = {};
  (presets || []).forEach(preset => {
    const aliases: Record<string, string> | undefined = preset?.teamAliases;
    if (!aliases) return;
    Object.entries(aliases).forEach(([canonicalName, aliasListStr]) => {
      (aliasListStr || "").split(",").map(a => a.trim()).filter(Boolean).forEach(alias => {
        map[alias.toUpperCase()] = canonicalName;
      });
    });
  });
  return map;
};

// Applies the global alias lookup above - a name matching a known alias resolves to its
// canonical form; anything else passes through unchanged.
export const resolveTeamAlias = (name: string, aliasMap: Record<string, string>): string => {
  const trimmed = (name || "").trim();
  if (!trimmed) return trimmed;
  return aliasMap[trimmed.toUpperCase()] || trimmed;
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

// The full cross-tournament team-name pipeline in one call: first reconciles a raw name against
// THIS tournament's own team list/ABBR (canonicalizeTeamName above), then resolves it through the
// global alias lookup (resolveTeamAlias) in case that team goes by a different name in another
// tournament entirely. Used anywhere a raw team name needs resolving across leagues at once -
// Player Stats, Comparisons, PMGC Race - instead of each repeating both steps separately.
export const canonicalizeTeamAcrossTournaments = (
  rawName: string,
  preset: any,
  globalAliasMap: Record<string, string>
): string => {
  const perTournament = preset
    ? canonicalizeTeamName(rawName, getTournamentTeamList(preset), preset.teamAbbreviations)
    : (rawName || "").trim();
  return resolveTeamAlias(perTournament, globalAliasMap);
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

export interface TournamentFinalRank {
  team: string;
  rank: number;
  totalPoints: number;
}

// A tournament's ultimate result: its Grand Final's own final ranking if it has one, otherwise its
// regular-season Overall ranking - the single number a PMGC Race points table converts from.
// Deliberately simpler than Tournament Standings' own filterable table (no map/week/day/group
// filters, no configurable tiebreaker beyond WWCD count) since this only ever wants the whole,
// unfiltered picture of "how did this tournament end". Includes the one-time Grand Final starting
// bonus (grandFinalBonusByTeam) when scored off the Grand Final, matching what Standings shows.
export const calculateTournamentFinalStanding = (
  matches: Match[],
  leagueName: string,
  canonicalizeName: (rawName: string) => string,
  grandFinalBonusByTeam?: Record<string, number>
): TournamentFinalRank[] => {
  const relevant = matches.filter(m => !m.isDailyStats && sameLeague(m.league, leagueName));
  const hasGrandFinal = relevant.some(m => m.isGrandFinal);
  const scoped = relevant.filter(m => hasGrandFinal
    ? !!m.isGrandFinal
    : (!m.isGrandFinal && !m.isSurvivalStage && !m.isLastChanceQualifier));

  const totals: Record<string, number> = {};
  const wwcdCounts: Record<string, number> = {};
  scoped.forEach(m => {
    m.teams.forEach(t => {
      const name = canonicalizeName(t.name.trim());
      if (!name) return;
      totals[name] = (totals[name] || 0) + (Number(t.totalPoints) || 0);
      if (t.placement === 1) wwcdCounts[name] = (wwcdCounts[name] || 0) + 1;
    });
  });

  if (hasGrandFinal && grandFinalBonusByTeam) {
    Object.entries(grandFinalBonusByTeam).forEach(([rawName, bonus]) => {
      const name = canonicalizeName(rawName.trim());
      if (name in totals) totals[name] += Number(bonus) || 0;
    });
  }

  return Object.entries(totals)
    .sort(([nameA, a], [nameB, b]) => {
      if (b !== a) return b - a;
      return (wwcdCounts[nameB] || 0) - (wwcdCounts[nameA] || 0);
    })
    .map(([team, totalPoints], idx) => ({ team, rank: idx + 1, totalPoints }));
};

// Which region a team represents (e.g. "Indonesia"), set per-team in Squad Roster same as
// teamAliases - purely so PMGC Race standings can be grouped/filtered by region. A team's region
// may be typed against whichever tournament's own name it was entered under (canonical or an
// alias), so each entry is run through the same canonicalize+alias pipeline as everything else
// before being unioned, keeping it keyed by the one true global canonical name. First region found
// for a team wins if it was somehow tagged differently in two presets.
export const buildGlobalTeamRegionMap = (presets: any[]): Record<string, string> => {
  const aliasMap = buildGlobalTeamAliasMap(presets);
  const map: Record<string, string> = {};
  (presets || []).forEach(preset => {
    const regions: Record<string, string> | undefined = preset?.teamRegions;
    if (!regions) return;
    Object.entries(regions).forEach(([teamName, region]) => {
      const trimmedRegion = (region || "").trim();
      if (!trimmedRegion) return;
      const canonical = canonicalizeTeamAcrossTournaments(teamName, preset, aliasMap);
      if (!map[canonical]) map[canonical] = trimmedRegion;
    });
  });
  return map;
};

export interface PmgcRaceContribution {
  league: string;
  rank: number;
  points: number;
}

export interface PmgcRaceResult {
  team: string;
  region?: string;
  pmgcPoints: number;
  contributions: PmgcRaceContribution[];
}

// A year's PMGC Race standings: every tournament preset admin-tagged pmgcRaceEnabled for that year
// contributes its own final standing (see calculateTournamentFinalStanding above), converted
// through THAT tournament's own pmgcRacePointsTable, summed per team across every contributing
// tournament - reconciling the same team appearing under a different name in each one via the
// global team-alias lookup (buildGlobalTeamAliasMap), same as Player Stats/Comparisons do.
export const calculatePmgcRaceStandings = (
  matches: Match[],
  tournamentPresets: any[],
  year: string
): PmgcRaceResult[] => {
  const globalAliasMap = buildGlobalTeamAliasMap(tournamentPresets);
  const globalRegionMap = buildGlobalTeamRegionMap(tournamentPresets);
  const contributing = (tournamentPresets || []).filter(t =>
    t.pmgcRaceEnabled && String(t.pmgcRaceYear || "").trim() === String(year).trim()
  );

  const teamTotals: Record<string, PmgcRaceResult> = {};
  contributing.forEach(preset => {
    const canonicalizeName = (raw: string) => canonicalizeTeamAcrossTournaments(raw, preset, globalAliasMap);
    const pointsTable: number[] = preset.pmgcRacePointsTable || [];
    const standing = calculateTournamentFinalStanding(matches, preset.name, canonicalizeName, preset.grandFinalBonusByTeam);

    standing.forEach(({ team, rank }) => {
      const points = pointsTable[rank - 1] || 0;
      if (!teamTotals[team]) teamTotals[team] = { team, region: globalRegionMap[team], pmgcPoints: 0, contributions: [] };
      teamTotals[team].pmgcPoints += points;
      teamTotals[team].contributions.push({ league: preset.name, rank, points });
    });
  });

  return Object.values(teamTotals).sort((a, b) => b.pmgcPoints - a.pmgcPoints);
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

