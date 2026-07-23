import React, { useState, useMemo, useEffect } from "react";
import { Match } from "../types";
import { calculatePlacementPoints } from "../utils";
import {
  Search, User, Award, Grid, List, Trash2, Lock, ShieldAlert, Pencil
} from "lucide-react";

interface PlayerStatsProps {
  matches: Match[];
  isDarkMode: boolean;
  actionPasswordVerified?: boolean;
  verifyActionPassword?: (password: string) => Promise<boolean>;
  onDeletePlayerStats?: (playerName: string) => Promise<void>;
  tournaments?: any[];
  // Deep-links into the Player Input Panel to fix an already-posted record (all player stats
  // here originate from that panel's daily/weekly stats entries, keyed by league + date/week).
  onEditPlayerRecord?: (league: string, period: { date?: string; week?: string }) => void;
}

export const PlayerStats: React.FC<PlayerStatsProps> = ({
  matches,
  isDarkMode,
  actionPasswordVerified = false,
  verifyActionPassword,
  onDeletePlayerStats,
  tournaments,
  onEditPlayerRecord
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("ALL");
  const [selectedLeague, setSelectedLeague] = useState("ALL");
  const [sortBy, setSortBy] = useState<string>("matchesPlayed");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Admin passcode verification modal state
  const [passModal, setPassModal] = useState({ isOpen: false, password: "", error: "", targetPlayer: "" });

  // Custom delete confirmation modal state
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    playerName: string;
  }>({
    isOpen: false,
    playerName: ""
  });

  // Picker shown when a player's stats were posted across more than one daily/weekly record,
  // so the admin chooses which one to jump into and fix.
  const [editPickerModal, setEditPickerModal] = useState<{
    isOpen: boolean;
    playerName: string;
    records: { league: string; date?: string; week?: string; label: string }[];
  }>({ isOpen: false, playerName: "", records: [] });

  // Reset selected team whenever selected league changes
  useEffect(() => {
    setSelectedTeam("ALL");
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

  // Extract unique teams list that actually played in the selected tournament/league
  const uniqueTeams = useMemo(() => {
    const teamsSet = new Set<string>();
    matches.forEach((m) => {
      // If a tournament filter is active, only collect teams from that tournament
      if (selectedLeague !== "ALL" && (m.league || "").trim().toLowerCase() !== selectedLeague.toLowerCase()) return;
      (m.teams || []).forEach((t) => {
        if (t.name) teamsSet.add(t.name.trim());
      });
    });
    return Array.from(teamsSet).sort();
  }, [matches, selectedLeague]);

  // Extract dynamic columns depending on the selected tournament
  const dynamicColumns = useMemo(() => {
    return [
      { key: "matchesPlayed", label: "Match Played", type: "number" },
      { key: "elims", label: "Kills", type: "number" },
      { key: "damage", label: "Damage", type: "number" },
      { key: "assists", label: "Assist", type: "number" },
    ];
  }, []);

  // Extract all individual player match records across all teams & games
  const playerStats = useMemo(() => {
    const stats: { [name: string]: any } = {};

    matches.forEach((m) => {
      // Filter by league/competition (case-insensitive & trimmed)
      if (selectedLeague !== "ALL" && (m.league || "").trim().toLowerCase() !== selectedLeague.toLowerCase()) return;

      (m.teams || []).forEach((t) => {
        // Filter by team
        if (selectedTeam !== "ALL" && t.name !== selectedTeam) return;

        (t.players || []).forEach((p) => {
          const name = p.name.trim();
          if (!name) return;

          if (!stats[name]) {
            stats[name] = {
              name,
              role: p.role || "Player",
              teamName: t.name || "",
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
              error: 0
            };
          }

          const ps = stats[name];
          if (m.isDailyStats) {
            ps.matchesCount += p.matchesPlayed !== undefined ? p.matchesPlayed : 0;
            ps.elims += p.elims || 0;
            ps.assists += p.assists || 0;
            ps.damage += p.damage || 0;
            ps.knocks += p.knocks || 0;
            ps.heals += p.heals || 0;
            ps.wwcdCount += p.wwcdCount || 0;
            ps.placementPoints += p.placementPoints || 0;
            ps.error += p.error || 0;

            // Dynamically aggregate other numeric properties
            Object.entries(p).forEach(([k, v]) => {
              if (typeof v === "number" && !["elims", "placementPoints", "wwcdCount", "damage", "assists", "heals", "matchesPlayed", "error"].includes(k)) {
                ps[k] = (ps[k] || 0) + v;
              }
            });
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
          ps.teamName = t.name || ps.teamName;

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

    // Final calculations
    return Object.values(stats)
      .filter((p: any) => p.matchesCount > 0)
      .map((p) => {
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
        totalPoints: Math.round(totalPoints * 10) / 10
      };
    });
  }, [matches, selectedLeague, selectedTeam]);

  const filteredPlayers = useMemo(() => {
    return playerStats
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

        return valB - valA;
      });
  }, [playerStats, searchTerm, sortBy]);

  const getPlayerBadge = (p: typeof playerStats[0]) => {
    if (p.avgElims >= 3.0) return { label: "Terminator", color: "bg-red-500/15 border-red-500/30 text-red-400" };
    if (p.avgDamage >= 450) return { label: "Apex Fragger", color: "bg-amber-500/15 border-amber-500/30 text-amber-400" };
    if (p.avgHeals >= 2.5) return { label: "Field Medic", color: "bg-green-500/15 border-green-500/30 text-green-400" };
    if (p.mvpRate >= 30) return { label: "G.O.A.T", color: "bg-purple-500/15 border-purple-500/30 text-purple-400" };
    const upperRole = (p.role || "").toUpperCase();
    if (upperRole === "COACH") return { label: "Coach", color: "bg-blue-500/15 border-blue-500/30 text-blue-400" };
    if (upperRole === "ANALIS") return { label: "Analis", color: "bg-teal-500/15 border-teal-500/30 text-teal-400" };
    return { label: "Player", color: "bg-slate-500/15 border-slate-500/30 text-slate-400" };
  };

  const handleDeleteClick = (playerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionPasswordVerified) {
      setDeleteConfirmModal({
        isOpen: true,
        playerName
      });
    } else {
      setPassModal({ isOpen: true, password: "", error: "", targetPlayer: playerName });
    }
  };

  // Every player stat here comes from a daily/weekly record saved in the Player Input Panel -
  // find every such record that already lists this player, so "Edit" can deep-link right to it.
  const getPlayerDailyRecords = (playerName: string) => {
    const target = playerName.trim().toLowerCase();
    const records: { league: string; date?: string; week?: string; label: string }[] = [];
    matches.forEach(m => {
      if (!m.isDailyStats) return;
      const hasPlayer = (m.teams || []).some(t => (t.players || []).some(p => p.name.trim().toLowerCase() === target));
      if (!hasPlayer) return;
      const isWeekRecord = (m.matchCode || "").toUpperCase().startsWith("DAILY_WEEK");
      records.push({
        league: m.league || "",
        date: isWeekRecord ? undefined : m.date,
        week: isWeekRecord ? m.date : undefined,
        label: `${m.league || "-"} • ${m.date || "-"}`
      });
    });
    return records;
  };

  const handleEditClick = (playerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const records = getPlayerDailyRecords(playerName);
    if (records.length === 0) return;
    if (records.length === 1) {
      if (onEditPlayerRecord) onEditPlayerRecord(records[0].league, { date: records[0].date, week: records[0].week });
      return;
    }
    setEditPickerModal({ isOpen: true, playerName, records });
  };

  const handleVerifyPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyActionPassword || !onDeletePlayerStats) return;
    const isOk = await verifyActionPassword(passModal.password);
    if (isOk) {
      const pName = passModal.targetPlayer;
      setPassModal({ isOpen: false, password: "", error: "", targetPlayer: "" });
      setDeleteConfirmModal({
        isOpen: true,
        playerName: pName
      });
    } else {
      setPassModal(prev => ({ ...prev, error: "Password salah atau tidak memiliki otoritas admin." }));
    }
  };

  return (
    <div className="space-y-6">
      {/* FILTER PANEL */}
      <div className={`p-5 rounded-2xl flex flex-col gap-4 transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200 shadow-sm"
      }`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Player Search Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">CARI PRO PLAYER:</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Ketik nama pro player..."
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
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">PILIH LIGA/KOMPETISI:</label>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
              }`}
            >
              <option value="ALL">-- SEMUA KOMPETISI --</option>
              {uniqueLeagues.map((league) => (
                <option key={league} value={league}>{league}</option>
              ))}
            </select>
          </div>

          {/* Team Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">PILIH TIM/SQUAD:</label>
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
                <option value="ALL">-- PILIH LIGA TERLEBIH DAHULU --</option>
              ) : (
                <>
                  <option value="ALL">-- SEMUA SQUAD --</option>
                  {uniqueTeams.map((team) => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">URUTKAN BERDASARKAN:</label>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
              }`}
            >
              <option value="matchesPlayed">Match Played</option>
              <option value="elims">Total Kills</option>
              <option value="damage">Total Damage</option>
              <option value="assists">Total Assist</option>
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
              <span>Tabel Standings</span>
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
              Sistem pelacakan telah disederhanakan untuk hanya melakukan log performa tim (Eliminations & Placement) tanpa rincian stats pro player individual per game.
            </p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className={`py-12 text-center font-mono text-xs rounded-2xl ${
            isDarkMode ? "bg-slate-900/50 text-slate-500" : "bg-white border border-slate-200 text-slate-600"
          }`}>
            Tidak ada pemain yang sesuai dengan kriteria filter.
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
                    <th className="py-3 px-4 text-center w-12">#</th>
                    <th className="py-3 px-4">Player Name</th>
                    <th className="py-3 px-4">Team</th>
                    {dynamicColumns.map(col => (
                      <th key={col.key} className="py-3 px-4 text-center min-w-[80px] uppercase">
                        {col.label}
                      </th>
                    ))}
                    {actionPasswordVerified && (
                      <th className="py-3 px-4 text-center w-36 text-red-500 font-extrabold uppercase tracking-wider">Aksi Admin</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {filteredPlayers.map((p, index) => {
                    return (
                      <React.Fragment key={p.name}>
                        <tr 
                          className={`transition-all ${
                            isDarkMode 
                              ? "text-slate-300 hover:bg-slate-900/20 border-b border-slate-900/50" 
                              : "text-slate-700 hover:bg-slate-50 border-b border-slate-200"
                          }`}
                        >
                          {/* Rank # */}
                          <td className="py-3 px-4 text-center font-bold">
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
                          <td className="py-3 px-4 font-bold">
                            <span className="tracking-tight">{p.name}</span>
                          </td>
                          {/* Team name */}
                          <td className="py-3 px-4 font-semibold text-slate-300">
                            <span className="tracking-tight text-slate-300">{p.teamName || "-"}</span>
                          </td>
                          {/* Dynamic columns values */}
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
                                    {total}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block">avg: {avg}</span>
                                </td>
                            );
                          })}
                          {/* Admin Actions */}
                          {actionPasswordVerified && (
                            <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => handleEditClick(p.name, e)}
                                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400 font-mono font-extrabold text-[10px] tracking-wide uppercase transition-all duration-200 cursor-pointer inline-flex items-center gap-1.5 shadow-md"
                                  title="Edit Data Stats Player Yang Sudah Diposting"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteClick(p.name, e)}
                                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white border border-red-500 font-mono font-extrabold text-[10px] tracking-wide uppercase transition-all duration-200 cursor-pointer inline-flex items-center gap-1.5 shadow-md hover:shadow-red-900/20"
                                  title="Hapus Seluruh Data Stats Player"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Hapus Player</span>
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
              const badge = getPlayerBadge(p);
              return (
                <div 
                  key={p.name}
                  className={`rounded-2xl p-5 border transition-all relative overflow-hidden shadow-sm ${
                    isDarkMode 
                      ? "bg-slate-900/40 border-slate-800" 
                      : "bg-white border-slate-200"
                  }`}
                >
                  {/* Background accent */}
                  <div className="absolute top-0 right-0 p-3 z-10">
                    <span className={`text-[9px] px-2 py-0.5 rounded border font-mono font-bold ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20 shadow-inner shrink-0 font-bold font-mono text-lg uppercase">
                      {p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className={`font-bold text-sm font-mono tracking-tight flex items-center gap-1.5 ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                        {p.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mt-0.5">
                        {p.teamName && <span className="text-slate-400 font-bold">{p.teamName}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Rating point display */}
                  <div className="mt-4 px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-800/40 flex justify-between items-center font-mono">
                    <span className="text-[9px] uppercase font-bold text-slate-400">Total Score Rating:</span>
                    <span className="text-amber-500 font-extrabold text-xs">{p.totalPoints} pts</span>
                  </div>

                  {/* Core parameters stats bar */}
                  <div className="grid grid-cols-4 gap-2 mt-4 border-t border-b border-slate-800/50 py-3.5 font-mono text-center">
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
                    <div>
                      <div className="text-[8px] text-slate-500 uppercase font-bold tracking-tight">AST</div>
                      <div className="text-xs font-extrabold text-indigo-400 mt-1">{p.assists}</div>
                      <div className="text-[8px] text-slate-500">Avg: {p.matchesCount > 0 ? Math.round((p.assists / p.matchesCount) * 10) / 10 : 0}</div>
                    </div>
                  </div>

                  {/* Admin Actions */}
                  {actionPasswordVerified && (
                    <div className="mt-4 pt-3 border-t border-slate-800/20 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleEditClick(p.name, e)}
                        className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400 font-mono font-extrabold text-[11px] tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(p.name, e)}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white border border-red-500 font-mono font-extrabold text-[11px] tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-md hover:shadow-red-900/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
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
                Verifikasi Hak Akses Admin
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center">
                MASUKKAN PASSWORD KHUSUS ADMIN UNTUK MENGHAPUS STATS
              </p>
            </div>

            <form onSubmit={handleVerifyPass} className="p-6 space-y-4 text-xs">
              <div className="space-y-2">
                <label className={`block font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>PASSWORD AKSI (RESTRICTED ACCESS):</label>
                <input
                  type="password"
                  value={passModal.password}
                  onChange={(e) => setPassModal(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Masukkan password khusus"
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
                  onClick={() => setPassModal({ isOpen: false, password: "", error: "", targetPlayer: "" })}
                  className={`flex-1 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                    isDarkMode 
                      ? "border-slate-800 hover:bg-slate-800 text-slate-400" 
                      : "border-slate-200 hover:bg-slate-100 text-slate-500"
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all cursor-pointer shadow-lg shadow-amber-500/10"
                >
                  Verifikasi
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
                Hapus Stats Pemain
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center uppercase font-mono">
                Tindakan ini tidak dapat dibatalkan!
              </p>
            </div>

            <div className="p-6 space-y-4 text-xs text-center font-mono">
              <p className={`${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                Apakah Anda yakin ingin menghapus seluruh data stats player "{deleteConfirmModal.playerName}" dari semua match record secara permanen?
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmModal({ isOpen: false, playerName: "" })}
                  className={`flex-1 border rounded-lg py-2 font-bold cursor-pointer transition-all text-center ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 border-slate-200"}`}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeletePlayerStats) {
                      onDeletePlayerStats(deleteConfirmModal.playerName);
                    }
                    setDeleteConfirmModal({ isOpen: false, playerName: "" });
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg py-2 font-bold cursor-pointer transition-all flex items-center justify-center gap-1 shadow-lg shadow-red-600/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Ya, Hapus</span>
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
                Pilih Record Untuk Diedit
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center font-mono">
                {editPickerModal.playerName} tercatat di beberapa record
              </p>
            </div>

            <div className="p-5 space-y-2 text-xs font-mono">
              {editPickerModal.records.map((rec, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setEditPickerModal({ isOpen: false, playerName: "", records: [] });
                    if (onEditPlayerRecord) onEditPlayerRecord(rec.league, { date: rec.date, week: rec.week });
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
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
