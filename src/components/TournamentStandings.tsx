import React, { useState, useMemo } from "react";
import { Match } from "../types";
import { calculateLeagueRankStandings, getTournamentTeamList, getTeamGroupMap, canonicalizeTeamName, formatDateDMY } from "../utils";
import {
  Trophy, Star, Calendar, Search, BarChart2
} from "lucide-react";

interface TournamentStandingsProps {
  matches: Match[];
  isDarkMode: boolean;
  tournaments?: any[];
}

export const TournamentStandings: React.FC<TournamentStandingsProps> = ({ matches, isDarkMode, tournaments }) => {
  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [selectedMapFilter, setSelectedMapFilter] = useState<string>("ALL");
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<string>("ALL");
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>("ALL");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("ALL");
  const [teamSearchTerm, setTeamSearchTerm] = useState<string>("All");
  const [selectedTeamDetail, setSelectedTeamDetail] = useState<string | null>(null);

  // Overall = regular-season standings (everything except Grand Final / Survival Stage / Last
  // Chance Qualifier matches). League = League Rank Points (weekly rank converted to points,
  // accumulated separately) - only available when the tournament preset has this enabled, since
  // not every league uses it. Survival / LCQ = only matches explicitly tagged for that stage -
  // each its own fresh points, not carried over from Overall or each other. Final = only matches
  // explicitly tagged as Grand Final. All views stay non-overlapping within the same league so one
  // stage never skews another's table.
  const [viewMode, setViewMode] = useState<"overall" | "league" | "survival" | "lcq" | "final">("overall");

  const matchesStageMatch = (match: Match): boolean => {
    if (viewMode === "final") return !!match.isGrandFinal;
    if (viewMode === "survival") return !!match.isSurvivalStage;
    if (viewMode === "lcq") return !!match.isLastChanceQualifier;
    return !match.isGrandFinal && !match.isSurvivalStage && !match.isLastChanceQualifier;
  };

  // Helper to pull just the Week number out of a matchCode, e.g. "W2D3" -> "Week 2". Returns
  // null when no week is encoded, so a "Filter Week" control can stay hidden entirely for
  // tournaments/leagues that don't use a week structure.
  const getMatchWeek = (match: Match): string | null => {
    const code = (match.matchCode || "").toUpperCase();
    const weekMatch = code.match(/W(\d+)/);
    return weekMatch ? `Week ${weekMatch[1]}` : null;
  };

  // Helper to build a unique Week+Day identifier for a match, e.g. matchCode "W2D3" -> "Week 2 - Day 3".
  // Matching on Day alone would collide across weeks (W1D1 and W2D1 both being "Day 1"), so week is
  // always included when available.
  const getMatchDay = (match: Match): string => {
    const code = (match.matchCode || "").toUpperCase();
    const weekMatch = code.match(/W(\d+)/);
    const dayMatch = code.match(/\bD(\d+)\b/) || code.match(/D(\d+)/) || code.match(/DAY\s*(\d+)/);
    if (weekMatch && dayMatch) {
      return `Week ${weekMatch[1]} - Day ${dayMatch[1]}`;
    }
    if (dayMatch) {
      return `Day ${dayMatch[1]}`;
    }
    if (match.date) {
      return formatDateDMY(match.date);
    }
    return "Unknown Day";
  };

  // Load tournament presets to read the configured tiebreakers
  const tournamentPresets = useMemo(() => {
    if (tournaments && tournaments.length > 0) {
      return tournaments;
    }
    const stored = localStorage.getItem("tournaments_list_v4");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse tournaments in standings", e);
      }
    }
    return [];
  }, [tournaments, matches]);

  // The tournament an admin has manually marked "highlighted" (Add New Match Data > Tournament
  // Settings), if any - used to auto-select & badge it below instead of defaulting to whichever
  // league happens to be first.
  const activeTournamentName = useMemo(() => {
    const active = tournamentPresets.find((t: any) => t.highlighted);
    return active?.name || null;
  }, [tournamentPresets]);

  const currentPreset = useMemo(() => {
    if (!selectedTournament) return null;
    return tournamentPresets.find((t: any) => t.name === selectedTournament || t.id === selectedTournament);
  }, [selectedTournament, tournamentPresets]);

  const activeTiebreaker = currentPreset?.tiebreaker || "WWCD-PlacementPoint-Kill";

  // Reconciles team-name variants (e.g. an ABBR typed instead of the full name in Player Input
  // Panel, or a differently-cased entry) back to one consistent name, so the same team never gets
  // silently split into two rows across standings/stats.
  const canonicalTeamList = useMemo(() => getTournamentTeamList(currentPreset), [currentPreset]);
  const canonicalizeTeam = React.useCallback(
    (rawName: string) => canonicalizeTeamName(rawName, canonicalTeamList, currentPreset?.teamAbbreviations),
    [canonicalTeamList, currentPreset]
  );

  // Team name -> group letter (A-E), for the "Filter Group" control below - empty for a format
  // "16" preset (single lobby, no groups), or when the tournament preset hasn't opted into Group
  // Standings (Tournament Settings > "Enable Group Standings Filter"), so that control stays
  // hidden entirely instead of exposing an incomplete/stale group roster as if it were the full one.
  const teamGroupMap = useMemo(() => {
    if (!currentPreset?.groupStandingsEnabled) return {};
    return getTeamGroupMap(currentPreset);
  }, [currentPreset]);
  const groupsList = useMemo(() => {
    const letters = Array.from(new Set(Object.values(teamGroupMap))).sort();
    return letters.length > 0 ? ["ALL", ...letters] : [];
  }, [teamGroupMap]);

  // League Rank Points standings: only computed/shown when this tournament preset has it enabled
  const leagueRankStandings = useMemo(() => {
    if (!selectedTournament || !currentPreset?.leagueRankPointsEnabled) return [];
    return calculateLeagueRankStandings(
      matches,
      selectedTournament,
      currentPreset.leagueRankPointsTable || [],
      activeTiebreaker,
      canonicalizeTeam
    );
  }, [matches, selectedTournament, currentPreset, activeTiebreaker, canonicalizeTeam]);

  // Distinct weeks present across the League Points standings, sorted, for the column headers
  const leagueRankWeeks = useMemo(() => {
    const unique = new Set<string>();
    leagueRankStandings.forEach(s => s.weeklyPoints.forEach(w => unique.add(w.week)));
    return Array.from(unique).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nb = parseInt(b.replace(/\D/g, ""), 10);
      return na - nb;
    });
  }, [leagueRankStandings]);

  // Extract all unique tournaments (leagues) from matches
  const tournamentsList = useMemo(() => {
    const unique = Array.from(new Set(matches.filter(m => !m.isDailyStats).map(m => m.league).filter(Boolean)));
    // Default to the currently-active tournament (by Tournament Period) if it has data, else the first one
    if (unique.length > 0 && !selectedTournament) {
      const preferred = activeTournamentName && unique.includes(activeTournamentName) ? activeTournamentName : unique[0];
      setSelectedTournament(preferred as string);
    }
    return unique;
  }, [matches, selectedTournament, activeTournamentName]);

  // Extract unique maps for filtering inside tournament
  const mapsList = useMemo(() => {
    if (!selectedTournament) return ["ALL"];
    const tournamentMatches = matches.filter(m => !m.isDailyStats && m.league === selectedTournament);
    const unique = Array.from(new Set(tournamentMatches.map(m => m.map).filter(Boolean)));
    return ["ALL", ...unique];
  }, [matches, selectedTournament]);

  // Extract unique weeks for filtering (only present when the league actually uses week-coded matchCodes)
  const weeksList = useMemo(() => {
    if (!selectedTournament) return [];
    const tournamentMatches = matches.filter(m => !m.isDailyStats && m.league === selectedTournament && matchesStageMatch(m));
    const unique = new Set<string>();
    tournamentMatches.forEach(m => {
      const w = getMatchWeek(m);
      if (w) unique.add(w);
    });
    if (unique.size === 0) return [];
    return ["ALL", ...Array.from(unique).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nb = parseInt(b.replace(/\D/g, ""), 10);
      return na - nb;
    })];
  }, [matches, selectedTournament, viewMode]);

  // Extract unique days/dates for filtering inside tournament, scoped to the selected week (if any)
  const daysList = useMemo(() => {
    if (!selectedTournament) return ["ALL"];
    const tournamentMatches = matches.filter(m =>
      !m.isDailyStats &&
      m.league === selectedTournament &&
      matchesStageMatch(m) &&
      (selectedWeekFilter === "ALL" || getMatchWeek(m) === selectedWeekFilter)
    );
    const unique = new Set<string>();
    tournamentMatches.forEach(m => {
      const d = getMatchDay(m);
      if (d) unique.add(d);
    });
    return ["ALL", ...Array.from(unique).sort((a, b) => {
      const parseWeekDay = (s: string): [number, number] => {
        const w = s.match(/Week (\d+)/);
        const d = s.match(/Day (\d+)/);
        return [w ? parseInt(w[1], 10) : 0, d ? parseInt(d[1], 10) : 0];
      };
      const [weekA, dayA] = parseWeekDay(a);
      const [weekB, dayB] = parseWeekDay(b);
      if (weekA !== weekB) return weekA - weekB;
      if (dayA !== dayB) return dayA - dayB;
      return a.localeCompare(b);
    })];
  }, [matches, selectedTournament, selectedWeekFilter, viewMode]);

  // If tournament changes, reset all filters and selected team detail
  React.useEffect(() => {
    setSelectedMapFilter("ALL");
    setSelectedWeekFilter("ALL");
    setSelectedDayFilter("ALL");
    setSelectedGroupFilter("ALL");
    setSelectedTeamDetail(null);
  }, [selectedTournament]);

  // Switching between Overall/Final resets week+day+group filters since the available options differ per stage
  React.useEffect(() => {
    setSelectedWeekFilter("ALL");
    setSelectedDayFilter("ALL");
    setSelectedGroupFilter("ALL");
  }, [viewMode]);

  // Calculate Standings
  const standings = useMemo(() => {
    if (!selectedTournament) return [];

    const filteredMatches = matches.filter(m => {
      const matchLeague = m.league === selectedTournament;
      const matchMap = selectedMapFilter === "ALL" || m.map === selectedMapFilter;
      const matchWeek = selectedWeekFilter === "ALL" || getMatchWeek(m) === selectedWeekFilter;
      const matchDay = selectedDayFilter === "ALL" || getMatchDay(m) === selectedDayFilter;
      return matchLeague && matchMap && matchWeek && matchDay && matchesStageMatch(m) && !m.isDailyStats;
    });

    const teamMap: Record<string, {
      name: string;
      matchesPlayed: number;
      wwcdCount: number;
      top4Count: number;
      eliminationPoints: number;
      placementPoints: number;
      totalPoints: number;
      history: {
        matchCode: string;
        date: string;
        gameNo: string;
        map: string;
        placement: number;
        elimPoints: number;
        points: number;
        wwcd: boolean;
      }[];
    }> = {};

    filteredMatches.forEach(match => {
      match.teams.forEach(t => {
        const teamName = canonicalizeTeam(t.name.trim());
        if (!teamName) return;
        if (selectedGroupFilter !== "ALL" && teamGroupMap[teamName] !== selectedGroupFilter) return;

        if (!teamMap[teamName]) {
          teamMap[teamName] = {
            name: teamName,
            matchesPlayed: 0,
            wwcdCount: 0,
            top4Count: 0,
            eliminationPoints: 0,
            placementPoints: 0,
            totalPoints: 0,
            history: []
          };
        }

        const stats = teamMap[teamName];
        stats.matchesPlayed += 1;
        stats.wwcdCount += t.placement === 1 ? 1 : 0;
        stats.top4Count += t.placement >= 1 && t.placement <= 4 ? 1 : 0;
        stats.eliminationPoints += Number(t.eliminationPoints) || 0;
        stats.placementPoints += Number(t.placementPoints) || 0;
        stats.totalPoints += Number(t.totalPoints) || 0;

        stats.history.push({
          matchCode: match.matchCode,
          date: match.date,
          gameNo: match.gameNo || "",
          map: match.map,
          placement: t.placement,
          elimPoints: t.eliminationPoints,
          points: t.totalPoints,
          wwcd: t.placement === 1
        });
      });
    });

    // Sort each team's history chronologically so the match log & placement graph read left-to-right / top-to-bottom in play order
    Object.values(teamMap).forEach(stats => {
      stats.history.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        const gameA = parseInt(a.gameNo, 10);
        const gameB = parseInt(b.gameNo, 10);
        if (!isNaN(gameA) && !isNaN(gameB) && gameA !== gameB) return gameA - gameB;
        return a.matchCode.localeCompare(b.matchCode);
      });
    });

    // Convert map to sorted array
    // Standard PUBGM Standings sorting with editable tiebreaker options:
    return Object.values(teamMap).sort((a, b) => {
      // 1. Total Points Descending
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      // 2. WWCD Count Descending
      if (b.wwcdCount !== a.wwcdCount) {
        return b.wwcdCount - a.wwcdCount;
      }

      if (activeTiebreaker === "WWCD-PlacementPoint-Kill") {
        // 3. Placement Points Descending
        if (b.placementPoints !== a.placementPoints) {
          return b.placementPoints - a.placementPoints;
        }
        // 4. Elimination Points (Kill) Descending
        if (b.eliminationPoints !== a.eliminationPoints) {
          return b.eliminationPoints - a.eliminationPoints;
        }
      } else {
        // 3. Elimination Points (Kill) Descending
        if (b.eliminationPoints !== a.eliminationPoints) {
          return b.eliminationPoints - a.eliminationPoints;
        }
        // 4. Placement Points Descending
        if (b.placementPoints !== a.placementPoints) {
          return b.placementPoints - a.placementPoints;
        }
      }

      // 5. Matches Played Ascending
      return a.matchesPlayed - b.matchesPlayed;
    });
  }, [matches, selectedTournament, selectedMapFilter, selectedWeekFilter, selectedDayFilter, selectedGroupFilter, viewMode, activeTiebreaker, canonicalizeTeam, teamGroupMap]);

  // Filter standings by search term (if user searches for a specific team)
  const filteredStandings = useMemo(() => {
    if (teamSearchTerm === "All" || !teamSearchTerm.trim()) {
      return standings;
    }
    return standings.filter(s => s.name.toLowerCase().includes(teamSearchTerm.toLowerCase()));
  }, [standings, teamSearchTerm]);

  // Selected team's detailed log
  const activeTeamDetail = useMemo(() => {
    if (!selectedTeamDetail) return null;
    return standings.find(s => s.name === selectedTeamDetail) || null;
  }, [standings, selectedTeamDetail]);

  // Not every tournament runs a separate Grand Final stage - some are League-only, others go
  // straight to a Final with no League phase. The champion star should only ever appear on
  // whichever stage actually decides the tournament: the Final when one exists, otherwise Overall.
  const hasGrandFinalMatches = useMemo(() => {
    if (!selectedTournament) return false;
    return matches.some(m => !m.isDailyStats && m.league === selectedTournament && m.isGrandFinal);
  }, [matches, selectedTournament]);

  // Survival Stage and Last Chance Qualifier tabs only show up once this league actually has a
  // match recorded for that stage - not every tournament runs either one.
  const hasSurvivalStageMatches = useMemo(() => {
    if (!selectedTournament) return false;
    return matches.some(m => !m.isDailyStats && m.league === selectedTournament && m.isSurvivalStage);
  }, [matches, selectedTournament]);

  const hasLastChanceQualifierMatches = useMemo(() => {
    if (!selectedTournament) return false;
    return matches.some(m => !m.isDailyStats && m.league === selectedTournament && m.isLastChanceQualifier);
  }, [matches, selectedTournament]);

  // Fall back to Overall if the tab someone's currently on disappears - e.g. switching to a
  // tournament with no Survival Stage/LCQ matches while that tab was active.
  React.useEffect(() => {
    if (viewMode === "survival" && !hasSurvivalStageMatches) setViewMode("overall");
    if (viewMode === "lcq" && !hasLastChanceQualifierMatches) setViewMode("overall");
  }, [viewMode, hasSurvivalStageMatches, hasLastChanceQualifierMatches]);

  // Every Grand Final match for this league, ignoring the viewer's own Map/Week/Day filters above -
  // Smash Rule eligibility/target is an objective tournament fact, not something that should change
  // depending on which subset of games someone happens to be looking at.
  const grandFinalMatchesAll = useMemo(() => {
    if (!selectedTournament) return [];
    return matches.filter(m => !m.isDailyStats && m.league === selectedTournament && m.isGrandFinal);
  }, [matches, selectedTournament]);

  // Distinct Grand Final games (one matchCode+gameNo pair can span several teams' Team entries), in
  // actual play order (Date then Time) - the "Nth game" Smash Rule's lock-in point and forward
  // eligibility walk are counted against.
  //
  // Identity is matchCode+gameNo, NOT date+gameNo: matchCode is the game's original session/day
  // label (e.g. "D7"), which stays put even when a match gets postponed to a different calendar
  // Date - only Date/Time change to reflect when it was actually played. A postponed match keeping
  // its original Game/Match No (e.g. "D7"'s Game 5) can then legitimately land on the exact same
  // calendar Date as that new day's own native Game 5 (e.g. "D8"'s own Game 5) - two entirely
  // different real games that happen to share a Date+gameNo pair. Deduping on date+gameNo used to
  // wrongly merge those two into "one game"; matchCode+gameNo tells them apart correctly.
  const grandFinalGameKeys = useMemo(() => {
    const seen = new Map<string, { matchCode: string; gameNo: string; date: string; time: string }>();
    grandFinalMatchesAll.forEach(m => {
      const key = `${m.matchCode || ""}__${m.gameNo || ""}`;
      if (!seen.has(key)) seen.set(key, { matchCode: m.matchCode || "", gameNo: m.gameNo || "", date: m.date, time: m.time || "" });
    });
    const timeToMinutes = (t: string): number => {
      if (!t) return Number.MAX_SAFE_INTEGER;
      const parts = t.split(":").map(n => parseInt(n, 10));
      if (parts.some(n => Number.isNaN(n))) return Number.MAX_SAFE_INTEGER;
      return parts[0] * 60 + (parts[1] || 0);
    };
    return Array.from(seen.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });
  }, [grandFinalMatchesAll]);

  // Replays Grand Final games in order to find the Match Point target (leader's total after the
  // configured lock-in game, plus the configured bonus), which teams have since reached it, and -
  // walking forward from there - the first eligible team to also grab a WWCD (the moment Smash Rule
  // declares a winner and the tournament ends early).
  const smashRuleState = useMemo(() => {
    if (!currentPreset?.smashRuleEnabled || grandFinalGameKeys.length === 0) return null;
    const totalGamesPlayed = grandFinalGameKeys.length;
    // The lock-in point is whatever game number was actually configured (e.g. 12) - it must NOT be
    // clamped down to however many games happen to be recorded so far, or the Match Point target
    // would lock in (and keep re-locking, at a different total each time) after every single game
    // as soon as any Grand Final result exists, instead of waiting for the real lock-in game to be
    // reached. No config at all means Smash Rule can't determine a target yet.
    const lockAfterGame = Number(currentPreset.smashRuleLockAfterGame) || null;
    if (!lockAfterGame || lockAfterGame < 1) {
      return { matchPointTarget: null, lockAfterGame: null, totalGamesPlayed, eligibleTeams: new Set<string>(), champion: null, championAtGameIndex: null };
    }
    const bonus = Number(currentPreset.smashRuleBonus) || 0;

    const running: Record<string, number> = {};
    let matchPointTarget: number | null = null;
    let champion: string | null = null;
    let championAtGameIndex: number | null = null;
    const eligibleTeams = new Set<string>();

    grandFinalGameKeys.forEach((key, idx) => {
      const gameMatches = grandFinalMatchesAll.filter(m => (m.matchCode || "") === key.matchCode && (m.gameNo || "") === key.gameNo);
      const wwcdTeamsThisGame: string[] = [];
      const gamePoints: Record<string, number> = {};
      gameMatches.forEach(m => {
        m.teams.forEach(t => {
          const name = canonicalizeTeam(t.name.trim());
          if (!name) return;
          gamePoints[name] = (gamePoints[name] || 0) + (Number(t.totalPoints) || 0);
          if (t.placement === 1) wwcdTeamsThisGame.push(name);
        });
      });

      // A team only becomes "Match Point Eligible" for the matches AFTER the one where it crossed
      // the threshold (Liquipedia: "that team will become Match Point Eligible for the subsequent
      // matches") - so the WWCD-while-eligible check below must use eligibleTeams as it stood
      // BEFORE this game's own points are folded in, not after. Otherwise a team that crosses the
      // threshold and grabs the WWCD in that exact same game would be wrongly crowned immediately,
      // when the real rule only lets them cash in starting the next game.
      if (matchPointTarget !== null && !champion) {
        const winner = wwcdTeamsThisGame.find(name => eligibleTeams.has(name));
        if (winner) {
          champion = winner;
          championAtGameIndex = idx;
        }
      }

      Object.entries(gamePoints).forEach(([name, pts]) => {
        running[name] = (running[name] || 0) + pts;
      });

      const gameNumber = idx + 1;
      if (gameNumber === lockAfterGame) {
        const leaderTotal = Object.values(running).length > 0 ? Math.max(...Object.values(running)) : 0;
        matchPointTarget = leaderTotal + bonus;
      }
      if (matchPointTarget !== null) {
        Object.entries(running).forEach(([name, total]) => {
          if (total >= matchPointTarget!) eligibleTeams.add(name);
        });
      }
    });

    return { matchPointTarget, lockAfterGame, totalGamesPlayed, eligibleTeams, champion, championAtGameIndex };
  }, [currentPreset, grandFinalGameKeys, grandFinalMatchesAll, canonicalizeTeam]);

  const championTeamName = useMemo(() => {
    // Survival Stage and Last Chance Qualifier have no single "winner" - a group of teams advance
    // instead (see the "Advancing" highlight below), so neither ever gets a champion crown.
    if (viewMode === "league" || viewMode === "survival" || viewMode === "lcq") return null;
    const isDecidingStage = viewMode === "final" || (viewMode === "overall" && !hasGrandFinalMatches);
    if (!isDecidingStage) return null;

    // Smash Rule tournaments: only crown once smashed, or once every scheduled game is in with
    // nobody having smashed (falls back to the plain points leader) - never crown mid-tournament
    // just because someone's currently on top, since that's not how the win condition works here.
    if (viewMode === "final" && smashRuleState) {
      if (smashRuleState.champion) return smashRuleState.champion;
      const scheduledTotal = currentPreset?.smashRuleTotalGames;
      const allGamesIn = !!scheduledTotal && smashRuleState.totalGamesPlayed >= scheduledTotal;
      if (!allGamesIn) return null;
    }

    const top = standings[0];
    if (top && top.wwcdCount > 0) return top.name;
    return null;
  }, [standings, viewMode, hasGrandFinalMatches, smashRuleState, currentPreset]);

  return (
    <div className="space-y-8 font-mono text-xs animate-fadeIn">
      
      {/* 2. STANDINGS CALCULATOR INTERFACE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 columns: Standings table & Filter */}
        <div className="lg:col-span-2 space-y-6">
          <div className={`p-5 rounded-3xl transition-all border ${
            isDarkMode ? "bg-slate-900/50 border-slate-850" : "bg-white border-slate-200 shadow-sm"
          }`}>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-4 border-b border-slate-800/40 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-amber-500 p-2 rounded-xl text-slate-950">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`font-bold font-display text-base uppercase tracking-tight flex items-center gap-2 ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                    {viewMode === "final" ? "Grand Final Standings" : viewMode === "survival" ? "Survival Stage Standings" : viewMode === "lcq" ? "Last Chance Qualifier Standings" : "Overall League Standings"}
                    {selectedTournament && selectedTournament === activeTournamentName && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[9px] font-black uppercase tracking-wider">
                        ★ Highlighted
                      </span>
                    )}
                  </h3>
                </div>
              </div>

              {/* Tournament Dropdown Selector */}
              <div className="flex items-center gap-1.5 w-full md:w-auto">
                <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Tournament:</span>
                <select
                  value={selectedTournament}
                  onChange={(e) => setSelectedTournament(e.target.value)}
                  className={`p-2.5 rounded-xl border font-bold cursor-pointer text-xs w-full md:w-48 focus:ring-1 focus:ring-amber-500 outline-none ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                >
                  {tournamentsList.length === 0 ? (
                    <option value="">No Data Yet</option>
                  ) : (
                    tournamentsList.map(t => (
                      <option key={t} value={t}>{t === activeTournamentName ? `★ ${t}` : t}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Overall vs Grand Final toggle */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setViewMode("overall")}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                  viewMode === "overall"
                    ? "bg-amber-500 text-slate-950 border-amber-500"
                    : isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800 hover:text-white" : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"
                }`}
              >
                Overall
              </button>
              {currentPreset?.leagueRankPointsEnabled && (
                <button
                  type="button"
                  onClick={() => setViewMode("league")}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                    viewMode === "league"
                      ? "bg-amber-500 text-slate-950 border-amber-500"
                      : isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800 hover:text-white" : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"
                  }`}
                >
                  League Points
                </button>
              )}
              {hasSurvivalStageMatches && (
                <button
                  type="button"
                  onClick={() => setViewMode("survival")}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                    viewMode === "survival"
                      ? "bg-teal-500 text-slate-950 border-teal-500"
                      : isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800 hover:text-white" : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"
                  }`}
                >
                  Survival Stage
                </button>
              )}
              {hasLastChanceQualifierMatches && (
                <button
                  type="button"
                  onClick={() => setViewMode("lcq")}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                    viewMode === "lcq"
                      ? "bg-indigo-500 text-slate-950 border-indigo-500"
                      : isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800 hover:text-white" : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"
                  }`}
                >
                  Last Chance Qualifier
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode("final")}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                  viewMode === "final"
                    ? "bg-amber-500 text-slate-950 border-amber-500"
                    : isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800 hover:text-white" : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"
                }`}
              >
                Grand Final
              </button>
            </div>

            {/* Smash Rule status - Grand Final's Match Point target, and whether/who has smashed */}
            {viewMode === "final" && smashRuleState && (
              <div className={`mb-4 p-3 rounded-xl border text-[11px] font-mono flex flex-wrap items-center gap-x-3 gap-y-1 ${
                smashRuleState.champion
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                  : isDarkMode ? "bg-slate-950/40 border-slate-850 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
              }`}>
                <span className="font-black uppercase tracking-wider">
                  {smashRuleState.matchPointTarget !== null
                    ? `⚡ Match Point: ${smashRuleState.matchPointTarget}`
                    : smashRuleState.lockAfterGame !== null
                    ? `Locks in after game ${smashRuleState.lockAfterGame}`
                    : "Set 'Lock Target After Game #' in Tournament Settings to activate"}
                </span>
                {smashRuleState.champion ? (
                  <span className="font-bold">💥 SMASHED by <strong>{smashRuleState.champion}</strong> at Game {(smashRuleState.championAtGameIndex ?? 0) + 1}</span>
                ) : smashRuleState.matchPointTarget !== null ? (
                  <span className="text-slate-500">
                    {smashRuleState.eligibleTeams.size > 0
                      ? `Match Point Eligible: ${Array.from(smashRuleState.eligibleTeams).join(", ")}`
                      : "No team has reached Match Point yet."}
                  </span>
                ) : (
                  <span className="text-slate-500">{smashRuleState.totalGamesPlayed} game{smashRuleState.totalGamesPlayed === 1 ? "" : "s"} recorded so far.</span>
                )}
              </div>
            )}

            {/* Survival Stage status - fresh points, separate from Overall/Grand Final, with the
                top N (configured per tournament, since it varies) highlighted as advancing below. */}
            {viewMode === "survival" && (
              <div className={`mb-4 p-3 rounded-xl border text-[11px] font-mono ${
                isDarkMode ? "bg-slate-950/40 border-slate-850 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
              }`}>
                {currentPreset?.survivalStageAdvanceCount
                  ? <span>Top <strong className="text-teal-400">{currentPreset.survivalStageAdvanceCount}</strong> teams advance to{" "}
                      {currentPreset.survivalStageAdvanceDestination === "final" ? "Grand Final"
                        : currentPreset.survivalStageAdvanceDestination === "lcq" ? "the Last Chance Qualifier"
                        : currentPreset.survivalStageAdvanceDestination === "both" ? "Grand Final and/or the Last Chance Qualifier"
                        : "the next stage"}.</span>
                  : <span className="text-slate-500">Set "Survival Stage: Teams Advancing" in this tournament's settings to highlight who's advancing.</span>}
              </div>
            )}

            {/* Last Chance Qualifier status - same idea as Survival Stage above. */}
            {viewMode === "lcq" && (
              <div className={`mb-4 p-3 rounded-xl border text-[11px] font-mono ${
                isDarkMode ? "bg-slate-950/40 border-slate-850 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
              }`}>
                {currentPreset?.lastChanceQualifierAdvanceCount
                  ? <span>Top <strong className="text-indigo-400">{currentPreset.lastChanceQualifierAdvanceCount}</strong> teams advance to Grand Final.</span>
                  : <span className="text-slate-500">Set "Last Chance Qualifier: Teams Advancing" in this tournament's settings to highlight who's advancing.</span>}
              </div>
            )}

            {/* Sub-Filters: Map, Week, Day, Team Search */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search team in standings..."
                  value={teamSearchTerm === "All" ? "" : teamSearchTerm}
                  onChange={(e) => setTeamSearchTerm(e.target.value || "All")}
                  className={`w-full pl-9 pr-4 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isDarkMode ? "bg-slate-950 border-slate-850 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                />
              </div>

              {viewMode !== "league" && weeksList.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Filter Week:</span>
                  <select
                    value={selectedWeekFilter}
                    onChange={(e) => setSelectedWeekFilter(e.target.value)}
                    className={`p-2 rounded-xl border font-bold cursor-pointer text-xs focus:ring-1 focus:ring-amber-500 outline-none ${
                      isDarkMode ? "bg-slate-950 border-slate-850 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  >
                    {weeksList.map(w => (
                      <option key={w} value={w}>{w === "ALL" ? "All Weeks (All)" : w}</option>
                    ))}
                  </select>
                </div>
              )}

              {viewMode !== "league" && groupsList.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Filter Group:</span>
                  <select
                    value={selectedGroupFilter}
                    onChange={(e) => setSelectedGroupFilter(e.target.value)}
                    className={`p-2 rounded-xl border font-bold cursor-pointer text-xs focus:ring-1 focus:ring-amber-500 outline-none ${
                      isDarkMode ? "bg-slate-950 border-slate-850 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  >
                    {groupsList.map(g => (
                      <option key={g} value={g}>{g === "ALL" ? "All Groups (All)" : `Group ${g}`}</option>
                    ))}
                  </select>
                </div>
              )}

              {viewMode !== "league" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Filter Day:</span>
                  <select
                    value={selectedDayFilter}
                    onChange={(e) => setSelectedDayFilter(e.target.value)}
                    className={`p-2 rounded-xl border font-bold cursor-pointer text-xs focus:ring-1 focus:ring-amber-500 outline-none ${
                      isDarkMode ? "bg-slate-950 border-slate-850 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  >
                    {daysList.map(d => (
                      <option key={d} value={d}>{d === "ALL" ? "All Days (All)" : d}</option>
                    ))}
                  </select>
                </div>
              )}

              {viewMode !== "league" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Filter Map:</span>
                  <select
                    value={selectedMapFilter}
                    onChange={(e) => setSelectedMapFilter(e.target.value)}
                    className={`p-2 rounded-xl border font-bold cursor-pointer text-xs focus:ring-1 focus:ring-amber-500 outline-none ${
                      isDarkMode ? "bg-slate-950 border-slate-850 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  >
                    {mapsList.map(m => (
                      <option key={m} value={m}>{m === "ALL" ? "All Maps" : m}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Standings Table */}
            {viewMode === "league" ? (
              leagueRankStandings.length === 0 ? (
                <div className={`text-center py-12 border border-dashed rounded-2xl text-slate-500 ${isDarkMode ? "border-slate-850 bg-slate-950/20" : "border-slate-200"}`}>
                  No League Rank Points data yet for tournament "{selectedTournament}".
                </div>
              ) : (
                <div className={`overflow-x-auto rounded-xl border ${
                  isDarkMode ? "border-slate-800/40 bg-slate-950/10" : "border-slate-200 bg-white"
                }`}>
                  <table className="w-full text-left font-mono border-collapse">
                    <thead>
                      <tr className={`text-[10px] uppercase tracking-wider font-bold border-b ${
                        isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}>
                        <th className="py-3 px-3 text-center w-12">R</th>
                        <th className="py-3 px-4 text-left">Squad Name</th>
                        {leagueRankWeeks.map(w => (
                          <th key={w} className="py-3 px-3 text-center w-20">{w}</th>
                        ))}
                        <th className="py-3 px-4 text-center text-amber-500 bg-amber-500/5 font-black w-28">LEAGUE POINTS</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? "divide-slate-850/30" : "divide-slate-100"}`}>
                      {leagueRankStandings
                        .filter(s => teamSearchTerm === "All" || !teamSearchTerm.trim() || s.team.toLowerCase().includes(teamSearchTerm.toLowerCase()))
                        .map((s, idx) => {
                          const rank = idx + 1;
                          return (
                            <tr key={s.team} className={isDarkMode ? "text-slate-300" : "text-slate-800"}>
                              <td className="py-3 px-3 text-center w-12">
                                <span className={`w-6 h-6 rounded-md inline-flex items-center justify-center font-extrabold text-[10px] ${
                                  rank === 1
                                    ? "bg-amber-500 text-slate-950"
                                    : rank === 2
                                      ? "bg-slate-300 text-slate-950"
                                      : rank === 3
                                        ? "bg-amber-700 text-slate-100"
                                        : isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
                                }`}>
                                  {rank}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-bold uppercase tracking-tight">{s.team}</td>
                              {leagueRankWeeks.map(w => {
                                const entry = s.weeklyPoints.find(wp => wp.week === w);
                                return (
                                  <td key={w} className={`py-3 px-3 text-center ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                                    {entry ? (
                                      <span title={`Rank #${entry.rank} that week`}>{entry.points}</span>
                                    ) : (
                                      <span className="text-slate-600">-</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="py-3 px-4 text-center text-sm font-black bg-amber-500/5 text-amber-500 w-28">
                                {s.totalLeaguePoints}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )
            ) : filteredStandings.length === 0 ? (
              <div className={`text-center py-12 border border-dashed rounded-2xl text-slate-500 ${isDarkMode ? "border-slate-850 bg-slate-950/20" : "border-slate-200"}`}>
                No standings log {viewMode === "final" ? "Grand Final " : ""}for tournament "{selectedTournament}" with the current filters.
              </div>
            ) : (
              <div className={`overflow-x-auto rounded-xl border ${
                isDarkMode ? "border-slate-800/40 bg-slate-950/10" : "border-slate-200 bg-white"
              }`}>
                <table className="w-full text-left font-mono border-collapse">
                  <thead>
                    <tr className={`text-[10px] uppercase tracking-wider font-bold border-b ${
                      isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      <th className="py-3 px-3 text-center w-12">R</th>
                      <th className="py-3 px-4 text-left">Squad Name</th>
                      <th className="py-3 px-3 text-center w-16">Match</th>
                      <th className="py-3 px-3 text-center w-16">WWCD</th>
                      <th className="py-3 px-4 text-center w-24">Placement</th>
                      <th className="py-3 px-4 text-center w-24">Elims</th>
                      <th className="py-3 px-4 text-center text-amber-500 bg-amber-500/5 font-black w-24">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? "divide-slate-850/30" : "divide-slate-100"}`}>
                    {filteredStandings.map((team, idx) => {
                      const rank = idx + 1;
                      const isSelected = selectedTeamDetail === team.name;
 
                      return (
                        <tr 
                          key={team.name}
                          onClick={() => setSelectedTeamDetail(isSelected ? null : team.name)}
                          className={`hover:cursor-pointer transition-colors ${
                            isSelected 
                              ? isDarkMode ? "bg-amber-500/10 text-white" : "bg-amber-500/5 text-slate-900 font-semibold" 
                              : isDarkMode 
                                ? "hover:bg-slate-950/60 text-slate-300" 
                                : "hover:bg-slate-50 text-slate-800"
                          }`}
                        >
                          <td className="py-3 px-3 text-center w-12">
                            <span className={`w-6 h-6 rounded-md inline-flex items-center justify-center font-extrabold text-[10px] ${
                              rank === 1 
                                ? "bg-amber-500 text-slate-950" 
                                : rank === 2 
                                  ? "bg-slate-300 text-slate-950"
                                  : rank === 3 
                                    ? "bg-amber-700 text-slate-100"
                                    : isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
                            }`}>
                              {rank}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold uppercase tracking-tight">
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {team.name}
                              {team.name === championTeamName && (
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                              )}
                              {viewMode === "survival" && !!currentPreset?.survivalStageAdvanceCount && rank <= currentPreset.survivalStageAdvanceCount && (
                                <span className="px-1.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/30 text-teal-400 text-[8px] font-black uppercase tracking-wider whitespace-nowrap">
                                  ✅ Advancing
                                </span>
                              )}
                              {viewMode === "lcq" && !!currentPreset?.lastChanceQualifierAdvanceCount && rank <= currentPreset.lastChanceQualifierAdvanceCount && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[8px] font-black uppercase tracking-wider whitespace-nowrap">
                                  ✅ Advancing
                                </span>
                              )}
                              {viewMode === "final" && smashRuleState?.eligibleTeams.has(team.name) && team.name !== smashRuleState.champion && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[8px] font-black uppercase tracking-wider whitespace-nowrap">
                                  ⚡ Match Point
                                </span>
                              )}
                            </span>
                          </td>
                          <td className={`py-3 px-3 text-center font-semibold w-16 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>{team.matchesPlayed}</td>
                          <td className="py-3 px-3 text-center text-amber-500 font-extrabold w-16">{team.wwcdCount}</td>
                          <td className={`py-3 px-4 text-center w-24 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>{team.placementPoints}</td>
                          <td className={`py-3 px-4 text-center font-bold w-24 ${isDarkMode ? "text-teal-400" : "text-teal-600"}`}>{team.eliminationPoints}</td>
                          <td className={`py-3 px-4 text-center text-sm font-black bg-amber-500/5 w-24 ${
                            isSelected ? "text-amber-400 border-l border-amber-500/30" : "text-amber-500"
                          }`}>
                            {team.totalPoints}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Detailed Team Match-by-Match Logs & Statistics Breakdown.
            Height tracks the left standings table's actual rendered height (CSS Grid stretches
            both columns of the same row to match by default) instead of a fixed vh guess, so a
            16-team lobby's shorter table and a 32-team lobby's taller one both get a right column
            that reaches exactly as far down as the table does - never over- or under-shooting it.
            The Match History Log below still scrolls internally (flex-1 min-h-0 overflow-y-auto)
            for whichever height that ends up being, so a team with a long match history doesn't
            grow the card past that point either. */}
        <div className="space-y-6">
          <div className={`p-5 rounded-3xl h-full transition-all flex flex-col justify-between border ${
            isDarkMode ? "bg-slate-900/50 border-slate-850" : "bg-white border-slate-200 shadow-sm"
          }`}>
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-800/40 pb-3 shrink-0">
                <BarChart2 className="w-4 h-4 text-amber-500" />
                <h3 className={`font-bold uppercase tracking-tight ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                  Team Performance Details
                </h3>
              </div>

              {!activeTeamDetail ? (
                <div className="text-center py-16 text-slate-500 flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 bg-slate-950/40 rounded-full border border-slate-850">
                    <Trophy className="w-6 h-6 text-slate-600" />
                  </div>
                  <span className="text-[10px] max-w-[200px] leading-relaxed uppercase">
                    SELECT A TEAM IN THE STANDINGS TABLE TO VIEW MATCH DETAILS
                  </span>
                </div>
              ) : (
                <div className="space-y-5 animate-fadeIn flex flex-col flex-1 min-h-0">
                  {/* Team Profile Banner */}
                  <div className={`p-4 rounded-2xl border ${
                    isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"
                  }`}>
                    <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider block">SQUAD NAME</span>
                    <h4 className="text-sm font-black text-amber-500 uppercase mt-0.5 tracking-tight flex items-center gap-1.5">
                      {activeTeamDetail.name}
                      {activeTeamDetail.name === championTeamName && (
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      )}
                    </h4>
                    
                    <div className={`grid grid-cols-3 gap-3 mt-4 pt-3 border-t text-center font-mono ${
                      isDarkMode ? "border-slate-900" : "border-slate-200"
                    }`}>
                      <div className={`p-2 rounded-xl border ${
                        isDarkMode ? "bg-slate-900/40 border-slate-850/50" : "bg-white border-slate-200"
                      }`}>
                        <span className="text-[8px] text-slate-500 block">TOTAL PLAYED</span>
                        <strong className={`text-sm ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>{activeTeamDetail.matchesPlayed}</strong>
                      </div>
                      <div className={`p-2 rounded-xl border ${
                        isDarkMode ? "bg-slate-900/40 border-slate-850/50" : "bg-white border-slate-200"
                      }`}>
                        <span className="text-[8px] text-slate-500 block">TOP 4</span>
                        <strong className="text-teal-400 text-sm">{activeTeamDetail.top4Count}</strong>
                      </div>
                      <div className={`p-2 rounded-xl border ${
                        isDarkMode ? "bg-slate-900/40 border-slate-850/50" : "bg-white border-slate-200"
                      }`}>
                        <span className="text-[8px] text-slate-500 block">WWCD</span>
                        <strong className="text-amber-500 text-sm">{activeTeamDetail.wwcdCount}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Visual Bar Ratio: Elims vs Placements */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-500">
                      <span>ELIMS POINTS ({activeTeamDetail.eliminationPoints})</span>
                      <span>PLACE POINTS ({activeTeamDetail.placementPoints})</span>
                    </div>
                    {activeTeamDetail.totalPoints > 0 ? (
                      <div className="h-2.5 rounded-full bg-slate-950 overflow-hidden flex">
                        <div 
                          className="bg-teal-500 h-full transition-all duration-500"
                          style={{ width: `${(activeTeamDetail.eliminationPoints / activeTeamDetail.totalPoints) * 100}%` }}
                          title="Elimination Points Ratio"
                        />
                        <div 
                          className="bg-amber-500 h-full transition-all duration-500"
                          style={{ width: `${(activeTeamDetail.placementPoints / activeTeamDetail.totalPoints) * 100}%` }}
                          title="Placement Points Ratio"
                        />
                      </div>
                    ) : (
                      <div className="h-2.5 rounded-full bg-slate-950" />
                    )}
                    <div className="flex justify-between text-[8px] text-slate-500">
                      <span>Ratio: {activeTeamDetail.totalPoints > 0 ? Math.round((activeTeamDetail.eliminationPoints / activeTeamDetail.totalPoints) * 100) : 0}% Kills</span>
                      <span>{activeTeamDetail.totalPoints > 0 ? Math.round((activeTeamDetail.placementPoints / activeTeamDetail.totalPoints) * 100) : 0}% Rank</span>
                    </div>
                  </div>

                  {/* Placement per Match Chart */}
                  {activeTeamDetail.history.length > 0 && (
                    <div className="space-y-2 shrink-0">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">PLACEMENT CHART PER MATCH:</span>
                      <div className={`p-3 rounded-xl border ${isDarkMode ? "bg-slate-950/50 border-slate-900" : "bg-slate-50 border-slate-200"}`}>
                        <div className="flex items-end gap-2 h-28 overflow-x-auto pb-1">
                          {(() => {
                            const maxPlacement = Math.max(16, ...activeTeamDetail.history.map(h => h.placement));
                            return activeTeamDetail.history.map((hist, hIdx) => {
                              const heightPct = Math.max(6, ((maxPlacement - hist.placement + 1) / maxPlacement) * 100);
                              const barColor = hist.wwcd
                                ? "bg-amber-500"
                                : hist.placement <= 4
                                ? "bg-teal-500"
                                : isDarkMode ? "bg-slate-700" : "bg-slate-300";
                              return (
                                <div
                                  key={`chart-${hist.matchCode}-${hIdx}`}
                                  className="flex flex-col items-center justify-end h-full shrink-0 w-7"
                                  title={`${hist.matchCode || `Match ${hIdx + 1}`} (${hist.map}): Rank #${hist.placement}`}
                                >
                                  <span className={`text-[8px] font-black mb-1 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                                    #{hist.placement}
                                  </span>
                                  <div
                                    className={`w-3.5 rounded-t-md ${barColor} transition-all duration-500`}
                                    style={{ height: `${heightPct}%` }}
                                  />
                                  <span className="text-[7px] text-slate-500 mt-1 font-bold uppercase shrink-0">M{hIdx + 1}</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Match-by-Match History */}
                  <div className="space-y-2.5 flex flex-col flex-1 min-h-[120px]">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block shrink-0">MATCH HISTORY LOG:</span>
                    <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
                      {activeTeamDetail.history.map((hist, hIdx) => (
                        <div 
                          key={`${hist.matchCode}-${hIdx}`}
                          className={`p-3 rounded-xl border transition-all text-[11px] flex items-center justify-between ${
                            hist.wwcd 
                              ? "bg-amber-950/20 border-amber-500/30" 
                              : isDarkMode ? "bg-slate-950/50 border-slate-900" : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <strong className={`font-bold ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>{hist.matchCode}</strong>
                              <span className="text-[9px] text-slate-500 uppercase font-semibold">{hist.map}</span>
                              {hist.wwcd && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[8px] tracking-wide uppercase">WWCD</span>
                              )}
                            </div>
                            <div className="text-[9px] text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>{formatDateDMY(hist.date)}</span>
                            </div>
                          </div>

                          <div className="text-right font-mono">
                            <div className="text-[10px] text-slate-400">
                              Rank: <strong className="text-slate-200">#{hist.placement}</strong> • Kills: <strong className="text-teal-400">{hist.elimPoints}</strong>
                            </div>
                            <div className="text-[11px] font-black text-amber-500 mt-0.5">
                              +{hist.points} <span className="text-[8px] text-slate-500 font-normal">pts</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {activeTeamDetail && (
              <button
                onClick={() => setSelectedTeamDetail(null)}
                className={`mt-4 w-full py-2 rounded-xl text-center font-bold cursor-pointer transition-all border ${
                  isDarkMode ? "bg-slate-950 hover:bg-slate-900 border-slate-850 text-slate-400 hover:text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
