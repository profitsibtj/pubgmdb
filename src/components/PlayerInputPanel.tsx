import React, { useState, useMemo, useEffect } from "react";
import { Match, Team, Player } from "../types";
import { RosterPlayer } from "./RosterManager";
import { 
  Users, Save, RefreshCw, Layers, CheckCircle,
  Plus, Trash2
} from "lucide-react";

interface PlayerInputPanelProps {
  matches: Match[];
  roster: RosterPlayer[];
  onSaveMatch: (match: Match) => Promise<void>;
  isDarkMode: boolean;
  tournaments?: any[];
}

interface ColumnConfig {
  key: string;
  label: string;
  type: "string" | "number";
}

interface DailyPlayer {
  name: string;
  team: string;
  stats: Record<string, any>;
}

export const PlayerInputPanel: React.FC<PlayerInputPanelProps> = ({
  matches,
  roster,
  onSaveMatch,
  isDarkMode,
  tournaments
}) => {
  // 1. Tournament Selection - Strictly synchronized with non-daily matches
  const [selectedLeague, setSelectedLeague] = useState<string>("");

  const leagues = useMemo(() => {
    const list = new Set<string>();
    // First, add all tournaments configured in tournaments list
    if (tournaments && tournaments.length > 0) {
      tournaments.forEach(t => {
        if (t.name) list.add(t.name.trim());
      });
    } else {
      const stored = localStorage.getItem("tournaments_list_v4");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            parsed.forEach((t: any) => {
              if (t.name) list.add(t.name.trim());
            });
          }
        } catch (e) {}
      }
    }
    // Second, add any other leagues from matches
    matches.forEach(m => { 
      if (m.league && !m.isDailyStats) {
        list.add(m.league.trim()); 
      }
    });
    return Array.from(list).sort();
  }, [tournaments, matches]);

  // Auto select first tournament on load
  useEffect(() => {
    if (leagues.length > 0 && !selectedLeague) {
      setSelectedLeague(leagues[0]);
    }
  }, [leagues, selectedLeague]);

  // 2. Extract existing dates for the selected tournament
  const availableDates = useMemo(() => {
    if (!selectedLeague) return [];
    const dates = new Set<string>();
    matches.forEach(m => {
      if (!m.isDailyStats && m.league && m.league.toLowerCase().trim() === selectedLeague.toLowerCase().trim() && m.date) {
        dates.add(m.date);
      }
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a)); // Descending
  }, [matches, selectedLeague]);

  // 3. Date Selection state
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Adjust date selection when selectedLeague or availableDates changes
  useEffect(() => {
    if (availableDates.length > 0) {
      setSelectedDate(availableDates[0]);
    } else {
      setSelectedDate("");
    }
  }, [selectedLeague, availableDates]);

  // 4. Dynamic Columns state
  const [columns, setColumns] = useState<ColumnConfig[]>([
    { key: "name", label: "Player", type: "string" },
    { key: "team", label: "Team", type: "string" },
    { key: "matchesPlayed", label: "Matches", type: "number" },
    { key: "elims", label: "Kills", type: "number" },
    { key: "damage", label: "Damage", type: "number" },
    { key: "error", label: "Error", type: "number" },
  ]);

  // 5. Flat list of player rows (no grouping by team!)
  const [flatPlayers, setFlatPlayers] = useState<DailyPlayer[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // States for custom column addition to avoid iframe prompt/confirm issues
  const [showAddColInput, setShowAddColInput] = useState(false);
  const [newColName, setNewColName] = useState("");

  // Load existing daily stats match record if it exists
  const loadExistingDailyStats = React.useCallback(() => {
    if (!selectedLeague || !selectedDate) {
      setFlatPlayers([]);
      return;
    }

    const foundDailyMatch = matches.find(m => 
      m.isDailyStats === true && 
      (m.league || "").toLowerCase().trim() === selectedLeague.toLowerCase().trim() &&
      m.date === selectedDate
    );

    if (foundDailyMatch) {
      // Load custom columns config from match record if it exists, otherwise use current columns
      const loadedCols: ColumnConfig[] = (foundDailyMatch as any).customColumns || [
        { key: "name", label: "Player", type: "string" },
        { key: "team", label: "Team", type: "string" },
        { key: "matchesPlayed", label: "Matches", type: "number" },
        { key: "elims", label: "Kills", type: "number" },
        { key: "damage", label: "Damage", type: "number" },
      ];
      setColumns(loadedCols);

      const loadedPlayers: DailyPlayer[] = [];
      (foundDailyMatch.teams || []).forEach(t => {
        (t.players || []).forEach(p => {
          const statsMap: Record<string, any> = {};
          loadedCols.forEach(col => {
            if (col.key !== "name" && col.key !== "team") {
              statsMap[col.key] = (p as any)[col.key] !== undefined ? (p as any)[col.key] : 0;
            }
          });
          loadedPlayers.push({
            name: p.name,
            team: t.name,
            stats: statsMap
          });
        });
      });

      setFlatPlayers(loadedPlayers);
      setStatusMsg({ type: "success", text: "Berhasil memuat data stats harian yang tersimpan!" });
    } else {
      // Set to blank player rows with default 0 stats as requested by user
      const defaultCols: ColumnConfig[] = [
        { key: "name", label: "Player", type: "string" },
        { key: "team", label: "Team", type: "string" },
        { key: "matchesPlayed", label: "Matches", type: "number" },
        { key: "elims", label: "Kills", type: "number" },
        { key: "damage", label: "Damage", type: "number" },
      ];
      setColumns(defaultCols);

      // Start with 1 blank row where all is set to 0/empty
      const initialPlayers: DailyPlayer[] = [
        {
          name: "",
          team: "",
          stats: {
            matchesPlayed: 0,
            elims: 0,
            damage: 0,
          }
        }
      ];

      setFlatPlayers(initialPlayers);
      setStatusMsg(null);
    }
  }, [selectedLeague, selectedDate, matches]);

  // Load whenever selected league or date changes
  useEffect(() => {
    loadExistingDailyStats();
  }, [selectedLeague, selectedDate, matches.length]);

  // Add Dynamic Column via Custom Inline Form
  const submitAddColumn = () => {
    const trimmed = newColName.trim();
    if (!trimmed) return;

    // Check duplicate
    const exists = columns.some(col => col.label.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      alert("Kolom dengan nama tersebut sudah ada!");
      return;
    }

    const key = `custom_${Date.now()}`;
    setColumns(prev => [
      ...prev,
      { key, label: trimmed, type: "number" }
    ]);

    // Update stats dictionary on existing player rows
    setFlatPlayers(prev => prev.map(p => ({
      ...p,
      stats: {
        ...p.stats,
        [key]: 0
      }
    })));

    setShowAddColInput(false);
    setNewColName("");
  };

  // Rename Column Label
  const handleRenameColumn = (key: string, newLabel: string) => {
    setColumns(prev => prev.map(col => {
      if (col.key === key) {
        return { ...col, label: newLabel };
      }
      return col;
    }));
  };

  // Delete Column (confirm-free to avoid iframe blocks)
  const handleDeleteColumn = (key: string) => {
    if (key === "name" || key === "team") return;

    setColumns(prev => prev.filter(col => col.key !== key));
    setFlatPlayers(prev => prev.map(p => {
      const nextStats = { ...p.stats };
      delete nextStats[key];
      return {
        ...p,
        stats: nextStats
      };
    }));
  };

  // Add Player row (starts empty and defaults to 0)
  const handleAddPlayerRow = () => {
    const newPlayer: DailyPlayer = {
      name: "",
      team: "",
      stats: {} as Record<string, any>
    };

    columns.forEach(col => {
      if (col.key !== "name" && col.key !== "team") {
        newPlayer.stats[col.key] = 0;
      }
    });

    setFlatPlayers(prev => [...prev, newPlayer]);
  };

  // Delete Player row (confirm-free to avoid iframe blocks)
  const handleDeletePlayerRow = (idx: number) => {
    setFlatPlayers(prev => prev.filter((_, i) => i !== idx));
  };

  // Update specific cell values
  const handleUpdatePlayerCell = (idx: number, field: "name" | "team", value: string) => {
    setFlatPlayers(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        [field]: value
      };
      return next;
    });
  };

  const handleUpdatePlayerStatCell = (idx: number, colKey: string, value: any) => {
    setFlatPlayers(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        stats: {
          ...next[idx].stats,
          [colKey]: value
        }
      };
      return next;
    });
  };

  // Save All flat players to Firestore as grouped team objects
  const handleSaveAllDailyStats = async () => {
    const finalLeagueName = selectedLeague.trim();
    if (!finalLeagueName) {
      alert("Harap pilih turnamen!");
      return;
    }
    if (!selectedDate) {
      alert("Harap pilih tanggal!");
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);

    try {
      // 1. Group the flat list of players by their team value
      const playersByTeam: Record<string, DailyPlayer[]> = {};
      flatPlayers.forEach(p => {
        const tName = (p.team || "Independent").trim();
        if (!playersByTeam[tName]) {
          playersByTeam[tName] = [];
        }
        playersByTeam[tName].push(p);
      });

      // 2. Map grouped teams to Team[] array
      const savedTeams: Team[] = Object.entries(playersByTeam).map(([teamName, players]) => {
        let teamTotalElims = 0;
        let teamTotalPlacements = 0;
        let teamTotalWwcd = 0;

        const mappedPlayers = players.map(p => {
          const playerElims = Number(p.stats["elims"]) || 0;
          const playerPlacements = Number(p.stats["placementPoints"]) || 0;
          const playerWwcd = Number(p.stats["wwcdCount"]) || 0;

          teamTotalElims += playerElims;
          teamTotalPlacements += playerPlacements;
          teamTotalWwcd += playerWwcd;

          const playerObj: any = {
            name: p.name.trim(),
            role: "Player",
            elims: playerElims,
            placementPoints: playerPlacements,
            wwcdCount: playerWwcd,
            damage: Number(p.stats["damage"]) || 0,
            assists: Number(p.stats["assists"]) || 0,
            heals: Number(p.stats["heals"]) || 0,
            matchesPlayed: Number(p.stats["matchesPlayed"]) || 0,
            error: Number(p.stats["error"]) || 0,
          };

          // Save any custom/extra keys as-is directly on player object
          Object.entries(p.stats).forEach(([k, v]) => {
            if (!["elims", "placementPoints", "wwcdCount", "damage", "assists", "heals", "matchesPlayed", "error"].includes(k)) {
              playerObj[k] = v;
            }
          });

          return playerObj;
        });

        return {
          name: teamName,
          placement: 1, // Placeholder
          eliminationPoints: teamTotalElims,
          placementPoints: teamTotalPlacements,
          totalPoints: teamTotalElims + teamTotalPlacements,
          wwcd: teamTotalWwcd > 0,
          players: mappedPlayers
        };
      });

      // 3. Create full daily Match document
      const docId = `daily_${finalLeagueName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${selectedDate}`;
      const dailyMatchRecord: Match = {
        id: docId,
        league: finalLeagueName,
        date: selectedDate,
        gameNo: "Daily Stats",
        matchCode: "DAILY_" + selectedDate.replace(/-/g, ""),
        map: "All Maps",
        isDailyStats: true,
        teams: savedTeams
      };

      // Add customColumns to the record
      (dailyMatchRecord as any).customColumns = columns;

      await onSaveMatch(dailyMatchRecord);

      setStatusMsg({ 
        type: "success", 
        text: `Semua statistik harian player berhasil disimpan secara permanen!` 
      });
    } catch (err: any) {
      setStatusMsg({ type: "error", text: "Gagal menyimpan statistik: " + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-mono">
      {/* HEADER SECTION */}
      <div className={`p-6 rounded-2xl shadow-xl transition-all ${isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200"}`}>
        <div className="border-b pb-4 border-slate-800">
          <h2 className={`text-lg font-bold font-display uppercase tracking-tight ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
            TAMBAH DATA PLAYER BARU
          </h2>
        </div>
      </div>

      {/* SELECTION FLOW CARD */}
      <div className={`p-5 rounded-2xl space-y-4 transition-all ${
        isDarkMode ? "bg-slate-900/40" : "bg-white border border-slate-200 shadow-sm"
      }`}>
        <h3 className="text-xs font-extrabold uppercase text-amber-500 flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Pilih turnamen
        </h3>

        {leagues.length === 0 ? (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 text-xs">
            ⚠️ <strong>Perhatian:</strong> Belum ada data pertandingan yang di-import. Silakan import Match Log terlebih dahulu di tab <strong>"Import Match Log"</strong> agar turnamen dan tanggal dapat disinkronkan secara otomatis.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* League Select */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">1. Pilih Liga / Turnamen:</label>
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                className={`w-full rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              >
                <option value="">-- Pilih Liga / Turnamen --</option>
                {leagues.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Date Dropdown strictly from match logs */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">2. Pilih Tanggal Pertandingan:</label>
              {availableDates.length > 0 ? (
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className={`w-full rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                >
                  <option value="">-- Pilih Tanggal Yang Ada --</option>
                  {availableDates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              ) : (
                <div className="p-2.5 bg-slate-950/20 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs italic">
                  {selectedLeague ? "Tidak ada tanggal pertandingan untuk turnamen ini di Match Log." : "Harap pilih turnamen terlebih dahulu."}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SPREADSHEET */}
      {selectedLeague && selectedDate && (
        <div className="space-y-4">
          <div className={`p-5 rounded-2xl space-y-5 border transition-all ${
            isDarkMode ? "bg-slate-950 border-slate-850" : "bg-white border-slate-200 shadow-sm"
          }`}>
            
            {/* Spreadsheet Header Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <span className="text-xs font-extrabold uppercase text-amber-500 flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                Spreadsheet Input Player ({flatPlayers.length} Pemain)
              </span>

              <div className="flex flex-wrap items-center gap-2">
                {showAddColInput ? (
                  <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800 animate-fadeIn">
                    <input
                      type="text"
                      placeholder="Nama kolom..."
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      className="px-2 py-1 text-[10px] bg-slate-950 text-white border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 w-32 font-bold font-mono uppercase"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          submitAddColumn();
                        } else if (e.key === 'Escape') {
                          setShowAddColInput(false);
                          setNewColName("");
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={submitAddColumn}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[9px] rounded-lg uppercase cursor-pointer transition-all"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddColInput(false);
                        setNewColName("");
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-[9px] rounded-lg uppercase cursor-pointer transition-all"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddColInput(true)}
                    className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-amber-500 font-bold text-[10px] rounded-lg transition-all flex items-center gap-1 cursor-pointer border border-amber-500/10"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Kolom</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddPlayerRow}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Player</span>
                </button>
              </div>
            </div>

            {/* SPREADSHEET SCROLL CONTAINER */}
            <div className="overflow-x-auto rounded-xl border border-slate-800/20">
              <table className="w-full text-left border-collapse text-xs font-mono min-w-[900px]">
                <thead>
                  <tr className={`border-b text-[10px] uppercase font-bold tracking-wider ${
                    isDarkMode ? "bg-slate-900/60 border-slate-850 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-500"
                  }`}>
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    {columns.map(col => (
                      <th key={col.key} className="py-2.5 px-3 text-center min-w-[130px]">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="text"
                            value={col.label}
                            onChange={(e) => handleRenameColumn(col.key, e.target.value)}
                            className="w-full text-center bg-transparent border-b border-transparent hover:border-slate-500/40 focus:border-amber-500 text-[10px] font-extrabold uppercase focus:outline-none py-0.5 text-amber-500 focus:bg-slate-900/40"
                            placeholder="Kategori..."
                          />
                          {col.key !== "name" && col.key !== "team" && (
                            <button
                              type="button"
                              onClick={() => handleDeleteColumn(col.key)}
                              className="text-[8px] text-red-400/60 hover:text-red-400 uppercase tracking-tighter"
                              title="Hapus Kolom"
                            >
                              [Hapus]
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="py-2.5 px-3 w-16 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/20">
                  {flatPlayers.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 2} className="py-8 text-center text-slate-500 italic">
                        Belum ada data player. Silakan klik "Tambah Player" untuk memulai.
                      </td>
                    </tr>
                  ) : (
                    flatPlayers.map((p, idx) => (
                      <tr key={idx} className={isDarkMode ? "bg-slate-950/20 hover:bg-slate-900/10" : "bg-white hover:bg-slate-50/50"}>
                        {/* No. */}
                        <td className="py-1 px-2 text-center text-[10px] font-bold text-slate-500">
                           {idx + 1}
                        </td>

                        {/* Columns Render */}
                        {columns.map(col => {
                          if (col.key === "name") {
                            return (
                              <td key={col.key} className="py-1 px-1.5">
                                <input
                                  type="text"
                                  value={p.name}
                                  onChange={(e) => handleUpdatePlayerCell(idx, "name", e.target.value)}
                                  placeholder="Player..."
                                  className={`w-full rounded p-1 text-xs font-bold border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                    isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  }`}
                                />
                              </td>
                            );
                          } else if (col.key === "team") {
                            return (
                              <td key={col.key} className="py-1 px-1.5">
                                <input
                                  type="text"
                                  value={p.team}
                                  onChange={(e) => handleUpdatePlayerCell(idx, "team", e.target.value)}
                                  placeholder="Team..."
                                  className={`w-full rounded p-1 text-xs font-bold border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                    isDarkMode ? "bg-slate-900 border-slate-800 text-teal-400" : "bg-slate-50 border-slate-200 text-teal-600"
                                  }`}
                                />
                              </td>
                            );
                          } else {
                            return (
                              <td key={col.key} className="py-1 px-1.5">
                                <input
                                  type="number"
                                  value={p.stats[col.key] !== undefined ? p.stats[col.key] : 0}
                                  onChange={(e) => handleUpdatePlayerStatCell(idx, col.key, Number(e.target.value) || 0)}
                                  className={`w-full rounded p-1 text-xs text-center font-semibold border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                    isDarkMode ? "bg-slate-900 border-slate-800 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-800"
                                  }`}
                                />
                              </td>
                            );
                          }
                        })}

                        {/* Action Row */}
                        <td className="py-1 px-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeletePlayerRow(idx)}
                            className="p-1 text-slate-500 hover:text-red-500 transition-colors cursor-pointer"
                            title="Hapus Player"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>

          {/* SAVE CONTROLS */}
          {flatPlayers.length > 0 && (
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleSaveAllDailyStats}
                disabled={isSaving}
                className={`w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isSaving
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-amber-500 hover:bg-amber-400 text-slate-950 hover:scale-[1.01] active:scale-[0.99]"
                }`}
              >
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 text-slate-950" />
                )}
                <span>{isSaving ? "Menyimpan data..." : "Simpan Semua Stats Harian"}</span>
              </button>
            </div>
          )}

        </div>
      )}

      {/* STATUS AND TOASTS */}
      {statusMsg && (
        <div className={`p-4 rounded-xl flex items-center gap-2 text-xs font-bold font-mono uppercase ${
          statusMsg.type === "success" 
            ? "bg-green-500/10 border border-green-500/20 text-green-400" 
            : "bg-red-500/10 border border-red-500/20 text-red-400"
        }`}>
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}
    </div>
  );
};
