import { Match } from "./types";

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

// Reconciles a raw player-name string back to that player's current roster name, using each
// roster player's registered "previous names" - so stats logged under an old nickname (before a
// rename) still accumulate onto the same player instead of appearing as a separate person. Falls
// back to the trimmed input unchanged when no match is found.
export const canonicalizePlayerName = (
  rawName: string,
  rosterForLeague: { name: string; previousNames?: string[] }[]
): string => {
  const trimmed = (rawName || "").trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();

  const exact = rosterForLeague.find(r => r.name.trim().toLowerCase() === lower);
  if (exact) return exact.name.trim();

  for (const r of rosterForLeague) {
    if ((r.previousNames || []).some(pn => pn.trim().toLowerCase() === lower)) {
      return r.name.trim();
    }
  }

  return trimmed;
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

