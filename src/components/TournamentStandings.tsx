import React, { useState, useMemo } from "react";
import { Match, Team } from "../types";
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
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>("ALL");
  const [teamSearchTerm, setTeamSearchTerm] = useState<string>("All");
  const [selectedTeamDetail, setSelectedTeamDetail] = useState<string | null>(null);

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
      return match.date;
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

  const currentPreset = useMemo(() => {
    if (!selectedTournament) return null;
    return tournamentPresets.find((t: any) => t.name === selectedTournament || t.id === selectedTournament);
  }, [selectedTournament, tournamentPresets]);

  const activeTiebreaker = currentPreset?.tiebreaker || "WWCD-PlacementPoint-Kill";

  // Extract all unique tournaments (leagues) from matches
  const tournamentsList = useMemo(() => {
    const unique = Array.from(new Set(matches.filter(m => !m.isDailyStats).map(m => m.league).filter(Boolean)));
    // Default to the first one if present
    if (unique.length > 0 && !selectedTournament) {
      setSelectedTournament(unique[0] as string);
    }
    return unique;
  }, [matches, selectedTournament]);

  // Extract unique maps for filtering inside tournament
  const mapsList = useMemo(() => {
    if (!selectedTournament) return ["ALL"];
    const tournamentMatches = matches.filter(m => !m.isDailyStats && m.league === selectedTournament);
    const unique = Array.from(new Set(tournamentMatches.map(m => m.map).filter(Boolean)));
    return ["ALL", ...unique];
  }, [matches, selectedTournament]);

  // Extract unique days/dates for filtering inside tournament
  const daysList = useMemo(() => {
    if (!selectedTournament) return ["ALL"];
    const tournamentMatches = matches.filter(m => !m.isDailyStats && m.league === selectedTournament);
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
  }, [matches, selectedTournament]);

  // If tournament changes, reset map filter, day filter and selected team detail
  React.useEffect(() => {
    setSelectedMapFilter("ALL");
    setSelectedDayFilter("ALL");
    setSelectedTeamDetail(null);
  }, [selectedTournament]);

  // Calculate Standings
  const standings = useMemo(() => {
    if (!selectedTournament) return [];

    const filteredMatches = matches.filter(m => {
      const matchLeague = m.league === selectedTournament;
      const matchMap = selectedMapFilter === "ALL" || m.map === selectedMapFilter;
      const matchDay = selectedDayFilter === "ALL" || getMatchDay(m) === selectedDayFilter;
      return matchLeague && matchMap && matchDay && !m.isDailyStats;
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
        const teamName = t.name.trim();
        if (!teamName) return;

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
  }, [matches, selectedTournament, selectedMapFilter, selectedDayFilter, activeTiebreaker]);

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

  return (
    <div className="space-y-8 font-mono text-xs animate-fadeIn">
      
      {/* 2. STANDINGS CALCULATOR INTERFACE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 columns: Standings table & Filter */}
        <div className="lg:col-span-2 space-y-6">
          <div className={`p-5 rounded-3xl transition-all border ${
            isDarkMode ? "bg-slate-900/50 border-slate-850" : "bg-white border-slate-200 shadow-sm"
          }`}>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6 border-b border-slate-800/40 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-amber-500 p-2 rounded-xl text-slate-950">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`font-bold font-display text-base uppercase tracking-tight ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                    Klasemen Turnamen Keseluruhan
                  </h3>
                </div>
              </div>

              {/* Tournament Dropdown Selector */}
              <div className="flex items-center gap-1.5 w-full md:w-auto">
                <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Turnamen:</span>
                <select
                  value={selectedTournament}
                  onChange={(e) => setSelectedTournament(e.target.value)}
                  className={`p-2.5 rounded-xl border font-bold cursor-pointer text-xs w-full md:w-48 focus:ring-1 focus:ring-amber-500 outline-none ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                >
                  {tournamentsList.length === 0 ? (
                    <option value="">Belum Ada Data</option>
                  ) : (
                    tournamentsList.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Sub-Filters: Map, Day, Team Search */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari tim di klasemen..."
                  value={teamSearchTerm === "All" ? "" : teamSearchTerm}
                  onChange={(e) => setTeamSearchTerm(e.target.value || "All")}
                  className={`w-full pl-9 pr-4 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isDarkMode ? "bg-slate-950 border-slate-850 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Filter Day:</span>
                <select
                  value={selectedDayFilter}
                  onChange={(e) => setSelectedDayFilter(e.target.value)}
                  className={`p-2 rounded-xl border font-bold cursor-pointer text-xs w-full focus:ring-1 focus:ring-amber-500 outline-none ${
                    isDarkMode ? "bg-slate-950 border-slate-850 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                >
                  {daysList.map(d => (
                    <option key={d} value={d}>{d === "ALL" ? "Semua Hari (All)" : d}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Filter Map:</span>
                <select
                  value={selectedMapFilter}
                  onChange={(e) => setSelectedMapFilter(e.target.value)}
                  className={`p-2 rounded-xl border font-bold cursor-pointer text-xs w-full focus:ring-1 focus:ring-amber-500 outline-none ${
                    isDarkMode ? "bg-slate-950 border-slate-850 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                >
                  {mapsList.map(m => (
                    <option key={m} value={m}>{m === "ALL" ? "Semua Map" : m}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Standings Table */}
            {filteredStandings.length === 0 ? (
              <div className={`text-center py-12 border border-dashed rounded-2xl text-slate-500 ${isDarkMode ? "border-slate-850 bg-slate-950/20" : "border-slate-200"}`}>
                Tidak ada log klasemen untuk turnamen "{selectedTournament}" dengan filter saat ini.
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
                      <th className="py-3 px-4 text-left">Nama Squad</th>
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
                            <span className="flex items-center gap-1.5">
                              {team.name}
                              {team.wwcdCount > 0 && rank === 1 && (
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
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

        {/* Right column: Detailed Team Match-by-Match Logs & Statistics Breakdown */}
        <div className="space-y-6">
          <div className={`p-5 rounded-3xl h-full transition-all flex flex-col justify-between border ${
            isDarkMode ? "bg-slate-900/50 border-slate-850" : "bg-white border-slate-200 shadow-sm"
          }`}>
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-800/40 pb-3 shrink-0">
                <BarChart2 className="w-4 h-4 text-amber-500" />
                <h3 className={`font-bold uppercase tracking-tight ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                  Detail Performa Tim
                </h3>
              </div>

              {!activeTeamDetail ? (
                <div className="text-center py-16 text-slate-500 flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 bg-slate-950/40 rounded-full border border-slate-850">
                    <Trophy className="w-6 h-6 text-slate-600" />
                  </div>
                  <span className="text-[10px] max-w-[200px] leading-relaxed uppercase">
                    PILIH SALAH SATU TIM PADA TABEL KLASEMEN UNTUK MELIHAT RINCIAN MATCH
                  </span>
                </div>
              ) : (
                <div className="space-y-5 animate-fadeIn flex flex-col flex-1 min-h-0">
                  {/* Team Profile Banner */}
                  <div className={`p-4 rounded-2xl border ${
                    isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"
                  }`}>
                    <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider block">NAMA SQUAD</span>
                    <h4 className="text-sm font-black text-amber-500 uppercase mt-0.5 tracking-tight flex items-center gap-1.5">
                      {activeTeamDetail.name}
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    </h4>
                    
                    <div className={`grid grid-cols-3 gap-3 mt-4 pt-3 border-t text-center font-mono ${
                      isDarkMode ? "border-slate-900" : "border-slate-200"
                    }`}>
                      <div className={`p-2 rounded-xl border ${
                        isDarkMode ? "bg-slate-900/40 border-slate-850/50" : "bg-white border-slate-200"
                      }`}>
                        <span className="text-[8px] text-slate-500 block">TOTAL MAIN</span>
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
                      <span>ELIMS POIN ({activeTeamDetail.eliminationPoints})</span>
                      <span>PLACE POIN ({activeTeamDetail.placementPoints})</span>
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
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">GRAFIK PLACEMENT PER MATCH:</span>
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
                                  title={`${hist.matchCode || `Match ${hIdx + 1}`} (${hist.map}): Peringkat #${hist.placement}`}
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
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block shrink-0">LOG RIWAYAT PERTANDINGAN:</span>
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
                              <span>{hist.date}</span>
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
