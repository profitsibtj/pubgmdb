import React, { useState } from "react";
import { 
  Plus, Trash2, Edit2, ShieldAlert, Unlock, Lock, Sparkles, RefreshCw, X
} from "lucide-react";
import { Match } from "../types";

export interface RosterPlayer {
  id?: string;
  name: string;
  role: string;
  team: string;
  league: string;
}

interface RosterManagerProps {
  roster: RosterPlayer[];
  matches?: Match[];
  isLoading: boolean;
  onSavePlayer: (player: RosterPlayer) => Promise<void>;
  onDeletePlayer: (id: string) => Promise<void>;
  isDarkMode: boolean;
  verifyActionPassword: (password: string) => Promise<boolean>;
  actionPasswordVerified: boolean;
  setActionPasswordVerified: (verified: boolean) => void;
  tournaments?: any[];
  onUpdateTournaments?: (updatedTournaments: any[]) => void;
}

export const RosterManager: React.FC<RosterManagerProps> = ({
  roster,
  matches = [],
  isLoading,
  onSavePlayer,
  onDeletePlayer,
  isDarkMode,
  verifyActionPassword,
  actionPasswordVerified,
  setActionPasswordVerified,
  tournaments,
  onUpdateTournaments
}) => {
  const [selectedLeague, setSelectedLeague] = useState(() => {
    if (tournaments && tournaments.length > 0) {
      if (tournaments[0]?.name) return tournaments[0].name;
    }
    const stored = localStorage.getItem("tournaments_list_v4");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed[0]?.name) return parsed[0].name;
      } catch (e) {}
    }
    return "PMSL SEA 2026";
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("ALL");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<RosterPlayer | null>(null);
  const [useCustomTeam, setUseCustomTeam] = useState(false);
  
  // Passcode verification modal
  const [passModal, setPassModal] = useState({
    isOpen: false,
    password: "",
    error: "",
    actionType: "" as "edit" | "delete" | "add" | "unlock",
    targetId: ""
  });

  // Custom delete confirmation modal state
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    targetId: string;
  }>({
    isOpen: false,
    targetId: ""
  });

  // Form states
  const [form, setForm] = useState<RosterPlayer>({
    name: "",
    role: "Player",
    team: "Netral",
    league: selectedLeague
  });

  // Unique list of leagues and teams from the roster
  const tournamentsList = React.useMemo(() => {
    if (tournaments && tournaments.length > 0) {
      return tournaments;
    }
    const stored = localStorage.getItem("tournaments_list_v4");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse tournaments in RosterManager", e);
      }
    }
    return [
      { id: "pmsl_sea_2026", name: "PMSL SEA 2026", format: "16", teams16Text: "" }
    ];
  }, [tournaments, matches, roster]);

  const leagues = React.useMemo(() => {
    const tNames = tournamentsList.map((t: any) => t.name).filter(Boolean);
    return Array.from(new Set(tNames));
  }, [tournamentsList]);

  // Keep selectedLeague in sync if it's not found in leagues list
  React.useEffect(() => {
    if (leagues.length > 0 && !leagues.includes(selectedLeague)) {
      setSelectedLeague(leagues[0]);
    }
  }, [leagues, selectedLeague]);

  const getTeamsForLeague = React.useCallback((leagueName: string) => {
    let teamNames: string[] = [];
    const activeTour = tournamentsList.find((t: any) => t.name === leagueName) || tournamentsList[0];
    
    // 1. Extract from tournament preset if available and active matches selection
    if (activeTour && activeTour.name === leagueName) {
      if (activeTour.format === "16") {
        teamNames = (activeTour.teams16Text || "")
          .split("\n")
          .map((t: any) => t.trim())
          .filter((t: any) => t.length > 0);
      } else {
        const grpA = (activeTour.groupAText || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpB = (activeTour.groupBText || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpC = (activeTour.groupCText || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpD = (activeTour.groupDText || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpE = (activeTour.groupEText || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        
        const grpA2 = (activeTour.groupAText_w2 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpB2 = (activeTour.groupBText_w2 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpC2 = (activeTour.groupCText_w2 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpD2 = (activeTour.groupDText_w2 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpE2 = (activeTour.groupEText_w2 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);

        const grpA3 = (activeTour.groupAText_w3 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpB3 = (activeTour.groupBText_w3 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpC3 = (activeTour.groupCText_w3 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpD3 = (activeTour.groupDText_w3 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);
        const grpE3 = (activeTour.groupEText_w3 || "").split("\n").map((t: any) => t.trim()).filter((t: any) => t.length > 0);

        teamNames = [
          ...grpA, ...grpB, ...grpC, ...grpD, ...grpE,
          ...grpA2, ...grpB2, ...grpC2, ...grpD2, ...grpE2,
          ...grpA3, ...grpB3, ...grpC3, ...grpD3, ...grpE3
        ];
      }
    }
    
    // 2. Extract from actual matches under this league
    const matchingMatches = (matches || []).filter(
      (m) => m.league && m.league.trim().toLowerCase() === (leagueName || "").trim().toLowerCase()
    );
    matchingMatches.forEach((m) => {
      (m.teams || []).forEach((t) => {
        if (t.name) {
          teamNames.push(t.name.trim());
        }
      });
    });

    // 3. Extract from existing roster under this league
    const matchingRoster = roster.filter(
      (p) => p.league && p.league.trim().toLowerCase() === (leagueName || "").trim().toLowerCase()
    );
    matchingRoster.forEach((p) => {
      if (p.team) {
        teamNames.push(p.team.trim());
      }
    });

    return Array.from(new Set(teamNames));
  }, [tournamentsList, matches, roster]);
  
  const teamsInSelectedTour = React.useMemo(() => {
    return getTeamsForLeague(form.league);
  }, [getTeamsForLeague, form.league]);

  // Team abbreviations (e.g. "Bigetron by Vitality" -> "BTR") are kept per-league on the
  // tournament preset itself, since teams here are just grouped by name string with no
  // dedicated "team" entity to attach the field to.
  const teamAbbrMap: Record<string, string> = React.useMemo(() => {
    const preset = tournamentsList.find((t: any) => t.name === selectedLeague);
    return (preset && preset.teamAbbreviations) || {};
  }, [tournamentsList, selectedLeague]);

  const handleTeamAbbrChange = (teamName: string, abbr: string) => {
    if (!onUpdateTournaments) return;
    const trimmed = abbr.trim().toUpperCase();
    const updated = tournamentsList.map((t: any) => {
      if (t.name !== selectedLeague) return t;
      const nextAbbrs = { ...(t.teamAbbreviations || {}) };
      if (trimmed) {
        nextAbbrs[teamName] = trimmed;
      } else {
        delete nextAbbrs[teamName];
      }
      return { ...t, teamAbbreviations: nextAbbrs };
    });
    onUpdateTournaments(updated);
  };

  const handleOpenAddForm = () => {
    if (!actionPasswordVerified) {
      setPassModal({
        isOpen: true,
        password: "",
        error: "",
        actionType: "unlock",
        targetId: ""
      });
      return;
    }
    setEditingPlayer(null);
    setUseCustomTeam(false);
    setForm({
      name: "",
      role: "Player",
      team: "Netral",
      league: selectedLeague
    });
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (player: RosterPlayer) => {
    if (!actionPasswordVerified) {
      setPassModal({
        isOpen: true,
        password: "",
        error: "",
        actionType: "unlock",
        targetId: ""
      });
      return;
    }
    setEditingPlayer(player);
    const initialTeams = getTeamsForLeague(player.league);
    const inList = initialTeams.includes(player.team);
    setUseCustomTeam(!inList && !!player.team);

    setForm({ ...player });
    setIsFormOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    if (!actionPasswordVerified) {
      setPassModal({
        isOpen: true,
        password: "",
        error: "",
        actionType: "delete",
        targetId: id
      });
      return;
    }
    setDeleteConfirmModal({
      isOpen: true,
      targetId: id
    });
  };

  const handleVerifyPass = async (e: React.FormEvent) => {
    e.preventDefault();
    const isOk = await verifyActionPassword(passModal.password);
    if (isOk) {
      setActionPasswordVerified(true);
      const action = passModal.actionType;
      const targetId = passModal.targetId;
      
      setPassModal({ isOpen: false, password: "", error: "", actionType: "unlock", targetId: "" });
      
      if (action === "delete" && targetId) {
        setDeleteConfirmModal({
          isOpen: true,
          targetId: targetId
        });
      } else {
        // Just unlock
        setUseCustomTeam(false);
        setForm({
          name: "",
          role: "Player",
          team: "Netral",
          league: selectedLeague
        });
        setIsFormOpen(true);
      }
    } else {
      setPassModal(prev => ({ ...prev, error: "Password aksi salah! Akses ditolak." }));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await onSavePlayer(form);
      setIsFormOpen(false);
      setEditingPlayer(null);
    } catch (err: any) {
      alert("Error saving player: " + err.message);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-mono">
      {/* HEADER BAR */}
      <div className={`p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200"
      }`}>
        <div>
          <h2 className={`text-base font-bold uppercase tracking-tight flex items-center gap-2 ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
            <Sparkles className="w-5 h-5 text-amber-500" />
            Squad Roster Panel
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {actionPasswordVerified ? (
            <button
              onClick={() => setActionPasswordVerified(false)}
              className="px-4 py-2 text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Lock className="w-4 h-4 shrink-0 text-red-400" />
              Lock Actions Mode
            </button>
          ) : (
            <button
              onClick={() => setPassModal({ isOpen: true, password: "", error: "", actionType: "unlock", targetId: "" })}
              className={`px-4 py-2 text-xs font-semibold border rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer ${
                isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200"
              }`}
            >
              <Unlock className="w-4 h-4 shrink-0 text-amber-500" />
              Unlock Admin Actions
            </button>
          )}

          <button
            onClick={handleOpenAddForm}
            className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow shadow-amber-500/10 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            Add New Player
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className={`p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200"
      }`}>
        <div className="flex flex-wrap items-center gap-4 text-xs w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase text-[10px] font-bold">Liga/Kompetisi:</span>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className={`p-2 rounded-lg border cursor-pointer font-bold ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            >
              {leagues.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase text-[10px] font-bold">Role:</span>
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className={`p-2 rounded-lg border cursor-pointer font-bold ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            >
              <option value="ALL">SEMUA ROLE</option>
              <option value="Player">Player</option>
              <option value="Coach">Coach</option>
              <option value="Analis">Analis</option>
            </select>
          </div>
        </div>

        <input
          type="text"
          placeholder="Cari nama pemain di roster..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`w-full sm:w-72 px-4 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
            isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
          }`}
        />
      </div>

      {/* FORM OVERLAY (ADD / EDIT) */}
      {isFormOpen && (
        <div className={`p-6 rounded-2xl shadow-xl transition-all ${
          isDarkMode ? "bg-slate-950/90 border border-amber-500/20 text-slate-100" : "bg-white border border-amber-500/50 text-slate-900"
        }`}>
          <div className={`flex justify-between items-center border-b pb-3 mb-4 ${isDarkMode ? "border-slate-900" : "border-slate-200"}`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              {editingPlayer ? "Edit Roster Player" : "Add Roster Player"}
            </h3>
            <button
              onClick={() => { setIsFormOpen(false); setEditingPlayer(null); }}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-400 uppercase text-[10px]">Nickname:</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                  placeholder="Player"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-400 uppercase text-[10px]">Team Name:</label>
                {useCustomTeam ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={form.team}
                      onChange={(e) => setForm(prev => ({ ...prev, team: e.target.value }))}
                      className={`flex-1 rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                      placeholder="e.g. Level Up Indonesia"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setUseCustomTeam(false)}
                      className={`px-3 py-2 text-[10px] font-bold rounded-lg border cursor-pointer transition-colors ${isDarkMode ? "bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"}`}
                    >
                      Pilih dari Roster
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <select
                      value={form.team}
                      onChange={(e) => {
                        if (e.target.value === "__custom__") {
                          setUseCustomTeam(true);
                          setForm(prev => ({ ...prev, team: "" }));
                        } else {
                          setForm(prev => ({ ...prev, team: e.target.value }));
                        }
                      }}
                      className={`flex-1 rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    >
                      <option value="">-- Pilih Tim --</option>
                      {teamsInSelectedTour.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      <option value="__custom__">✍️ Ketik Manual...</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-400 uppercase text-[10px]">Main Role / Position:</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
                  className={`w-full rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                >
                  <option value="Player">Player</option>
                  <option value="Coach">Coach</option>
                  <option value="Analis">Analis</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-400 uppercase text-[10px]">Registered League:</label>
                <select
                  value={form.league}
                  onChange={(e) => {
                    const newLeague = e.target.value;
                    setForm(prev => ({ ...prev, league: newLeague, team: "Netral" }));
                    setUseCustomTeam(false);
                  }}
                  className={`w-full rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                  required
                >
                  <option value="">-- Pilih Liga / Turnamen --</option>
                  {leagues.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setIsFormOpen(false); setEditingPlayer(null); }}
                className={`px-4 py-2 border rounded-xl cursor-pointer ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200"}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-lg cursor-pointer"
              >
                Save Player
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ROSTER GRID GROUPED BY TEAMS */}
      {isLoading ? (
        <div className={`flex flex-col items-center justify-center py-12 space-y-3 rounded-2xl ${isDarkMode ? "bg-slate-900/50 text-slate-400" : "bg-white border border-slate-200 shadow-sm"}`}>
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <span className="text-xs text-slate-400">Fetching active roster data...</span>
        </div>
      ) : roster.filter(p => (p.league || "PMSL SEA 2026") === selectedLeague).length === 0 ? (
        <div className={`text-center py-12 rounded-2xl text-xs text-slate-500 ${isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200"}`}>
          Belum ada pemain terdaftar untuk {selectedLeague}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {Object.keys(
            roster
              .filter(p => (p.league || "PMSL SEA 2026") === selectedLeague)
              .reduce((acc: Record<string, RosterPlayer[]>, p: RosterPlayer) => {
                const t = (p.team || "Level Up Indonesia").toUpperCase().trim();
                if (!acc[t]) acc[t] = [];
                acc[t].push(p);
                return acc;
              }, {} as Record<string, RosterPlayer[]>)
          )
            .sort()
            .map((teamName) => {
              const teamPlayers = roster
                .filter(p => (p.league || "PMSL SEA 2026") === selectedLeague)
                .filter(
                  (p) => (p.team || "Level Up Indonesia").toUpperCase().trim() === teamName
                )
                .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .filter(p => {
                  if (selectedRoleFilter === "ALL") return true;
                  return (p.role || "Player").toUpperCase().trim() === selectedRoleFilter.toUpperCase().trim();
                });

              if (teamPlayers.length === 0) return null;

              return (
                <div key={teamName} className="space-y-4">
                  <div className={`flex items-center gap-3 border-b pb-2 ${isDarkMode ? "border-slate-900" : "border-slate-200"}`}>
                    <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
                    <h3 className={`text-sm font-extrabold uppercase ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>
                      {teamName}
                    </h3>
                    {actionPasswordVerified ? (
                      <input
                        type="text"
                        value={teamAbbrMap[teamName] || ""}
                        onChange={(e) => handleTeamAbbrChange(teamName, e.target.value)}
                        placeholder="ABBR"
                        maxLength={6}
                        title="Singkatan tim (ABBR)"
                        className={`w-16 text-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                          isDarkMode ? "bg-slate-950/60 border-slate-800 text-amber-500" : "bg-amber-50 border-amber-200 text-amber-600"
                        }`}
                      />
                    ) : teamAbbrMap[teamName] ? (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-black uppercase">
                        {teamAbbrMap[teamName]}
                      </span>
                    ) : null}
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-950/40 text-slate-500 border border-slate-900/40 font-bold">
                      {teamPlayers.length} Members
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 w-full">
                    {teamPlayers
                      .sort((a, b) => {
                        const rolesOrder = ["Player", "Coach", "Analis", "PLAYER", "COACH", "ANALIS"];
                        const idxA = rolesOrder.indexOf(a.role || "Player");
                        const idxB = rolesOrder.indexOf(b.role || "Player");
                        if (idxA !== idxB) return idxA - idxB;
                        return a.name.localeCompare(b.name);
                      })
                      .map((p) => {
                        return (
                          <div
                            key={p.id}
                            className={`rounded-xl p-3 flex items-center justify-between gap-3 transition-all hover:translate-x-0.5 ${
                              isDarkMode ? "bg-slate-900/40 text-slate-200" : "bg-white border border-slate-200 text-slate-800 hover:shadow"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-slate-950/40 border border-slate-800 flex items-center justify-center text-[10px] font-bold text-amber-500 shrink-0 uppercase">
                                {p.name.substring(0, 2)}
                              </div>
                              <div className="min-w-0 text-xs">
                                <h3 className={`font-bold truncate ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                                  {p.name}
                                </h3>
                                <p className="text-[10px] text-amber-500 font-semibold mt-0.5 tracking-wide uppercase">
                                  {p.role}
                                </p>
                              </div>
                            </div>

                            {/* Actions Column */}
                            <div className="flex gap-1.5 shrink-0 ml-auto">
                              <button
                                onClick={() => handleOpenEditForm(p)}
                                className={`px-2 py-1 border rounded-lg text-[10px] font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                                  isDarkMode 
                                    ? "bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800" 
                                    : "bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-slate-200"
                                }`}
                              >
                                <Edit2 className="w-3 h-3 shrink-0 text-amber-500" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDeleteClick(p.id || "")}
                                className={`p-1 border rounded-lg text-[10px] font-semibold cursor-pointer transition-all flex items-center justify-center ${
                                  isDarkMode 
                                    ? "bg-red-950/30 hover:bg-red-900/40 text-red-400 hover:text-red-300 border-red-900/30" 
                                    : "bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-500 border-red-200"
                                }`}
                                title="Delete Player"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* ADMIN ACTION PASSCODE MODAL */}
      {passModal.isOpen && (
        <div className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-colors duration-200 ${isDarkMode ? "bg-slate-950/80" : "bg-slate-900/40"}`}>
          <div className={`w-full max-w-sm border rounded-2xl shadow-2xl overflow-hidden animate-fadeIn transition-colors duration-200 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 text-slate-800"}`}>
            <div className="bg-gradient-to-r from-amber-600 to-amber-500 p-5 text-slate-950 flex flex-col items-center">
              <div className={`p-2.5 rounded-full mb-2 ${isDarkMode ? "bg-slate-950 text-amber-400" : "bg-white/40 text-slate-950"}`}>
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-center uppercase">
                Verifikasi Hak Akses
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90">
                MASUKKAN PASSWORD KHUSUS ADMIN
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
                  onClick={() => setPassModal({ isOpen: false, password: "", error: "", actionType: "unlock", targetId: "" })}
                  className={`flex-1 border rounded-lg py-2 font-bold cursor-pointer transition-all text-center ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 border-slate-200"}`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 rounded-lg py-2 font-bold cursor-pointer transition-all flex items-center justify-center gap-1 shadow-lg"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Verifikasi</span>
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
              <h3 className="text-sm font-bold tracking-tight text-center uppercase">
                Konfirmasi Hapus Pemain
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center uppercase">
                Tindakan ini tidak dapat dibatalkan!
              </p>
            </div>

            <div className="p-6 space-y-4 text-xs text-center">
              <p className={`${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                Apakah Anda yakin ingin menghapus pemain ini dari daftar roster secara permanen?
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
                    onDeletePlayer(deleteConfirmModal.targetId);
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
