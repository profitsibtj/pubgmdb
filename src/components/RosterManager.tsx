import React, { useState } from "react";
import {
  Plus, Trash2, Edit2, Sparkles, RefreshCw, X
} from "lucide-react";
import { Match } from "../types";
import { getTournamentTeamList, sameLeague } from "../utils";

export interface RosterPlayer {
  id?: string;
  name: string;
  role: string;
  team: string;
  league: string;
  // Old nicknames this player used before a rename, so stats logged under the old name still
  // get reconciled onto this player instead of showing up as a separate person.
  previousNames?: string[];
}

interface RosterManagerProps {
  roster: RosterPlayer[];
  matches?: Match[];
  isLoading: boolean;
  onSavePlayer: (player: RosterPlayer) => Promise<void>;
  onDeletePlayer: (id: string) => Promise<void>;
  isDarkMode: boolean;
  actionPasswordVerified: boolean;
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
  actionPasswordVerified,
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

  // The tournament an admin has manually marked "highlighted" (Add New Match Data > Tournament
  // Settings), if any - starred in the dropdown below.
  const highlightedLeagueName = React.useMemo(() => {
    const highlighted = tournamentsList.find((t: any) => t.highlighted);
    return highlighted?.name || null;
  }, [tournamentsList]);

  // Keep selectedLeague in sync if it's not found in leagues list - and the first time a
  // highlighted tournament becomes available, prefer it over leagues[0].
  const hasAppliedHighlightDefault = React.useRef(false);
  React.useEffect(() => {
    if (leagues.length === 0) return;
    if (!hasAppliedHighlightDefault.current && highlightedLeagueName && leagues.includes(highlightedLeagueName)) {
      hasAppliedHighlightDefault.current = true;
      setSelectedLeague(highlightedLeagueName);
      return;
    }
    if (!leagues.includes(selectedLeague)) {
      setSelectedLeague(leagues[0]);
    }
  }, [leagues, selectedLeague, highlightedLeagueName]);

