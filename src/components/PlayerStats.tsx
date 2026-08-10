import React, { useState, useMemo, useEffect } from "react";
import { Match } from "../types";
import { calculatePlacementPoints, getTournamentTeamList, canonicalizeTeamName, matchRosterPlayer, canonicalCustomKey, looksLikeTimeValue, remapPlayerCustomKeys, getTeamGroupMap } from "../utils";
import { RosterPlayer } from "./RosterManager";
import {
  Search, User, Award, Grid, List, Trash2, Lock, ShieldAlert, Pencil, Crown
} from "lucide-react";

// Numeric fields tracked on both the tournament-wide total bucket and each per-period bucket when
// aggregating a Daily Stats record's player entry - kept as one list so the two buckets can't drift
// out of sync (e.g. a per-period bucket silently missing a field the total bucket tracks).
const DAILY_STAT_KEYS = ["elims", "assists", "damage", "knocks", "heals", "wwcdCount", "placementPoints", "error"];

const emptyDailyStatBucket = () => {
  const bucket: Record<string, number> = { matchesCount: 0 };
  DAILY_STAT_KEYS.forEach((k) => { bucket[k] = 0; });
  return bucket;
};

// Adds one Daily Stats player entry's numeric fields into a bucket (either the tournament-wide
// total, or a single period's bucket) - including any extra custom-column keys beyond the standard
// set, so a league that tracks a bespoke stat still accumulates it correctly.
const accumulateDailyStats = (bucket: Record<string, any>, p: any) => {
  bucket.matchesCount += p.matchesPlayed !== undefined ? p.matchesPlayed : 0;
  DAILY_STAT_KEYS.forEach((k) => {
    bucket[k] = (bucket[k] || 0) + (p[k] || 0);
  });
  Object.entries(p).forEach(([k, v]) => {
    if (typeof v === "number" && !["elims", "placementPoints", "wwcdCount", "damage", "assists", "heals", "matchesPlayed", "error"].includes(k)) {
      bucket[k] = (bucket[k] || 0) + v;
    }
  });
};

