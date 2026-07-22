import React, { useState, useMemo } from "react";
import { Match, Team } from "../types";
import {
  ChevronDown, ChevronUp, Search, Calendar, MapPin, Trash2, Edit2, Play, RefreshCw, Star
} from "lucide-react";

interface MatchExplorerProps {
  matches: Match[];
  isLoading: boolean;
  onDeleteMatch: (id: string) => Promise<void>;
  onEditMatch: (match: Match) => void;
  isDarkMode: boolean;
  actionPasswordVerified: boolean;
}

export const MatchExplorer: React.FC<MatchExplorerProps> = ({
  matches,
  isLoading,
  onDeleteMatch,
  onEditMatch,
  isDarkMode,
  actionPasswordVerified
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMap, setSelectedMap] = useState("ALL");
  const [selectedLeague, setSelectedLeague] = useState("ALL");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  // Custom delete confirmation modal state
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    targetId: string;
  }>({
    isOpen: false,
    targetId: ""
  });

  // Extract unique maps and leagues from existing matches for filtering
  const mapsList = useMemo(() => {
    const defaultMaps = ["Erangel", "Miramar", "Sanhok", "Rondo"];
    const list = matches.filter(m => !m.isDailyStats).map(m => m.map).filter(Boolean);
    const combined = Array.from(new Set([...defaultMaps, ...list]));
    return ["ALL", ...combined];
  }, [matches]);

  const leaguesList = useMemo(() => {
    const list = matches.filter(m => !m.isDailyStats).map(m => m.league).filter(Boolean);
    return ["ALL", ...Array.from(new Set(list))];
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (m.isDailyStats) return false;
      const matchSearch = 
        m.matchCode.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.teams.some(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const mapFilter = selectedMap === "ALL" || m.map === selectedMap;
      const leagueFilter = selectedLeague === "ALL" || m.league === selectedLeague;

      return matchSearch && mapFilter && leagueFilter;
    });
  }, [matches, searchTerm, selectedMap, selectedLeague]);

  const toggleMatch = (id: string) => {
    setExpandedMatch(prev => (prev === id ? null : id));
  };

  // Edit/Delete are only rendered at all when actionPasswordVerified is true (see below),
  // so these handlers can act directly without a per-click password gate.
  const handleDeleteClick = (id: string) => {
    setDeleteConfirmModal({
      isOpen: true,
      targetId: id
    });
  };

  const handleEditClick = (match: Match) => {
    onEditMatch(match);
  };

  return (
    <div className="space-y-6 font-mono text-xs animate-fadeIn">
      {/* SEARCH AND FILTERS */}
      <div className={`p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200 shadow-sm"
      }`}>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Cari Kode Match atau Nama Tim..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
              isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
            }`}
          />
        </div>

        <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[10px] font-bold uppercase">Map:</span>
            <select
              value={selectedMap}
              onChange={(e) => setSelectedMap(e.target.value)}
              className={`p-2 rounded-lg border font-bold cursor-pointer ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            >
              {mapsList.map(m => (
                <option key={m} value={m}>{m === "ALL" ? "SEMUA MAP" : m}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[10px] font-bold uppercase">Liga:</span>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className={`p-2 rounded-lg border font-bold cursor-pointer ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            >
              {leaguesList.map(l => (
                <option key={l} value={l}>{l === "ALL" ? "SEMUA LIGA" : l}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* MATCHES LIST */}
      {isLoading ? (
        <div className={`flex flex-col items-center justify-center py-16 space-y-3 border rounded-2xl ${
          isDarkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <span className="text-slate-500">Retrieving PUBGM match logs...</span>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className={`text-center py-16 border rounded-2xl text-slate-500 ${
          isDarkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
        }`}>
          Tidak ada data match record yang ditemukan.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map((match) => {
            const matchId = match.id || "";
            const isExpanded = expandedMatch === matchId;

            // Find winner of the lobby (placement = 1)
            const lobbyWinner = match.teams.find(t => t.placement === 1);

            return (
              <div 
                key={matchId}
                className={`rounded-2xl overflow-hidden shadow-sm transition-all duration-200 ${
                  isDarkMode 
                    ? isExpanded ? "bg-slate-900" : "bg-slate-900/30 hover:bg-slate-900/50"
                    : isExpanded ? "bg-slate-50 border border-slate-300" : "bg-white border border-slate-200 hover:border-slate-300 hover:shadow"
                }`}
              >
                {/* Collapsed Header Bar */}
                <div 
                  onClick={() => toggleMatch(matchId)}
                  className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="bg-amber-500/10 text-amber-500 p-2.5 rounded-xl border border-amber-500/15 font-bold font-mono text-center shrink-0">
                      <Calendar className="w-4 h-4 mx-auto" />
                      <span className="text-[9px] block mt-1">{match.date.substring(5)}</span>
                    </div>
                    
                    <div className="min-w-0">
                      <h3 className={`font-bold text-sm tracking-tight flex items-center gap-2 ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                        {match.matchCode}
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          isDarkMode ? "bg-slate-950 text-amber-500 border border-slate-850" : "bg-slate-100 text-slate-700"
                        }`}>
                          {match.league || "Tournament"}
                        </span>
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          Map: <strong>{match.map}</strong>
                        </span>
                        <span>•</span>
                        <span>Match: <strong>{match.gameNo.replace(/match\s*|round\s*/gi, "")}</strong></span>
                        {match.patch && (
                          <>
                            <span>•</span>
                            <span>Patch: <strong>{match.patch}</strong></span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary / Controls Column */}
                  <div className="flex items-center gap-4 shrink-0 font-mono text-xs">
                    {lobbyWinner && (
                      <div className="hidden sm:flex flex-col items-end text-right">
                        <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">WWCD</span>
                        <span className="text-amber-500 font-extrabold flex items-center gap-1 text-[11px] uppercase">
                          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                          {lobbyWinner.name}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      {match.liveLink && (
                        <a
                          href={match.liveLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`p-2 rounded-xl border transition-all flex items-center justify-center ${
                            isDarkMode 
                              ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20" 
                              : "bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-200"
                          }`}
                          title="Tonton Match VOD"
                        >
                          <Play className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        </a>
                      )}
                      {actionPasswordVerified && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleEditClick(match); }}
                            className={`p-2 rounded-xl border transition-all ${
                              isDarkMode
                                ? "bg-slate-950 hover:bg-slate-850 text-slate-300 border-slate-800"
                                : "bg-white hover:bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                            title="Edit match log"
                          >
                            <Edit2 className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(matchId); }}
                            className={`p-2 rounded-xl border transition-all ${
                              isDarkMode
                                ? "bg-red-950/20 hover:bg-red-900/30 text-red-400 border-red-900/30"
                                : "bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                            }`}
                            title="Delete match log"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </>
                      )}
                    </div>

                    <div className="p-1 rounded-lg">
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className={`p-4 sm:p-5 border-t animate-slideDown ${
                    isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-100/50 border-slate-200"
                  }`}>
                    <div className="flex justify-between items-center border-b pb-2 mb-4 border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">COMPETING SQUADS RESULTS ({match.teams.length})</span>
                    </div>

                    {/* Render helper for team ranking list */}
                    {(() => {
                      const sortedTeams = [...match.teams].sort((a, b) => a.placement - b.placement);
                      const leftTeams = sortedTeams.slice(0, 8);
                      const rightTeams = sortedTeams.slice(8, 16);

                      const renderTeamCard = (team: Team) => {
                        return (
                          <div 
                            key={team.name}
                            className={`flex items-center justify-between gap-2 py-1.5 px-3 border-b last:border-0 text-xs transition-colors duration-150 ${
                              isDarkMode 
                                ? "border-slate-900/50 hover:bg-slate-950/40" 
                                : "border-slate-100 hover:bg-slate-50/50"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-5 h-5 rounded flex items-center justify-center font-extrabold text-[10px] shrink-0 ${
                                team.placement === 1 
                                  ? "bg-amber-500 text-slate-950" 
                                  : team.placement <= 3 
                                    ? "bg-teal-500 text-slate-950"
                                    : isDarkMode ? "bg-slate-850 text-slate-400" : "bg-slate-100 text-slate-500"
                              }`}>
                                {team.placement}
                              </span>

                              <span className={`font-bold text-xs truncate uppercase ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>
                                {team.name}
                                {team.placement === 1 && <Star className="w-3 h-3 fill-amber-500 text-amber-500 inline ml-1 align-middle" />}
                              </span>
                            </div>

                            <div className="flex items-center gap-4 text-[11px] font-mono shrink-0">
                              <div className="flex items-center gap-1">
                                <span className="text-slate-500 text-[9px] uppercase font-bold">Elims:</span>
                                <strong className="text-teal-400 font-extrabold">{team.eliminationPoints}</strong>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-slate-500 text-[9px] uppercase font-bold">Placement:</span>
                                <strong className="text-slate-400">{team.placementPoints}</strong>
                              </div>
                              <div className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/10 rounded font-black text-amber-500">
                                {team.totalPoints} <span className="text-[8px] text-slate-500 font-normal">pts</span>
                              </div>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Left Column (Teams 1 - 8) */}
                          <div className={`border rounded-xl overflow-hidden ${isDarkMode ? "bg-slate-950/20 border-slate-900" : "bg-white border-slate-200"}`}>
                            <div className={`px-3 py-1.5 border-b font-mono text-[9px] font-bold uppercase tracking-wider ${isDarkMode ? "bg-slate-950/60 border-slate-900 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                              SQUAD 1 - 8
                            </div>
                            <div className={`divide-y ${isDarkMode ? "divide-slate-900/50" : "divide-slate-100"}`}>
                              {leftTeams.map(renderTeamCard)}
                            </div>
                          </div>
                          {/* Right Column (Teams 9 - 16) */}
                          <div className={`border rounded-xl overflow-hidden ${isDarkMode ? "bg-slate-950/20 border-slate-900" : "bg-white border-slate-200"}`}>
                            <div className={`px-3 py-1.5 border-b font-mono text-[9px] font-bold uppercase tracking-wider ${isDarkMode ? "bg-slate-950/60 border-slate-900 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                              SQUAD 9 - 16
                            </div>
                            <div className={`divide-y ${isDarkMode ? "divide-slate-900/50" : "divide-slate-100"}`}>
                              {rightTeams.map(renderTeamCard)}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
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
              <h3 className="text-sm font-bold tracking-tight text-center uppercase">
                Konfirmasi Hapus Match
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center uppercase">
                Tindakan ini tidak dapat dibatalkan!
              </p>
            </div>

            <div className="p-6 space-y-4 text-xs text-center">
              <p className={`${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                Apakah Anda yakin ingin menghapus match record ini secara permanen dari database?
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmModal({ isOpen: false, targetId: "" })}
                  className={`flex-1 border rounded-lg py-2 font-bold cursor-pointer transition-all text-center ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 border-slate-200"}`}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteMatch(deleteConfirmModal.targetId);
                    setDeleteConfirmModal({ isOpen: false, targetId: "" });
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
    </div>
  );
};