  const getTeamsForLeague = React.useCallback((leagueName: string) => {
    const activeTour = tournamentsList.find((t: any) => t.name === leagueName) || tournamentsList[0];

    // 1. Extract from tournament preset if available and active matches selection
    let teamNames: string[] = activeTour && activeTour.name === leagueName ? getTournamentTeamList(activeTour) : [];

    // 2. Extract from actual matches under this league
    const matchingMatches = (matches || []).filter((m) => sameLeague(m.league, leagueName));
    matchingMatches.forEach((m) => {
      (m.teams || []).forEach((t) => {
        if (t.name) {
          teamNames.push(t.name.trim());
        }
      });
    });

    // 3. Extract from existing roster under this league
    const matchingRoster = roster.filter((p) => sameLeague(p.league, leagueName));
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
  // dedicated "team" entity to attach the field to. Set from the Add/Edit Player form (at
  // the point a team is actually being entered), not bolted on afterward.
  const getTeamAbbrMap = React.useCallback((leagueName: string): Record<string, string> => {
    const preset = tournamentsList.find((t: any) => t.name === leagueName);
    return (preset && preset.teamAbbreviations) || {};
  }, [tournamentsList]);

  const teamAbbrMap: Record<string, string> = React.useMemo(
    () => getTeamAbbrMap(selectedLeague),
    [getTeamAbbrMap, selectedLeague]
  );

  const handleTeamAbbrChange = (leagueName: string, teamName: string, abbr: string) => {
    if (!onUpdateTournaments || !teamName.trim()) return;
    const trimmed = abbr.trim().toUpperCase();
    const updated = tournamentsList.map((t: any) => {
      if (t.name !== leagueName) return t;
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

  // Team ABBR input, live in the Add/Edit Player form
  const [abbrInput, setAbbrInput] = useState("");

  // Comma-separated old nicknames, edited as free text and parsed into an array on submit
  const [previousNamesInput, setPreviousNamesInput] = useState("");

  // Bulk "Add Players" form - one League/Team/ABBR shared across every row (adding a whole squad
  // at once), so only the name/nickname/role actually differ per row. Starts with 4 blank rows,
  // since 4 is the minimum needed to field a match; +Add Row covers a 5th player, coach, analyst.
  interface BulkRow { name: string; previousNames: string; role: string; }
  const emptyBulkRow = (): BulkRow => ({ name: "", previousNames: "", role: "Player" });
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulkLeague, setBulkLeague] = useState("");
  const [bulkTeam, setBulkTeam] = useState("");
  const [bulkUseCustomTeam, setBulkUseCustomTeam] = useState(false);
  const [bulkAbbrInput, setBulkAbbrInput] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkError, setBulkError] = useState("");
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const teamsInBulkLeague = React.useMemo(() => {
    return getTeamsForLeague(bulkLeague);
  }, [getTeamsForLeague, bulkLeague]);

  const handleOpenEditForm = (player: RosterPlayer) => {
    setEditingPlayer(player);
    const initialTeams = getTeamsForLeague(player.league);
    const inList = initialTeams.includes(player.team);
    setUseCustomTeam(!inList && !!player.team);

    setForm({ ...player });
    setAbbrInput(getTeamAbbrMap(player.league)[(player.team || "").toUpperCase().trim()] || "");
    setPreviousNamesInput((player.previousNames || []).join(", "));
    setIsFormOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirmModal({
      isOpen: true,
      targetId: id
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) return;

    // Two different real players can share a nickname (e.g. "Shiro" on two different teams) -
    // block a rename/save that would collide with ANOTHER player's name in the same league, so
    // their stats never silently merge into one person. A genuine team transfer keeps editing the
    // same player record, so it's excluded here by id.
    const clash = roster.find(p =>
      p.id !== editingPlayer?.id &&
      (p.league || "").trim().toLowerCase() === form.league.trim().toLowerCase() &&
      p.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (clash) {
      alert(`"${trimmedName}" is already registered in this league (team: ${clash.team}). If this is the same person, edit that player instead. If it's someone else, give this player a distinct name.`);
      return;
    }

    try {
      const previousNames = previousNamesInput
        .split(",")
        .map(n => n.trim())
        .filter(n => n.length > 0 && n.toLowerCase() !== trimmedName.toLowerCase());
      await onSavePlayer({ ...form, name: trimmedName, previousNames });
      if (form.team.trim()) {
        handleTeamAbbrChange(form.league, form.team.toUpperCase().trim(), abbrInput);
      }
      setIsFormOpen(false);
      setEditingPlayer(null);
    } catch (err: any) {
      alert("Error saving player: " + err.message);
    }
  };

  const handleOpenBulkAdd = () => {
    setBulkLeague(selectedLeague);
    setBulkTeam("");
    setBulkUseCustomTeam(false);
    setBulkAbbrInput("");
    setBulkRows([emptyBulkRow(), emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
    setBulkError("");
    setIsBulkAddOpen(true);
  };

  const handleBulkRowChange = (idx: number, field: keyof BulkRow, value: string) => {
    setBulkRows(prev => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const handleAddBulkRow = () => setBulkRows(prev => [...prev, emptyBulkRow()]);
  const handleRemoveBulkRow = (idx: number) => setBulkRows(prev => prev.filter((_, i) => i !== idx));

  const handleSubmitBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError("");

    if (!bulkTeam.trim()) {
      setBulkError("Team name is required.");
      return;
    }

    const filledRows = bulkRows
      .map((r) => ({ ...r, name: r.name.trim() }))
      .filter((r) => r.name.length > 0);
    if (filledRows.length === 0) {
      setBulkError("Enter at least one player name.");
      return;
    }

    // Same collision guard as the Edit form (see handleFormSubmit) - also checked against every
    // other name already typed in this same batch, so pasting a duplicate by mistake is caught
    // before anything is saved.
    const existingInLeague = roster.filter(
      (p) => (p.league || "").trim().toLowerCase() === bulkLeague.trim().toLowerCase()
    );
    const seenInBatch = new Set<string>();
    for (const row of filledRows) {
      const lower = row.name.toLowerCase();
      const clash = existingInLeague.find((p) => p.name.trim().toLowerCase() === lower);
      if (clash) {
        setBulkError(`"${row.name}" is already registered in this league (team: ${clash.team}). If this is the same person, use Edit on that player instead. If it's a different person, give them a distinct name.`);
        return;
      }
      if (seenInBatch.has(lower)) {
        setBulkError(`"${row.name}" is entered more than once in this batch.`);
        return;
      }
      seenInBatch.add(lower);
    }

    setIsBulkSaving(true);
    try {
      for (const row of filledRows) {
        const previousNames = row.previousNames
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n.length > 0 && n.toLowerCase() !== row.name.toLowerCase());
        await onSavePlayer({
          name: row.name,
          role: row.role,
          team: bulkTeam.trim(),
          league: bulkLeague,
          previousNames
        });
      }
      handleTeamAbbrChange(bulkLeague, bulkTeam.toUpperCase().trim(), bulkAbbrInput);
      setIsBulkAddOpen(false);
    } catch (err: any) {
      setBulkError("Error saving players: " + err.message);
    } finally {
      setIsBulkSaving(false);
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
          {actionPasswordVerified && (
            <button
              onClick={handleOpenBulkAdd}
              className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow shadow-amber-500/10 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Add Players
            </button>
          )}
        </div>
      </div>

      {/* FILTER BAR */}
      <div className={`p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200"
      }`}>
        <div className="flex flex-wrap items-center gap-4 text-xs w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase text-[10px] font-bold">League/Competition:</span>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className={`p-2 rounded-lg border cursor-pointer font-bold ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            >
              {leagues.map((l) => (
                <option key={l} value={l}>{l === highlightedLeagueName ? `★ ${l}` : l}</option>
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
              <option value="ALL">ALL ROLES</option>
              <option value="Player">Player</option>
              <option value="Coach">Coach</option>
              <option value="Analis">Analyst</option>
            </select>
          </div>
        </div>

        <input
          type="text"
          placeholder="Search player name in roster..."
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
              Edit Roster Player
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
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold shrink-0">Previous Name(s):</span>
                  <input
                    type="text"
                    value={previousNamesInput}
                    onChange={(e) => setPreviousNamesInput(e.target.value)}
                    placeholder="e.g. OldNick1, OldNick2"
                    title="Old nicknames this player used before - their stats will merge into this player's current name"
                    className={`flex-1 rounded-lg p-1.5 text-xs focus:outline-none border focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"}`}
                  />
                </div>
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
                      Choose from Roster
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
                          setAbbrInput(getTeamAbbrMap(form.league)[e.target.value.toUpperCase().trim()] || "");
                        }
                      }}
                      className={`flex-1 rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    >
                      <option value="">-- Select Team --</option>
                      {teamsInSelectedTour.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      <option value="__custom__">✍️ Type Manually...</option>
                    </select>
                  </div>
                )}
                {form.team.trim() && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[9px] text-slate-500 uppercase font-bold shrink-0">Team ABBR:</span>
                    <input
                      type="text"
                      value={abbrInput}
                      onChange={(e) => setAbbrInput(e.target.value)}
                      maxLength={6}
                      placeholder="e.g. BTR"
                      className={`w-24 rounded-lg p-1.5 text-xs uppercase font-bold focus:outline-none border focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-amber-500" : "bg-slate-50 border-slate-200 text-amber-600"}`}
                    />
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
                  <option value="Analis">Analyst</option>
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
                    setAbbrInput("");
                  }}
                  className={`w-full rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                  required
                >
                  <option value="">-- Select League / Tournament --</option>
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

      {/* BULK ADD PLAYERS PANEL */}
      {isBulkAddOpen && (
        <div className={`p-6 rounded-2xl shadow-xl transition-all ${
          isDarkMode ? "bg-slate-950/90 border border-amber-500/20 text-slate-100" : "bg-white border border-amber-500/50 text-slate-900"
        }`}>
          <div className={`flex justify-between items-center border-b pb-3 mb-4 ${isDarkMode ? "border-slate-900" : "border-slate-200"}`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              Add Players
            </h3>
            <button
              onClick={() => setIsBulkAddOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[10px] text-slate-500 mb-4">4 rows are ready to go - fill them in, add more if you need to.</p>

          <form onSubmit={handleSubmitBulkAdd} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-400 uppercase text-[10px]">League/Competition:</label>
                <select
                  value={bulkLeague}
                  onChange={(e) => {
                    setBulkLeague(e.target.value);
                    setBulkTeam("");
                    setBulkUseCustomTeam(false);
                    setBulkAbbrInput("");
                  }}
                  className={`w-full rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                  required
                >
                  <option value="">-- Select League / Tournament --</option>
                  {leagues.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-400 uppercase text-[10px]">Team Name:</label>
                {bulkUseCustomTeam ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={bulkTeam}
                      onChange={(e) => setBulkTeam(e.target.value)}
                      className={`flex-1 rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                      placeholder="e.g. Level Up Indonesia"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setBulkUseCustomTeam(false)}
                      className={`px-3 py-2 text-[10px] font-bold rounded-lg border cursor-pointer transition-colors ${isDarkMode ? "bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"}`}
                    >
                      Choose from Roster
                    </button>
                  </div>
                ) : (
                  <select
                    value={bulkTeam}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setBulkUseCustomTeam(true);
                        setBulkTeam("");
                      } else {
                        setBulkTeam(e.target.value);
                        setBulkAbbrInput(getTeamAbbrMap(bulkLeague)[e.target.value.toUpperCase().trim()] || "");
                      }
                    }}
                    className={`w-full rounded-lg p-2.5 text-sm focus:outline-none border focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                  >
                    <option value="">-- Select Team --</option>
                    {teamsInBulkLeague.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="__custom__">Type manually...</option>
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-400 uppercase text-[10px]">Team ABBR:</label>
                <input
                  type="text"
                  value={bulkAbbrInput}
                  onChange={(e) => setBulkAbbrInput(e.target.value)}
                  maxLength={6}
                  placeholder="e.g. BTR"
                  className={`w-full rounded-lg p-2.5 text-sm uppercase font-bold focus:outline-none border focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-amber-500" : "bg-slate-50 border-slate-200 text-amber-600"}`}
                />
              </div>
            </div>

            <div>
              <div className={`hidden md:grid gap-2 text-[9px] font-bold text-slate-500 uppercase mb-1 px-0.5`} style={{ gridTemplateColumns: "20px 1fr 1fr 110px 28px" }}>
                <div />
                <div>Player Name</div>
                <div>Previous Name(s) (optional)</div>
                <div>Role</div>
                <div />
              </div>
              <div className="space-y-2">
                {bulkRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-[20px_1fr_1fr_110px_28px] gap-2 items-center">
                    <div className="hidden md:block text-center text-[10px] text-slate-600 font-bold">{idx + 1}</div>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => handleBulkRowChange(idx, "name", e.target.value)}
                      placeholder="Player name"
                      className={`w-full rounded-lg p-2 text-xs focus:outline-none border focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    />
                    <input
                      type="text"
                      value={row.previousNames}
                      onChange={(e) => handleBulkRowChange(idx, "previousNames", e.target.value)}
                      placeholder="e.g. old IGN"
                      className={`w-full rounded-lg p-2 text-xs focus:outline-none border focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"}`}
                    />
                    <select
                      value={row.role}
                      onChange={(e) => handleBulkRowChange(idx, "role", e.target.value)}
                      className={`w-full rounded-lg p-2 text-xs focus:outline-none border focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                    >
                      <option value="Player">Player</option>
                      <option value="Coach">Coach</option>
                      <option value="Analis">Analyst</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveBulkRow(idx)}
                      title="Remove row"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 transition-colors cursor-pointer justify-self-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddBulkRow}
              className={`w-full py-2 rounded-lg border border-dashed text-[10px] font-bold uppercase cursor-pointer transition-colors ${isDarkMode ? "border-slate-700 text-amber-500 hover:bg-slate-900" : "border-slate-300 text-amber-600 hover:bg-slate-50"}`}
            >
              + Add Row
            </button>

            {bulkError && (
              <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/40 text-red-400 text-[11px] leading-relaxed">
                {bulkError}
              </div>
            )}

            <div className={`flex justify-end gap-3 pt-2 border-t ${isDarkMode ? "border-slate-900" : "border-slate-200"}`}>
              <button
                type="button"
                onClick={() => setIsBulkAddOpen(false)}
                disabled={isBulkSaving}
                className={`px-4 py-2 border rounded-xl cursor-pointer ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200"}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBulkSaving}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl shadow-lg cursor-pointer"
              >
                {isBulkSaving ? "Saving..." : "Save All Players"}
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
      ) : roster.filter(p => (p.league || "PMSL SEA 2026").trim().toLowerCase() === selectedLeague.trim().toLowerCase()).length === 0 ? (
        <div className={`text-center py-12 rounded-2xl text-xs text-slate-500 ${isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200"}`}>
          No players registered yet for {selectedLeague}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {Object.keys(
            roster
              .filter(p => (p.league || "PMSL SEA 2026").trim().toLowerCase() === selectedLeague.trim().toLowerCase())
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
                .filter(p => (p.league || "PMSL SEA 2026").trim().toLowerCase() === selectedLeague.trim().toLowerCase())
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
                    {teamAbbrMap[teamName] && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-black uppercase">
                        {teamAbbrMap[teamName]}
                      </span>
                    )}
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
                            {actionPasswordVerified && (
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
                            )}
                          </div>
                        );
                      })}
                  </div>
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
                Confirm Player Deletion
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center uppercase">
                This action cannot be undone!
              </p>
            </div>

            <div className="p-6 space-y-4 text-xs text-center">
              <p className={`${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                Are you sure you want to permanently remove this player from the roster?
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmModal({ isOpen: false, targetId: "" })}
                  className={`flex-1 border rounded-lg py-2 font-bold cursor-pointer transition-all text-center ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 border-slate-200"}`}
                >
                  Cancel
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
                  <span>Yes, Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