// Converts a summed seconds total back into a readable "H:MM:SS" (or "M:SS") string for display.
const formatSecondsToTime = (totalSeconds: number): string => {
  const total = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

interface PlayerStatsProps {
  matches: Match[];
  isDarkMode: boolean;
  actionPasswordVerified?: boolean;
  verifyActionPassword?: (password: string) => Promise<boolean>;
  onDeletePlayerStats?: (playerName: string, teamName?: string) => Promise<void>;
  tournaments?: any[];
  roster?: RosterPlayer[];
  // Deep-links into the Player Input Panel to fix an already-posted record (all player stats
  // here originate from that panel's daily/weekly/tournament-wide stats entries).
  onEditPlayerRecord?: (league: string, period: { date?: string; week?: string; tournamentWide?: boolean }) => void;
}

interface MvpAspect {
  key: string;
  label: string;
  weight: number;
}

export const PlayerStats: React.FC<PlayerStatsProps> = ({
  matches,
  isDarkMode,
  actionPasswordVerified = false,
  verifyActionPassword,
  onDeletePlayerStats,
  tournaments,
  roster,
  onEditPlayerRecord
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("ALL");
  const [selectedGroup, setSelectedGroup] = useState("ALL");
  const [selectedLeague, setSelectedLeague] = useState("ALL");
  // "ALL" = the whole tournament's combined total (default). Otherwise scopes the table to a
  // single day/week/tournament-wide record instead of the old side-by-side comparison of every
  // period at once, which turned into an unreadably wide table for a league with many periods
  // recorded (e.g. PMPL ID's many daily records).
  const [periodFilter, setPeriodFilter] = useState<string>("ALL");
  // Defaults to Total Kills so viewers land on the most-watched stat immediately, without having
  // to touch the Sort By dropdown themselves - still freely changeable from there afterward.
  const [sortBy, setSortBy] = useState<string>("elims");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Admin passcode verification modal state
  const [passModal, setPassModal] = useState({ isOpen: false, password: "", error: "", targetPlayerId: "", targetPlayerName: "", targetTeam: "" });

  // Custom delete confirmation modal state
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    playerId: string;
    playerName: string;
    teamName: string;
  }>({
    isOpen: false,
    playerId: "",
    playerName: "",
    teamName: ""
  });

  // Picker shown when a player's stats were posted across more than one daily/weekly record,
  // so the admin chooses which one to jump into and fix.
  const [editPickerModal, setEditPickerModal] = useState<{
    isOpen: boolean;
    playerName: string;
    records: { league: string; date?: string; week?: string; tournamentWide?: boolean; label: string }[];
  }>({ isOpen: false, playerName: "", records: [] });

  // Reset selected team/group/period whenever selected league changes - the available periods and
  // groups differ per league, so a leftover selection from the previous league would otherwise
  // silently match nothing (or the wrong thing, for a group letter that happens to also exist there).
  useEffect(() => {
    setSelectedTeam("ALL");
    setSelectedGroup("ALL");
    setPeriodFilter("ALL");
  }, [selectedLeague]);

  // Extract unique competitions list synced with tournament presets in input match log & matches
  const uniqueLeagues = useMemo(() => {
    const leaguesSet = new Set<string>();
    
    // First retrieve all tournaments configured in the "Input Match Log" tab (tournaments_list_v4)
    if (tournaments && tournaments.length > 0) {
      tournaments.forEach((t: any) => {
        if (t.name) leaguesSet.add(t.name.trim());
      });
    } else {
      const stored = localStorage.getItem("tournaments_list_v4");
      if (stored) {
        try {
          const presets = JSON.parse(stored);
          if (Array.isArray(presets)) {
            presets.forEach((t: any) => {
              if (t.name) leaguesSet.add(t.name.trim());
            });
          }
        } catch (e) {
          console.error("Failed to parse tournaments_list_v4 in PlayerStats", e);
        }
      }
    }

    // Also keep leagues from existing matches to cover any unlisted tournaments
    matches.forEach((m) => {
      if (m.league) leaguesSet.add(m.league.trim());
    });

    return Array.from(leaguesSet).sort();
  }, [tournaments, matches]);

  // The tournament an admin has manually marked "highlighted" (Add New Match Data > Tournament
  // Settings), if any - auto-selected below once (not re-applied if the admin later picks ALL
  // manually) and starred in the dropdown.
  const highlightedLeagueName = useMemo(() => {
    const highlighted = (tournaments || []).find((t: any) => t.highlighted);
    return highlighted?.name || null;
  }, [tournaments]);

  const hasAppliedHighlightDefault = React.useRef(false);
  useEffect(() => {
    if (hasAppliedHighlightDefault.current) return;
    if (highlightedLeagueName && uniqueLeagues.includes(highlightedLeagueName)) {
      setSelectedLeague(highlightedLeagueName);
      hasAppliedHighlightDefault.current = true;
    }
  }, [highlightedLeagueName, uniqueLeagues]);

  // Reconciles team-name variants (e.g. an ABBR typed instead of the full name in Player Input
  // Panel) back to one consistent name per tournament, so the same team never gets silently split
  // into two entries (e.g. "BTR" and "Bigetron by Vitality" showing up as separate squads).
  const presetsByLeague = useMemo(() => {
    const map: Record<string, any> = {};
    (tournaments || []).forEach((t: any) => {
      if (t.name) map[t.name.trim().toLowerCase()] = t;
    });
    return map;
  }, [tournaments]);

  const canonicalizeTeamForMatch = React.useCallback((rawName: string, leagueName: string) => {
    const trimmed = (rawName || "").trim();
    const preset = presetsByLeague[(leagueName || "").trim().toLowerCase()];
    if (!preset) return trimmed;
    return canonicalizeTeamName(trimmed, getTournamentTeamList(preset), preset.teamAbbreviations);
  }, [presetsByLeague]);

  // Resolves a player name (+ the team it was recorded under) back to the specific roster player
  // it belongs to - reconciling a registered previous nickname back to their current name, and
  // disambiguating two different roster players who share a name (e.g. two players both going by
  // "Shiro" on different teams) by team, so their stats never merge into one person.
  const rosterByLeague = useMemo(() => {
    const map: Record<string, RosterPlayer[]> = {};
    (roster || []).forEach((r) => {
      const key = (r.league || "").trim().toLowerCase();
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [roster]);

  const canonicalizePlayerForMatch = React.useCallback((rawName: string, leagueName: string, teamName: string) => {
    const trimmed = (rawName || "").trim();
    const rosterForLeague = rosterByLeague[(leagueName || "").trim().toLowerCase()];
    if (!rosterForLeague) return { id: trimmed, name: trimmed };
    return matchRosterPlayer(trimmed, teamName, rosterForLeague);
  }, [rosterByLeague]);

  // Extract unique teams list that actually played in the selected tournament/league
  const uniqueTeams = useMemo(() => {
    const teamsSet = new Set<string>();
    matches.forEach((m) => {
      // If a tournament filter is active, only collect teams from that tournament
      if (selectedLeague !== "ALL" && (m.league || "").trim().toLowerCase() !== selectedLeague.toLowerCase()) return;
      (m.teams || []).forEach((t) => {
        if (t.name) teamsSet.add(canonicalizeTeamForMatch(t.name, m.league || ""));
      });
    });
    return Array.from(teamsSet).sort();
  }, [matches, selectedLeague, canonicalizeTeamForMatch]);

  // Every distinct Daily Stats input record for the selected league (a day, a week, or a
  // "Sepanjang Turnamen" catch-all) - only meaningful for one specific league at a time, so this
  // stays empty when "ALL" competitions are selected.
  const periodsForLeague = useMemo(() => {
    if (selectedLeague === "ALL") return [];
    const map = new Map<string, { key: string; label: string; sortKey: number }>();
    matches.forEach((m) => {
      if (!m.isDailyStats) return;
      if ((m.league || "").trim().toLowerCase() !== selectedLeague.toLowerCase()) return;
      const code = (m.matchCode || "").toUpperCase();
      const key = m.matchCode || m.date || "unknown";
      if (map.has(key)) return;

      let sortKey: number;
      if (code === "DAILY_TOURNAMENT") {
        sortKey = Number.MAX_SAFE_INTEGER;
      } else if (code.startsWith("DAILY_WEEK")) {
        const weekMatch = code.match(/WEEK(\d+)/);
        sortKey = weekMatch ? parseInt(weekMatch[1], 10) : 0;
      } else {
        sortKey = new Date(m.date || "").getTime() || 0;
      }
      map.set(key, { key, label: m.date || key, sortKey });
    });
    return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey);
  }, [matches, selectedLeague]);


  // Extract dynamic columns from what was actually entered in the Player Input Panel for the
  // selected tournament (via each daily/weekly record's customColumns) - a column that was never
  // configured as an input (e.g. Assist wasn't tracked for this league) is left out entirely
  // instead of always showing a hardcoded 0.
  const dynamicColumns = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; type: "number" | "string" | "time" }>();
    const preferredOrder = ["matchesPlayed", "elims", "damage", "assists"];
    const preferredLabels: Record<string, string> = {
      matchesPlayed: "Match Played", elims: "Kills", damage: "Damage", assists: "Assist"
    };

    matches.forEach((m) => {
      if (!m.isDailyStats) return;
      if (selectedLeague !== "ALL" && (m.league || "").trim().toLowerCase() !== selectedLeague.toLowerCase()) return;

      const cols = m.customColumns;
      if (cols && cols.length > 0) {
        cols.forEach((c) => {
          if (c.key === "name" || c.key === "team") return;
          const canonicalKey = canonicalCustomKey(c.key, c.label);
          // Detect a legacy "string" column that's actually time-formatted (see looksLikeTimeValue)
          // so its displayed type stays consistent with how remapPlayerCustomKeys aggregates it,
          // regardless of which period's (possibly still-unfixed) column type gets scanned first.
          const sampleValue = (m.teams || []).flatMap((t) => t.players || []).find((p: any) => p[c.key] !== undefined)?.[c.key];
          const effectiveType = c.type === "string" && looksLikeTimeValue(sampleValue) ? "time" : c.type;
          const existing = seen.get(canonicalKey);
          if (existing && (existing.type === "time" || effectiveType !== "time")) return;
          seen.set(canonicalKey, { key: canonicalKey, label: c.label, type: effectiveType });
        });
      } else {
        // Older records saved before customColumns was persisted: assume the historical defaults.
        ["matchesPlayed", "elims", "damage"].forEach((k) => {
          if (!seen.has(k)) seen.set(k, { key: k, label: preferredLabels[k], type: "number" });
        });
      }
    });

    const known = preferredOrder.filter((k) => seen.has(k)).map((k) => seen.get(k)!);
    const extra = Array.from(seen.values()).filter((c) => !preferredOrder.includes(c.key));
    return [...known, ...extra];
  }, [matches, selectedLeague]);

  // MVP Score formula: a per-league weighted sum of "this player's share of the league's total for
  // a stat" (e.g. Kills, Damage). Configured from Add New Match Data's Tournament Settings (admin
  // only, since only admins can enter the underlying data anyway) - this component only reads it.
  const activeLeaguePreset = selectedLeague !== "ALL" ? presetsByLeague[selectedLeague.trim().toLowerCase()] : null;
  const mvpFormula: MvpAspect[] = activeLeaguePreset?.mvpFormula || [];

  // Team name -> group letter (A-E), for the "Filter Group" control below - same opt-in as Match
  // Standings (Tournament Settings > "Enable Group Standings Filter"), so this only shows up once
  // Group A-E's team lists are actually being kept up to date for this league.
  const teamGroupMap = useMemo(() => {
    if (!activeLeaguePreset?.groupStandingsEnabled) return {};
    return getTeamGroupMap(activeLeaguePreset);
  }, [activeLeaguePreset]);
  const groupsList = useMemo(() => {
    const letters = Array.from(new Set(Object.values(teamGroupMap))).sort();
    return letters.length > 0 ? ["ALL", ...letters] : [];
  }, [teamGroupMap]);

  // Extract all individual player match records across all teams & games
  const playerStats = useMemo(() => {
    const stats: { [id: string]: any } = {};

    matches.forEach((m) => {
      // Filter by league/competition (case-insensitive & trimmed)
      if (selectedLeague !== "ALL" && (m.league || "").trim().toLowerCase() !== selectedLeague.toLowerCase()) return;

      (m.teams || []).forEach((t) => {
        const teamName = canonicalizeTeamForMatch(t.name, m.league || "");
        // Filter by team
        if (selectedTeam !== "ALL" && teamName !== selectedTeam) return;
        // Filter by group
        if (selectedGroup !== "ALL" && teamGroupMap[teamName] !== selectedGroup) return;

        (t.players || []).forEach((p) => {
          const identity = canonicalizePlayerForMatch(p.name.trim(), m.league || "", t.name || "");
          const { id, name } = identity;
          if (!id) return;

          if (!stats[id]) {
            stats[id] = {
              id,
              name,
              role: p.role || "Player",
              teamName: teamName || "",
              matchesCount: 0,
              elims: 0,
              assists: 0,
              damage: 0,
              knocks: 0,
              heals: 0,
              mvpCount: 0,
              wwcdCount: 0,
              totalSurvivalSeconds: 0,
              primaryWeapon: p.weapon || "M416",
              weapons: {},
              matchesList: [],
              placementPoints: 0,
              error: 0,
              // Per-input-period breakdown (one entry per Daily Stats record: a day, a week, or a
              // "Sepanjang Turnamen" catch-all) - lets Player Stats show each period side by side
              // instead of only ever showing one grand total.
              periods: {} as Record<string, any>
            };
          }

          const ps = stats[id];
          if (m.isDailyStats) {
            const canonicalPlayer = remapPlayerCustomKeys(p, m.customColumns);
            accumulateDailyStats(ps, canonicalPlayer);

            const periodKey = m.matchCode || m.date || "unknown";
            if (!ps.periods[periodKey]) {
              ps.periods[periodKey] = emptyDailyStatBucket();
            }
            accumulateDailyStats(ps.periods[periodKey], canonicalPlayer);
          } else {
            ps.matchesCount += 1;
            ps.elims += p.elims || 0;
            ps.assists += p.assists || 0;
            ps.damage += p.damage || 0;
            ps.knocks += p.knocks || 0;
            ps.heals += p.heals || 0;
            ps.error += p.error || 0;
            if (p.mvp) ps.mvpCount += 1;
            if (t.placement === 1) ps.wwcdCount += 1;

            const placementPts = Number(t.placementPoints) || (t.placement ? calculatePlacementPoints(t.placement) : 0);
            ps.placementPoints += placementPts;
          }
          ps.teamName = teamName || ps.teamName;

          // Parse survival time (MM:SS) to seconds
          const parts = (p.survivalTime || "15:00").split(":");
          if (parts.length === 2) {
            ps.totalSurvivalSeconds += (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
          } else {
            ps.totalSurvivalSeconds += parseInt(p.survivalTime, 10) || 900;
          }

          // Count weapons used
          if (p.weapon) {
            ps.weapons[p.weapon] = (ps.weapons[p.weapon] || 0) + 1;
          }

          const matchCodeStr = m.matchCode || "";
          if (matchCodeStr !== "DAILY_20260718 (All Maps)" && !matchCodeStr.includes("DAILY_20260718")) {
            ps.matchesList.push({
              date: m.date,
              matchCode: m.matchCode,
              map: m.map,
              teamName: t.name,
              placement: t.placement || 16,
              wwcd: m.isDailyStats ? (p.wwcdCount ? p.wwcdCount > 0 : false) : (t.placement === 1),
              elims: p.elims || 0,
              damage: p.damage || 0,
              mvp: !!p.mvp,
              weapon: p.weapon || "M416"
            });
          }
        });
      });
    });

    // Squad Roster is registered per league, so the same real player recorded under two different
    // tournaments (e.g. "Firen" on RRQ Ryu in both PMPL ID and PMWC) resolves to two different
    // roster ids above, and would otherwise show up as two separate rows even here in the
    // combined "ALL" view. Collapse same name+team entries into one merged total instead - scoped
    // to "ALL" only, so a single league's view (and its Shiro-style same-name-different-team
    // disambiguation) is completely untouched.
    const statsById = selectedLeague !== "ALL" ? stats : (() => {
      const merged: Record<string, any> = {};
      Object.values(stats).forEach((p: any) => {
        const key = `${p.name.trim().toLowerCase()}|${(p.teamName || "").trim().toLowerCase()}`;
        if (!merged[key]) {
          merged[key] = { ...p, weapons: { ...p.weapons }, matchesList: [...(p.matchesList || [])] };
          return;
        }
        const target = merged[key];
        Object.entries(p).forEach(([k, v]) => {
          if (typeof v === "number") target[k] = (target[k] || 0) + v;
        });
        target.matchesList = target.matchesList.concat(p.matchesList || []);
        Object.entries(p.weapons || {}).forEach(([w, count]: [string, any]) => {
          target.weapons[w] = (target.weapons[w] || 0) + count;
        });
      });
      return merged;
    })();

    // Final calculations
    const eligiblePlayers = Object.values(statsById).filter((p: any) => p.matchesCount > 0);

    // MVP Score totals: each aspect's league-wide sum, used as the denominator for every player's
    // "share" of that stat. Computed once here instead of per-player.
    const mvpTotals: Record<string, number> = {};
    mvpFormula.forEach((aspect) => {
      mvpTotals[aspect.key] = eligiblePlayers.reduce((sum, p: any) => sum + (Number(p[aspect.key]) || 0), 0);
    });

    return eligiblePlayers.map((p: any) => {
      // Find primary weapon
      let bestWeapon = p.primaryWeapon;
      let maxCount = 0;
      Object.entries(p.weapons || {}).forEach(([w, count]: [string, any]) => {
        if (count > maxCount) {
          maxCount = count;
          bestWeapon = w;
        }
      });

      // Calculate total points based on standard PUBGM scoring (Kills + Placement Points)
      const totalPoints = p.elims + p.placementPoints;

      const mvpScore = mvpFormula.length > 0
        ? mvpFormula.reduce((sum, aspect) => {
            const total = mvpTotals[aspect.key] || 0;
            const share = total > 0 ? (Number(p[aspect.key]) || 0) / total : 0;
            return sum + share * aspect.weight;
          }, 0)
        : null;

      return {
        ...p,
        primaryWeapon: bestWeapon,
        avgElims: p.matchesCount > 0 ? Math.round((p.elims / p.matchesCount) * 10) / 10 : 0,
        avgDamage: p.matchesCount > 0 ? Math.round(p.damage / p.matchesCount) : 0,
        avgSurvival: p.matchesCount > 0 ? Math.round(p.totalSurvivalSeconds / p.matchesCount) : 0,
        avgHeals: p.matchesCount > 0 ? Math.round((p.heals / p.matchesCount) * 10) / 10 : 0,
        avgKnocks: p.matchesCount > 0 ? Math.round((p.knocks / p.matchesCount) * 10) / 10 : 0,
        mvpRate: p.matchesCount > 0 ? Math.round((p.mvpCount / p.matchesCount) * 100) : 0,
        wwcdRate: p.matchesCount > 0 ? Math.round((p.wwcdCount / p.matchesCount) * 100) : 0,
        totalPoints: Math.round(totalPoints * 10) / 10,
        mvpScore: mvpScore !== null ? Math.round(mvpScore * 1000) / 1000 : null
      };
    });
  }, [matches, selectedLeague, selectedTeam, selectedGroup, teamGroupMap, canonicalizeTeamForMatch, canonicalizePlayerForMatch, mvpFormula]);

  // When a specific day/week/tournament-wide period is picked (instead of "ALL"/Keseluruhan),
  // swap each player's totals for just that one record's numbers and drop anyone who didn't
  // appear in it - one clean set of columns either way, instead of comparing every period side by
  // side in one increasingly wide table as a league racks up more recorded days.
  const periodScopedPlayers = useMemo(() => {
    if (periodFilter === "ALL") return playerStats;
    return playerStats
      .map((p: any) => {
        const bucket = p.periods ? p.periods[periodFilter] : undefined;
        const matchesCount = bucket?.matchesCount || 0;
        if (!bucket || matchesCount === 0) return null;
        const elims = bucket.elims || 0;
        const damage = bucket.damage || 0;
        const placementPoints = bucket.placementPoints || 0;
        return {
          ...p,
          ...bucket,
          matchesCount,
          avgElims: Math.round((elims / matchesCount) * 10) / 10,
          avgDamage: Math.round(damage / matchesCount),
          avgHeals: Math.round(((bucket.heals || 0) / matchesCount) * 10) / 10,
          avgKnocks: Math.round(((bucket.knocks || 0) / matchesCount) * 10) / 10,
          wwcdRate: Math.round(((bucket.wwcdCount || 0) / matchesCount) * 100),
          totalPoints: Math.round((elims + placementPoints) * 10) / 10,
          // MVP Score is a whole-tournament relative share (each stat's share of the league total)
          // - not meaningful scoped to a single period, so it's hidden rather than shown misleadingly.
          mvpScore: null
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [playerStats, periodFilter]);

  const filteredPlayers = useMemo(() => {
    return periodScopedPlayers
      .filter((p) => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === "matchesPlayed" || sortBy === "matches") {
          return b.matchesCount - a.matchesCount;
        }

        const valA = (a as any)[sortBy] !== undefined ? (a as any)[sortBy] : 0;
        const valB = (b as any)[sortBy] !== undefined ? (b as any)[sortBy] : 0;

        if (valB !== valA) return valB - valA;
        // Tie on Kills: higher Damage ranks first
        if (sortBy === "elims") return (b.damage || 0) - (a.damage || 0);
        return 0;
      });
  }, [periodScopedPlayers, searchTerm, sortBy]);

  // The gold/crown MVP highlight in the table must mark whoever actually has the highest MVP
  // Score, not just row #1 of whatever column the table happens to be sorted by right now - those
  // are only the same player when sortBy is already "mvpScore", so leaving it at index === 0 would
  // crown the wrong player whenever sorting by e.g. Kills or Damage instead.
  const topMvpScore = useMemo(() => {
    const scores = filteredPlayers.map(p => p.mvpScore).filter((s): s is number => s !== null && s !== undefined);
    return scores.length > 0 ? Math.max(...scores) : null;
  }, [filteredPlayers]);

  // Keep the current sort selection valid if its column disappears (e.g. switching to a
  // league/team where that stat was never entered), or if it stops making sense (MVP Score is a
  // whole-tournament share, not meaningful once scoped to a single day/week via Filter Period)
  useEffect(() => {
    if (sortBy === "matchesPlayed") return;
    if (sortBy === "mvpScore") {
      if (mvpFormula.length === 0 || periodFilter !== "ALL") setSortBy("matchesPlayed");
      return;
    }
    if (!dynamicColumns.some((c) => c.key === sortBy)) {
      setSortBy("matchesPlayed");
    }
  }, [dynamicColumns, sortBy, mvpFormula.length, periodFilter]);

  const handleDeleteClick = (player: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionPasswordVerified) {
      setDeleteConfirmModal({
        isOpen: true,
        playerId: player.id,
        playerName: player.name,
        teamName: player.teamName || ""
      });
    } else {
      setPassModal({ isOpen: true, password: "", error: "", targetPlayerId: player.id, targetPlayerName: player.name, targetTeam: player.teamName || "" });
    }
  };

  // Every player stat here comes from a daily/weekly record saved in the Player Input Panel -
  // find every such record that already lists this player, so "Edit" can deep-link right to it.
  const getPlayerDailyRecords = (playerId: string) => {
    // Matched by the same team-aware identity the table itself uses, so two different roster
    // players who happen to share a name (see matchRosterPlayer) never get mixed into each
    // other's records here.
    const records: { league: string; date?: string; week?: string; tournamentWide?: boolean; label: string }[] = [];
    matches.forEach(m => {
      if (!m.isDailyStats) return;
      const hasPlayer = (m.teams || []).some(t => (t.players || []).some(p => canonicalizePlayerForMatch(p.name.trim(), m.league || "", t.name || "").id === playerId));
      if (!hasPlayer) return;
      const code = (m.matchCode || "").toUpperCase();
      const isWeekRecord = code.startsWith("DAILY_WEEK");
      const isTournamentWide = code === "DAILY_TOURNAMENT";
      records.push({
        league: m.league || "",
        date: isWeekRecord || isTournamentWide ? undefined : m.date,
        week: isWeekRecord ? m.date : undefined,
        tournamentWide: isTournamentWide,
        label: `${m.league || "-"} • ${m.date || "-"}`
      });
    });
    return records;
  };

  const handleEditClick = (player: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const records = getPlayerDailyRecords(player.id);
    if (records.length === 0) return;
    if (records.length === 1) {
      if (onEditPlayerRecord) onEditPlayerRecord(records[0].league, { date: records[0].date, week: records[0].week, tournamentWide: records[0].tournamentWide });
      return;
    }
    setEditPickerModal({ isOpen: true, playerName: player.name, records });
  };

  const handleVerifyPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyActionPassword || !onDeletePlayerStats) return;
    const isOk = await verifyActionPassword(passModal.password);
    if (isOk) {
      const pId = passModal.targetPlayerId;
      const pName = passModal.targetPlayerName;
      const pTeam = passModal.targetTeam;
      setPassModal({ isOpen: false, password: "", error: "", targetPlayerId: "", targetPlayerName: "", targetTeam: "" });
      setDeleteConfirmModal({
        isOpen: true,
        playerId: pId,
        playerName: pName,
        teamName: pTeam
      });
    } else {
      setPassModal(prev => ({ ...prev, error: "Incorrect password or insufficient admin authority." }));
    }
  };

  return (
    <div className="space-y-6">
      {/* FILTER PANEL */}
      <div className={`p-5 rounded-2xl flex flex-col gap-4 transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200 shadow-sm"
      }`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
          {/* Player Search Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">SEARCH PRO PLAYER:</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Type pro player name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              />
            </div>
          </div>

          {/* Competition Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">SELECT LEAGUE/COMPETITION:</label>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
              }`}
            >
              <option value="ALL">-- ALL COMPETITIONS --</option>
              {uniqueLeagues.map((league) => (
                <option key={league} value={league}>{league === highlightedLeagueName ? `★ ${league}` : league}</option>
              ))}
            </select>
          </div>

          {/* Team Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">SELECT TEAM/SQUAD:</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              disabled={selectedLeague === "ALL"}
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer transition-all ${
                selectedLeague === "ALL"
                  ? `opacity-50 cursor-not-allowed text-slate-400 ${isDarkMode ? "bg-slate-900" : "bg-slate-100"}`
                  : isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
              }`}
            >
              {selectedLeague === "ALL" ? (
                <option value="ALL">-- SELECT LEAGUE FIRST --</option>
              ) : (
                <>
                  <option value="ALL">-- ALL SQUADS --</option>
                  {uniqueTeams.map((team) => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Group Dropdown - only shown once this league has "Enable Group Standings Filter"
              turned on (same opt-in Tournament Settings uses), same reasoning as there: an
              incomplete/stale Group A-E roster would otherwise misleadingly show a near-empty group. */}
          {groupsList.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">FILTER GROUP:</label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              >
                {groupsList.map((g) => (
                  <option key={g} value={g}>{g === "ALL" ? "-- ALL GROUPS --" : `Group ${g}`}</option>
                ))}
              </select>
            </div>
          )}

          {/* Period Dropdown - "Keseluruhan" (ALL) is the whole tournament's combined total;
              otherwise scopes the table to just one recorded day/week/tournament-wide record. */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">VIEW PERIOD:</label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              disabled={selectedLeague === "ALL" || periodsForLeague.length === 0}
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer transition-all ${
                selectedLeague === "ALL" || periodsForLeague.length === 0
                  ? `opacity-50 cursor-not-allowed text-slate-400 ${isDarkMode ? "bg-slate-900" : "bg-slate-100"}`
                  : isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
              }`}
            >
              {selectedLeague === "ALL" ? (
                <option value="ALL">-- SELECT LEAGUE FIRST --</option>
              ) : periodsForLeague.length === 0 ? (
                <option value="ALL">-- NO PERIODS RECORDED --</option>
              ) : (
                <>
                  <option value="ALL">-- KESELURUHAN (TOTAL) --</option>
                  {periodsForLeague.map((period) => (
                    <option key={period.key} value={period.key}>{period.label}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">SORT BY:</label>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
              }`}
            >
              {dynamicColumns.map((col) => (
                <option key={col.key} value={col.key}>
                  {col.key === "matchesPlayed" ? col.label.toUpperCase() : `TOTAL ${col.label.toUpperCase()}`}
                </option>
              ))}
              {mvpFormula.length > 0 && periodFilter === "ALL" && (
                <option value="mvpScore">MVP Score</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* STANDINGS SUB-HEADER CONTROLS */}
      <div className={`p-4 rounded-2xl flex justify-between items-center flex-wrap gap-2 transition-all ${
        isDarkMode ? "bg-slate-900/40 border border-slate-800/80" : "bg-white border border-slate-200 shadow-sm"
      }`}>
        <div>
          <h3 className="text-xs font-extrabold uppercase text-amber-500 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" />
            Player Stats
          </h3>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 border border-slate-800/20 p-1 rounded-xl bg-slate-950/20">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === "table" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Standings Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === "grid" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Detail Card</span>
            </button>
          </div>
        </div>
      </div>

      {/* PLAYERS LISTING */}
      <div>
        {playerStats.length === 0 ? (
          <div className={`py-16 px-6 text-center rounded-2xl flex flex-col items-center justify-center gap-3 ${
            isDarkMode ? "bg-slate-900/50 text-slate-400" : "bg-white border border-slate-200 text-slate-600"
          }`}>
            <User className="w-10 h-10 text-amber-500/80 mb-2 animate-pulse" />
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">Player-Level Stats Disabled</p>
            <p className="max-w-md text-[11px] leading-relaxed text-slate-500 font-mono">
              The tracking system has been simplified to only log team performance (Eliminations & Placement) without individual pro player stat details per game.
            </p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className={`py-12 text-center font-mono text-xs rounded-2xl ${
            isDarkMode ? "bg-slate-900/50 text-slate-500" : "bg-white border border-slate-200 text-slate-600"
          }`}>
            No players match the filter criteria.
          </div>
        ) : viewMode === "table" ? (
          /* SPREADSHEET STANDINGS TABLE VIEW */
          <div className={`rounded-2xl overflow-hidden border transition-all ${
            isDarkMode ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200 shadow-sm"
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className={`border-b text-[10px] uppercase font-bold tracking-wider ${
                    isDarkMode ? "bg-slate-900/50 border-slate-800 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-500"
                  }`}>
                    <th className={`py-3 px-4 text-center w-12 sticky left-0 z-10 ${isDarkMode ? "bg-slate-900/50" : "bg-slate-100"}`}>#</th>
                    <th className={`py-3 px-4 sticky left-12 z-10 ${isDarkMode ? "bg-slate-900/50" : "bg-slate-100"}`}>Player Name</th>
                    <th className="py-3 px-4">Team</th>
                    {dynamicColumns.map(col => (
                      <th key={col.key} className="py-3 px-4 text-center min-w-[80px] uppercase">
                        {col.label}
                      </th>
                    ))}
                    {mvpFormula.length > 0 && periodFilter === "ALL" && (
                      <th className="py-3 px-4 text-center w-24 text-amber-500 uppercase">MVP Score</th>
                    )}
                    {actionPasswordVerified && (
                      <th className="py-3 px-4 text-center w-36 text-red-500 font-extrabold uppercase tracking-wider">Admin Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {filteredPlayers.map((p, index) => {
                    return (
                      <React.Fragment key={p.id}>
                        <tr 
                          className={`transition-all ${
                            isDarkMode 
                              ? "text-slate-300 hover:bg-slate-900/20 border-b border-slate-900/50" 
                              : "text-slate-700 hover:bg-slate-50 border-b border-slate-200"
                          }`}
                        >
                          {/* Rank # - sticky (with Player Name below) so both stay visible when
                              scrolling right through period columns */}
                          <td className={`py-3 px-4 text-center font-bold sticky left-0 z-10 ${isDarkMode ? "bg-slate-950" : "bg-white"}`}>
                            {index === 0 ? (
                              <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-amber-500 text-slate-950 font-extrabold text-[10px]">1</span>
                            ) : index === 1 ? (
                              <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-slate-300 text-slate-950 font-extrabold text-[10px]">2</span>
                            ) : index === 2 ? (
                              <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-amber-700/50 text-slate-100 font-extrabold text-[10px]">3</span>
                            ) : (
                              <span>{index + 1}</span>
                            )}
                          </td>
                          {/* Player Name */}
                          <td className={`py-3 px-4 font-bold sticky left-12 z-10 ${isDarkMode ? "bg-slate-950" : "bg-white"}`}>
                            <span className="tracking-tight">{p.name}</span>
                          </td>
                          {/* Team name - clamped to 2 lines so a long team name doesn't grow this
                              row taller than its neighbors and throw off row alignment */}
                          <td className="py-3 px-4 font-semibold text-slate-300 max-w-[160px]">
                            <span className="tracking-tight text-slate-300 line-clamp-2 break-words">{p.teamName || "-"}</span>
                          </td>
                          {/* Dynamic columns values - the league/team-wide total, or (with a
                              specific day/week/tournament-wide period picked via Filter Period)
                              just that one period's numbers instead. */}
                          {dynamicColumns.map(col => {
                            if (col.key === "matchesPlayed") {
                              return (
                                <td key={col.key} className="py-3 px-4 text-center font-semibold text-slate-400">
                                  {p.matchesCount}
                                </td>
                              );
                            }
                            const total = p[col.key] !== undefined ? p[col.key] : 0;
                            const avg = p.matchesCount > 0 ? Math.round((total / p.matchesCount) * 10) / 10 : 0;
                            return (
                                <td key={col.key} className="py-3 px-4 text-center">
                                  <span className={`font-extrabold ${
                                    col.key === "elims" ? "text-slate-200" :
                                    col.key === "damage" ? "text-teal-400" :
                                    col.key === "assists" ? "text-indigo-400" :
                                    "text-amber-400"
                                  }`}>
                                    {col.type === "time" ? formatSecondsToTime(total) : total}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block">avg: {col.type === "time" ? formatSecondsToTime(avg) : avg}</span>
                                </td>
                            );
                          })}
                          {/* MVP Score - gold/crown only for whoever actually has the highest MVP
                              Score, regardless of which column the table is currently sorted by */}
                          {mvpFormula.length > 0 && periodFilter === "ALL" && (() => {
                            const isTopMvp = topMvpScore !== null && p.mvpScore === topMvpScore;
                            return (
                              <td className={`py-3 px-4 text-center font-extrabold ${isTopMvp ? "text-amber-400" : "text-slate-300"}`}>
                                {isTopMvp && <Crown className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-amber-400" />}
                                {p.mvpScore ?? "-"}
                              </td>
                            );
                          })()}
                          {/* Admin Actions */}
                          {actionPasswordVerified && (
                            <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => handleEditClick(p, e)}
                                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400 font-mono font-extrabold text-[10px] tracking-wide uppercase transition-all duration-200 cursor-pointer inline-flex items-center gap-1.5 shadow-md"
                                  title="Edit Already Posted Player Stats Data"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteClick(p, e)}
                                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white border border-red-500 font-mono font-extrabold text-[10px] tracking-wide uppercase transition-all duration-200 cursor-pointer inline-flex items-center gap-1.5 shadow-md hover:shadow-red-900/20"
                                  title="Delete All Player Stats Data"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete Player</span>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* GRID DETAIL CARD VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {filteredPlayers.map((p) => {
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl p-5 border transition-all relative overflow-hidden shadow-sm ${
                    isDarkMode
                      ? "bg-slate-900/40 border-slate-800"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <div>
                    <h3 className={`font-bold text-sm font-mono tracking-tight flex items-center gap-1.5 ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mt-0.5">
                      {p.teamName && <span className="text-slate-400 font-bold">{p.teamName}</span>}
                    </div>
                  </div>

                  {/* Rating point display */}
                  <div className="mt-4 px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-800/40 flex justify-between items-center font-mono">
                    <span className="text-[9px] uppercase font-bold text-slate-400">Total Score Rating:</span>
                    <span className="text-amber-500 font-extrabold text-xs">{p.totalPoints} pts</span>
                  </div>

                  {mvpFormula.length > 0 && p.mvpScore !== null && p.mvpScore !== undefined && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/20 flex justify-between items-center font-mono">
                      <span className="text-[9px] uppercase font-bold text-amber-500 flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        MVP Score:
                      </span>
                      <span className="text-amber-400 font-extrabold text-xs">{p.mvpScore}</span>
                    </div>
                  )}

                  {/* Core parameters stats bar - only shows columns actually tracked for this league */}
                  <div className={`grid gap-2 mt-4 border-t border-b border-slate-800/50 py-3.5 font-mono text-center ${
                    dynamicColumns.some((c) => c.key === "assists") ? "grid-cols-4" : "grid-cols-3"
                  }`}>
                    <div>
                      <div className="text-[8px] text-slate-500 uppercase font-bold tracking-tight">MATCHES</div>
                      <div className="text-xs font-extrabold text-slate-200 mt-1">{p.matchesCount}</div>
                    </div>
                    <div>
                      <div className="text-[8px] text-slate-500 uppercase font-bold tracking-tight">KILLS</div>
                      <div className="text-xs font-extrabold text-amber-500 mt-1">{p.elims}</div>
                      <div className="text-[8px] text-slate-500">Avg: {p.avgElims}</div>
                    </div>
                    <div>
                      <div className="text-[8px] text-slate-500 uppercase font-bold tracking-tight">DMG</div>
                      <div className="text-xs font-extrabold text-teal-400 mt-1">{p.damage}</div>
                      <div className="text-[8px] text-slate-500">Avg: {p.avgDamage}</div>
                    </div>
                    {dynamicColumns.some((c) => c.key === "assists") && (
                      <div>
                        <div className="text-[8px] text-slate-500 uppercase font-bold tracking-tight">AST</div>
                        <div className="text-xs font-extrabold text-indigo-400 mt-1">{p.assists}</div>
                        <div className="text-[8px] text-slate-500">Avg: {p.matchesCount > 0 ? Math.round((p.assists / p.matchesCount) * 10) / 10 : 0}</div>
                      </div>
                    )}
                  </div>

                  {/* Admin Actions */}
                  {actionPasswordVerified && (
                    <div className="mt-4 pt-3 border-t border-slate-800/20 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleEditClick(p, e)}
                        className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400 font-mono font-extrabold text-[11px] tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(p, e)}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white border border-red-500 font-mono font-extrabold text-[11px] tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-md hover:shadow-red-900/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ADMIN ACTION PASSCODE MODAL */}
      {passModal.isOpen && (
        <div className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-colors duration-200 ${isDarkMode ? "bg-slate-950/80" : "bg-slate-900/40"}`}>
          <div className={`w-full max-w-sm border rounded-2xl shadow-2xl overflow-hidden animate-fadeIn transition-colors duration-200 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 text-slate-800"}`}>
            <div className="bg-gradient-to-r from-amber-600 to-amber-500 p-5 text-slate-950 flex flex-col items-center">
              <div className={`p-2.5 rounded-full mb-2 ${isDarkMode ? "bg-slate-950 text-amber-400" : "bg-white/40 text-slate-950"}`}>
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-center uppercase">
                Verify Admin Access
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center">
                ENTER ADMIN-ONLY PASSWORD TO DELETE STATS
              </p>
            </div>

            <form onSubmit={handleVerifyPass} className="p-6 space-y-4 text-xs">
              <div className="space-y-2">
                <label className={`block font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>ACTION PASSWORD (RESTRICTED ACCESS):</label>
                <input
                  type="password"
                  value={passModal.password}
                  onChange={(e) => setPassModal(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter special password"
                  className={`w-full rounded-lg py-2 px-3 text-center text-sm tracking-widest focus:outline-none focus:ring-1 focus:ring-amber-500 border ${isDarkMode ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                  autoFocus
                />
              </div>

              {passModal.error && (
                <div className="bg-red-950/40 border border-red-900/50 text-red-400 p-2.5 rounded-lg flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{passModal.error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPassModal({ isOpen: false, password: "", error: "", targetPlayerId: "", targetPlayerName: "", targetTeam: "" })}
                  className={`flex-1 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                    isDarkMode 
                      ? "border-slate-800 hover:bg-slate-800 text-slate-400" 
                      : "border-slate-200 hover:bg-slate-100 text-slate-500"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all cursor-pointer shadow-lg shadow-amber-500/10"
                >
                  Verify
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      {deleteConfirmModal.isOpen && (
        <div className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[110] p-4 transition-colors duration-200 ${isDarkMode ? "bg-slate-950/80" : "bg-slate-900/40"}`}>
          <div className={`w-full max-w-sm border rounded-2xl shadow-2xl overflow-hidden animate-fadeIn transition-colors duration-200 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 text-slate-800"}`}>
            <div className="bg-red-600 p-5 text-white flex flex-col items-center">
              <div className={`p-2.5 rounded-full mb-2 ${isDarkMode ? "bg-slate-950 text-red-500" : "bg-white/40 text-red-600"}`}>
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-center uppercase font-mono">
                Delete Player Stats
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center uppercase font-mono">
                This action cannot be undone!
              </p>
            </div>

            <div className="p-6 space-y-4 text-xs text-center font-mono">
              <p className={`${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                Are you sure you want to permanently delete all stats data for player "{deleteConfirmModal.playerName}" from all match records?
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmModal({ isOpen: false, playerId: "", playerName: "", teamName: "" })}
                  className={`flex-1 border rounded-lg py-2 font-bold cursor-pointer transition-all text-center ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 border-slate-200"}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeletePlayerStats) {
                      onDeletePlayerStats(deleteConfirmModal.playerName, deleteConfirmModal.teamName);
                    }
                    setDeleteConfirmModal({ isOpen: false, playerId: "", playerName: "", teamName: "" });
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg py-2 font-bold cursor-pointer transition-all flex items-center justify-center gap-1 shadow-lg shadow-red-600/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Yes, Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT RECORD PICKER MODAL (shown when a player has more than one posted record) */}
      {editPickerModal.isOpen && (
        <div className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[110] p-4 transition-colors duration-200 ${isDarkMode ? "bg-slate-950/80" : "bg-slate-900/40"}`}>
          <div className={`w-full max-w-sm border rounded-2xl shadow-2xl overflow-hidden animate-fadeIn transition-colors duration-200 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 text-slate-800"}`}>
            <div className="bg-gradient-to-r from-amber-600 to-amber-500 p-5 text-slate-950 flex flex-col items-center">
              <div className={`p-2.5 rounded-full mb-2 ${isDarkMode ? "bg-slate-950 text-amber-400" : "bg-white/40 text-slate-950"}`}>
                <Pencil className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-center uppercase font-mono">
                Select Record To Edit
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center font-mono">
                {editPickerModal.playerName} is recorded in multiple records
              </p>
            </div>

            <div className="p-5 space-y-2 text-xs font-mono">
              {editPickerModal.records.map((rec, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setEditPickerModal({ isOpen: false, playerName: "", records: [] });
                    if (onEditPlayerRecord) onEditPlayerRecord(rec.league, { date: rec.date, week: rec.week, tournamentWide: rec.tournamentWide });
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl border font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-slate-200 hover:border-amber-500/50" : "bg-slate-50 border-slate-200 text-slate-800 hover:border-amber-400"
                  }`}
                >
                  <span>{rec.label}</span>
                  <Pencil className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                </button>
              ))}

              <button
                type="button"
                onClick={() => setEditPickerModal({ isOpen: false, playerName: "", records: [] })}
                className={`w-full mt-2 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                  isDarkMode ? "border-slate-800 hover:bg-slate-800 text-slate-400" : "border-slate-200 hover:bg-slate-100 text-slate-500"
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
