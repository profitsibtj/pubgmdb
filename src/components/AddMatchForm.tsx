import React, { useState } from "react";
import { Match, Team } from "../types";
import { calculatePlacementPoints, calculateLeagueRankStandings } from "../utils";
import {
  Plus, Trash2, RefreshCw, AlertTriangle, Save, GripVertical, Layers,
  ChevronUp, ChevronDown, X
} from "lucide-react";

interface AddMatchFormProps {
  onSave: (match: Match) => Promise<void>;
  onClose: () => void;
  isDarkMode: boolean;
  editingMatch?: Match | null;
  matches?: Match[];
  tournaments?: any[];
  onUpdateTournaments?: (updatedTournaments: any[]) => void;
}

export const AddMatchForm: React.FC<AddMatchFormProps> = ({
  onSave,
  onClose,
  isDarkMode,
  editingMatch,
  matches = [],
  tournaments: passedTournaments,
  onUpdateTournaments
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Manual Mode State
  const [meta, setMeta] = useState({
    date: getTodayDateString(),
    matchCode: "",
    league: "PMSL SEA 2026",
    totalGame: "1",
    gameNo: "1",
    map: "Erangel",
    liveLink: ""
  });

  // Marks this match as part of the Grand Final stage, kept separate from the
  // overall/regular-season standings for the same league in Standings.
  const [isGrandFinal, setIsGrandFinal] = useState(false);

  const [showRosterSettings, setShowRosterSettings] = useState<boolean>(false);

  const createEmptyTeam = (name = "", placement = 1): Team => ({
    name,
    placement,
    placementPoints: calculatePlacementPoints(placement),
    eliminationPoints: 0,
    bonusPoints: 0,
    totalPoints: calculatePlacementPoints(placement),
    wwcd: placement === 1,
    players: []
  });

  const [teams, setTeams] = useState<Team[]>([
    createEmptyTeam("Level Up Indonesia", 1)
  ]);

  interface TournamentPreset {
    id: string;
    name: string;
    format: "16" | "20" | "24" | "32";
    activeMatchup: string;
    activeGroup: string;
    activeWeek?: string; // "1" | "2" | "3"
    tiebreaker?: "WWCD-PlacementPoint-Kill" | "WWCD-Kill-PlacementPoint";
    teams16Text: string;
    groupAText: string;
    groupBText: string;
    groupCText: string;
    groupDText?: string;
    groupEText?: string;
    // Week 2
    groupAText_w2?: string;
    groupBText_w2?: string;
    groupCText_w2?: string;
    groupDText_w2?: string;
    groupEText_w2?: string;
    // Week 3
    groupAText_w3?: string;
    groupBText_w3?: string;
    groupCText_w3?: string;
    groupDText_w3?: string;
    groupEText_w3?: string;
    // League Rank Points: not every tournament uses this, so it's opt-in per tournament.
    // Converts each team's weekly rank (based on that week's total points) into "League Points",
    // accumulated across weeks separately from raw match totals. leagueRankPointsTable[i] = points for rank i+1.
    leagueRankPointsEnabled?: boolean;
    leagueRankPointsTable?: number[];
  }

  const [tournaments, setTournaments] = useState<TournamentPreset[]>(() => {
    if (passedTournaments && passedTournaments.length > 0) {
      return passedTournaments;
    }
    const stored = localStorage.getItem("tournaments_list_v4");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse tournaments", e);
      }
    }
    const defaults: TournamentPreset[] = [
      {
        id: "pmsl_sea_2026",
        name: "PMSL SEA 2026",
        format: "16",
        activeMatchup: "A_B",
        activeGroup: "A",
        activeWeek: "1",
        tiebreaker: "WWCD-PlacementPoint-Kill",
        teams16Text: [
          "BOOM Esports", "Alter Ego Ares", "Talon Esports", "Bigetron Knights",
          "RRQ Ryu", "Vampire Esports", "Yoodo Alliance", "FaZe Clan",
          "D'Xavier", "Geek Fam", "Morph GPX", "Level Up Indonesia",
          "VOIN Esports", "SEM9", "Genesis Dogma", "STX Esports"
        ].join("\n"),
        groupAText: ["BOOM Esports", "Alter Ego Ares", "RRQ Ryu", "FaZe Clan", "Vampire Esports", "VOIN Esports", "SEM9", "Morph GPX"].join("\n"),
        groupBText: ["Bigetron Knights", "Talon Esports", "Geek Fam", "Yoodo Alliance", "D'Xavier", "Level Up Indonesia", "Genesis Dogma", "STX Esports"].join("\n"),
        groupCText: ["Team Liquid ID", "Fnatic Onic", "Rex Regum Qeon", "Evos Glory", "Bigetron Alpha", "Alter Ego", "Geek Fam ID", "Dewa United"].join("\n"),
        groupDText: ["VOIN Esports", "SEM9", "Genesis Dogma", "STX Esports"].join("\n"),
        groupEText: ["Team Liquid ID", "Fnatic Onic", "Rex Regum Qeon", "Evos Glory"].join("\n"),
      },
      {
        id: "pmgc_2026",
        name: "PMGC 2026",
        format: "16",
        activeMatchup: "A_B",
        activeGroup: "A",
        activeWeek: "1",
        tiebreaker: "WWCD-PlacementPoint-Kill",
        teams16Text: [
          "Reject", "D'Xavier", "Alpha7 Esports", "Vampire Esports",
          "Stalwart Esports", "Nigma Galaxy", "Nova Esports", "IHC Esports",
          "Talon Esports", "BOOM Esports", "FaZe Clan", "Loops Esports",
          "Major Pride", "Gaimin Gladiators", "S2G Esports", "Alliance"
        ].join("\n"),
        groupAText: ["Reject", "D'Xavier", "Alpha7 Esports", "Vampire Esports", "Stalwart Esports", "Nigma Galaxy", "Nova Esports", "IHC Esports"].join("\n"),
        groupBText: ["Talon Esports", "BOOM Esports", "FaZe Clan", "Loops Esports", "Major Pride", "Gaimin Gladiators", "S2G Esports", "Alliance"].join("\n"),
        groupCText: ["Team Liquid ID", "Fnatic Onic", "Rex Regum Qeon", "Evos Glory", "Bigetron Alpha", "Alter Ego", "Geek Fam ID", "Dewa United"].join("\n"),
        groupDText: ["Talon Esports", "BOOM Esports", "FaZe Clan", "Loops Esports"].join("\n"),
        groupEText: ["Major Pride", "Gaimin Gladiators", "S2G Esports", "Alliance"].join("\n"),
      },
      {
        id: "pmops_indonesia",
        name: "PMPS Indonesia",
        format: "16",
        activeMatchup: "A_B",
        activeGroup: "A",
        activeWeek: "1",
        tiebreaker: "WWCD-PlacementPoint-Kill",
        teams16Text: [
          "Bigetron Knights", "BOOM Esports", "Alter Ego Ares", "Talon Esports",
          "RRQ Ryu", "VOIN Esports", "Morph GPX", "Level Up Indonesia",
          "Geek Fam", "Kagendra", "Penta Esports", "Dewa United",
          "Onyx Esports", "Vampire Esports", "SEM9", "Aura Esports"
        ].join("\n"),
        groupAText: ["Bigetron Knights", "BOOM Esports", "Alter Ego Ares", "Talon Esports", "RRQ Ryu", "VOIN Esports", "Morph GPX", "Level Up Indonesia"].join("\n"),
        groupBText: ["Geek Fam", "Kagendra", "Penta Esports", "Dewa United", "Onyx Esports", "Vampire Esports", "SEM9", "Aura Esports"].join("\n"),
        groupCText: ["Rex Regum Qeon", "Team Liquid ID", "Evos Glory", "Fnatic Onic", "Bigetron Alpha", "Alter Ego", "Dewa United Esports", "Geek Fam ID"].join("\n"),
        groupDText: ["Geek Fam", "Kagendra", "Penta Esports", "Dewa United"].join("\n"),
        groupEText: ["Onyx Esports", "Vampire Esports", "SEM9", "Aura Esports"].join("\n"),
      },
      {
        id: "lobby_scrim",
        name: "Lobby Scrim",
        format: "16",
        activeMatchup: "A_B",
        activeGroup: "A",
        activeWeek: "1",
        tiebreaker: "WWCD-PlacementPoint-Kill",
        teams16Text: [
          "Scrim Team 1", "Scrim Team 2", "Scrim Team 3", "Scrim Team 4",
          "Scrim Team 5", "Scrim Team 6", "Scrim Team 7", "Scrim Team 8",
          "Scrim Team 9", "Scrim Team 10", "Scrim Team 11", "Scrim Team 12",
          "Scrim Team 13", "Scrim Team 14", "Scrim Team 15", "Scrim Team 16"
        ].join("\n"),
        groupAText: ["Scrim Team A1", "Scrim Team A2", "Scrim Team A3", "Scrim Team A4", "Scrim Team A5", "Scrim Team A6", "Scrim Team A7", "Scrim Team A8"].join("\n"),
        groupBText: ["Scrim Team B1", "Scrim Team B2", "Scrim Team B3", "Scrim Team B4", "Scrim Team B5", "Scrim Team B6", "Scrim Team B7", "Scrim Team B8"].join("\n"),
        groupCText: ["Scrim Team C1", "Scrim Team C2", "Scrim Team C3", "Scrim Team C4", "Scrim Team C5", "Scrim Team C6", "Scrim Team C7", "Scrim Team C8"].join("\n"),
        groupDText: ["Scrim Team D1", "Scrim Team D2", "Scrim Team D3", "Scrim Team D4"].join("\n"),
        groupEText: ["Scrim Team E1", "Scrim Team E2", "Scrim Team E3", "Scrim Team E4"].join("\n"),
      }
    ];
    localStorage.setItem("tournaments_list_v4", JSON.stringify(defaults));
    return defaults;
  });

  React.useEffect(() => {
    if (passedTournaments && passedTournaments.length > 0) {
      setTournaments(passedTournaments);
    }
  }, [passedTournaments]);

  const [selectedTournamentId, setSelectedTournamentId] = useState<string>(() => {
    return tournaments[0]?.id || "pmsl_sea_2026";
  });

  const activeTournament = tournaments.find(t => t.id === selectedTournamentId) || tournaments[0];

  const activeWeek = activeTournament?.activeWeek || "1";
  
  const currentGroupAText = activeTournament ? (activeWeek === "2" ? (activeTournament.groupAText_w2 || "") : activeWeek === "3" ? (activeTournament.groupAText_w3 || "") : (activeTournament.groupAText || "")) : "";
  const currentGroupBText = activeTournament ? (activeWeek === "2" ? (activeTournament.groupBText_w2 || "") : activeWeek === "3" ? (activeTournament.groupBText_w3 || "") : (activeTournament.groupBText || "")) : "";
  const currentGroupCText = activeTournament ? (activeWeek === "2" ? (activeTournament.groupCText_w2 || "") : activeWeek === "3" ? (activeTournament.groupCText_w3 || "") : (activeTournament.groupCText || "")) : "";
  const currentGroupDText = activeTournament ? (activeWeek === "2" ? (activeTournament.groupDText_w2 || "") : activeWeek === "3" ? (activeTournament.groupDText_w3 || "") : (activeTournament.groupDText || "")) : "";
  const currentGroupEText = activeTournament ? (activeWeek === "2" ? (activeTournament.groupEText_w2 || "") : activeWeek === "3" ? (activeTournament.groupEText_w3 || "") : (activeTournament.groupEText || "")) : "";

  const updateActiveTournament = (updates: Partial<TournamentPreset>) => {
    const updated = tournaments.map(t => t.id === selectedTournamentId ? { ...t, ...updates } : t);
    setTournaments(updated);
    localStorage.setItem("tournaments_list_v4", JSON.stringify(updated));
    if (onUpdateTournaments) {
      onUpdateTournaments(updated);
    }
  };

  const handleCreateTournament = () => {
    const newId = `tournament_${Date.now()}`;
    const newTour: TournamentPreset = {
      id: newId,
      name: `Tournament Baru ${tournaments.length + 1}`,
      format: "16",
      activeMatchup: "A_B",
      activeGroup: "A",
      activeWeek: "1",
      tiebreaker: "WWCD-PlacementPoint-Kill",
      teams16Text: Array.from({ length: 16 }, (_, i) => `Team ${i + 1}`).join("\n"),
      groupAText: Array.from({ length: 8 }, (_, i) => `Group A Team ${i + 1}`).join("\n"),
      groupBText: Array.from({ length: 8 }, (_, i) => `Group B Team ${i + 1}`).join("\n"),
      groupCText: Array.from({ length: 8 }, (_, i) => `Group C Team ${i + 1}`).join("\n"),
      groupDText: Array.from({ length: 4 }, (_, i) => `Group D Team ${i + 1}`).join("\n"),
      groupEText: Array.from({ length: 4 }, (_, i) => `Group E Team ${i + 1}`).join("\n")
    };
    const updated = [...tournaments, newTour];
    setTournaments(updated);
    setSelectedTournamentId(newId);
    localStorage.setItem("tournaments_list_v4", JSON.stringify(updated));
    if (onUpdateTournaments) {
      onUpdateTournaments(updated);
    }
    
    setSuccessMsg("Turnamen Baru berhasil dibuat!");
    setTimeout(() => setSuccessMsg(""), 2000);
  };

  const handleDeleteTournament = (idToDelete?: string) => {
    const targetId = idToDelete || selectedTournamentId;
    if (tournaments.length <= 1) {
      setErrorMsg("Gagal menghapus! Minimal harus terdapat 1 turnamen terdaftar.");
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }
    const updated = tournaments.filter(t => t.id !== targetId);
    setTournaments(updated);
    if (targetId === selectedTournamentId) {
      setSelectedTournamentId(updated[0].id);
    }
    localStorage.setItem("tournaments_list_v4", JSON.stringify(updated));
    if (onUpdateTournaments) {
      onUpdateTournaments(updated);
    }
    setSuccessMsg("Turnamen berhasil dihapus!");
    setTimeout(() => setSuccessMsg(""), 2000);
  };

  const getTeamsFromActiveTournament = (
    tour: TournamentPreset,
    form: "16" | "20" | "24" | "32",
    match: string,
    selectedGroup: string = "A"
  ): string[] => {
    let teamNames: string[] = [];
    const week = tour.activeWeek || "1";
    
    const grpAText = week === "2" ? (tour.groupAText_w2 || "") : week === "3" ? (tour.groupAText_w3 || "") : (tour.groupAText || "");
    const grpBText = week === "2" ? (tour.groupBText_w2 || "") : week === "3" ? (tour.groupBText_w3 || "") : (tour.groupBText || "");
    const grpCText = week === "2" ? (tour.groupCText_w2 || "") : week === "3" ? (tour.groupCText_w3 || "") : (tour.groupCText || "");
    const grpDText = week === "2" ? (tour.groupDText_w2 || "") : week === "3" ? (tour.groupDText_w3 || "") : (tour.groupDText || "");
    const grpEText = week === "2" ? (tour.groupEText_w2 || "") : week === "3" ? (tour.groupEText_w3 || "") : (tour.groupEText || "");

    if (form === "16") {
      teamNames = tour.teams16Text
        .split("\n")
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      while (teamNames.length < 16) {
        teamNames.push(`Team ${teamNames.length + 1}`);
      }
      if (teamNames.length > 16) {
        teamNames = teamNames.slice(0, 16);
      }
    } else if (form === "20") {
      const grpA = grpAText.split("\n").map(t => t.trim()).filter(t => t.length > 0);
      const grpB = grpBText.split("\n").map(t => t.trim()).filter(t => t.length > 0);
      const grpC = grpCText.split("\n").map(t => t.trim()).filter(t => t.length > 0);
      const grpD = grpDText.split("\n").map(t => t.trim()).filter(t => t.length > 0);
      const grpE = grpEText.split("\n").map(t => t.trim()).filter(t => t.length > 0);

      while (grpA.length < 4) grpA.push(`Grp A Team ${grpA.length + 1}`);
      while (grpB.length < 4) grpB.push(`Grp B Team ${grpB.length + 1}`);
      while (grpC.length < 4) grpC.push(`Grp C Team ${grpC.length + 1}`);
      while (grpD.length < 4) grpD.push(`Grp D Team ${grpD.length + 1}`);
      while (grpE.length < 4) grpE.push(`Grp E Team ${grpE.length + 1}`);

      const a4 = grpA.slice(0, 4);
      const b4 = grpB.slice(0, 4);
      const c4 = grpC.slice(0, 4);
      const d4 = grpD.slice(0, 4);
      const e4 = grpE.slice(0, 4);

      if (match === "ABCD") {
        teamNames = [...a4, ...b4, ...c4, ...d4];
      } else if (match === "ABCE") {
        teamNames = [...a4, ...b4, ...c4, ...e4];
      } else if (match === "ABDE") {
        teamNames = [...a4, ...b4, ...d4, ...e4];
      } else if (match === "ACDE") {
        teamNames = [...a4, ...c4, ...d4, ...e4];
      } else if (match === "BCDE") {
        teamNames = [...b4, ...c4, ...d4, ...e4];
      } else {
        teamNames = [...a4, ...b4, ...c4, ...d4];
      }
    } else {
      const grpA = grpAText.split("\n").map(t => t.trim()).filter(t => t.length > 0);
      const grpB = grpBText.split("\n").map(t => t.trim()).filter(t => t.length > 0);

      if (form === "32") {
        const group = selectedGroup === "A" ? grpA : grpB;
        while (group.length < 16) group.push(`Grup ${selectedGroup} Tim ${group.length + 1}`);
        return group.slice(0, 16);
      }

      const grpC = grpCText.split("\n").map(t => t.trim()).filter(t => t.length > 0);

      while (grpA.length < 8) grpA.push(`Grp A Team ${grpA.length + 1}`);
      while (grpB.length < 8) grpB.push(`Grp B Team ${grpB.length + 1}`);
      while (grpC.length < 8) grpC.push(`Grp C Team ${grpC.length + 1}`);

      const a8 = grpA.slice(0, 8);
      const b8 = grpB.slice(0, 8);
      const c8 = grpC.slice(0, 8);

      if (match === "A_B") {
        teamNames = [...a8, ...b8];
      } else if (match === "A_C") {
        teamNames = [...a8, ...c8];
      } else {
        teamNames = [...b8, ...c8];
      }
    }
    return teamNames;
  };

  const getGroupList = (text: string, count = 8) => {
    const list = (text || "").split("\n");
    while (list.length < count) list.push("");
    return list.slice(0, count);
  };

  const handleGroupItemChange = (group: "A" | "B" | "C" | "D" | "E", index: number, value: string) => {
    if (!activeTournament) return;
    const week = activeTournament.activeWeek || "1";
    const suffix = week === "1" ? "" : `_w${week}`;
    
    let currentText = "";
    if (group === "A") {
      currentText = week === "2" ? (activeTournament.groupAText_w2 || "") : week === "3" ? (activeTournament.groupAText_w3 || "") : (activeTournament.groupAText || "");
    } else if (group === "B") {
      currentText = week === "2" ? (activeTournament.groupBText_w2 || "") : week === "3" ? (activeTournament.groupBText_w3 || "") : (activeTournament.groupBText || "");
    } else if (group === "C") {
      currentText = week === "2" ? (activeTournament.groupCText_w2 || "") : week === "3" ? (activeTournament.groupCText_w3 || "") : (activeTournament.groupCText || "");
    } else if (group === "D") {
      currentText = week === "2" ? (activeTournament.groupDText_w2 || "") : week === "3" ? (activeTournament.groupDText_w3 || "") : (activeTournament.groupDText || "");
    } else if (group === "E") {
      currentText = week === "2" ? (activeTournament.groupEText_w2 || "") : week === "3" ? (activeTournament.groupEText_w3 || "") : (activeTournament.groupEText || "");
    }

    let count = 8;
    if (activeTournament.format === "32") count = 16;
    else if (activeTournament.format === "20") count = 4;

    const list = getGroupList(currentText, count);
    list[index] = value;
    const newText = list.join("\n");

    const fieldName = `group${group}Text${suffix}`;
    updateActiveTournament({ [fieldName]: newText });
  };

  const getTeams16List = (text: string) => {
    const list = (text || "").split("\n");
    while (list.length < 16) list.push("");
    return list.slice(0, 16);
  };

  const handleTeams16ItemChange = (index: number, value: string) => {
    if (!activeTournament) return;
    const list = getTeams16List(activeTournament.teams16Text);
    list[index] = value;
    const newText = list.join("\n");
    updateActiveTournament({ teams16Text: newText });
  };

  // Auto-populate 16 teams to standings on change of tournament settings (only if not editing existing match)
  React.useEffect(() => {
    if (!editingMatch && activeTournament) {
      const names = getTeamsFromActiveTournament(
        activeTournament,
        activeTournament.format,
        activeTournament.activeMatchup,
        activeTournament.activeGroup || "A"
      );
      const newTeams: Team[] = names.map((name, idx) => {
        const placement = idx + 1;
        return {
          name,
          placement,
          placementPoints: calculatePlacementPoints(placement),
          eliminationPoints: 0,
          bonusPoints: 0,
          totalPoints: calculatePlacementPoints(placement),
          wwcd: placement === 1,
          players: []
        };
      });
      setTeams(newTeams);
    }
  }, [selectedTournamentId, activeTournament?.format, activeTournament?.activeMatchup, activeTournament?.activeGroup, editingMatch]);

  // Sync current metadata league to the active tournament name
  React.useEffect(() => {
    if (activeTournament) {
      handleMetaChange("league", activeTournament.name);
    }
  }, [selectedTournamentId, activeTournament?.name]);

  const applyFormatAndTeamsToLobby = () => {
    if (!activeTournament) return;
    const teamNames = getTeamsFromActiveTournament(
      activeTournament,
      activeTournament.format,
      activeTournament.activeMatchup,
      activeTournament.activeGroup || "A"
    );
    const newTeams: Team[] = teamNames.map((name, idx) => {
      const placement = idx + 1;
      return {
        name,
        placement,
        placementPoints: calculatePlacementPoints(placement),
        eliminationPoints: 0,
        bonusPoints: 0,
        totalPoints: calculatePlacementPoints(placement),
        wwcd: placement === 1,
        players: []
      };
    });

    setTeams(newTeams);
  };

  // Update team names/lineup from current lobby settings while keeping
  // whatever kills, placement order, and player data have already been entered.
  const handleUpdateTeamsFromLobby = () => {
    if (!activeTournament) return;
    const teamNames = getTeamsFromActiveTournament(
      activeTournament,
      activeTournament.format,
      activeTournament.activeMatchup,
      activeTournament.activeGroup || "A"
    );

    setTeams(prev => teamNames.map((name, idx) => {
      const existing = prev[idx];
      if (existing) {
        return { ...existing, name };
      }
      const placement = idx + 1;
      return createEmptyTeam(name, placement);
    }));

    setSuccessMsg("Tim berhasil diupdate! Kills & data pemain yang sudah diisi tetap tersimpan.");
    setTimeout(() => setSuccessMsg(""), 2500);
  };

  // Seed each team's Bonus Point from their accumulated League Rank Points (regular season),
  // for use going into a Grand Final match. Matches teams by name (case-insensitive).
  const handleFillBonusFromLeaguePoints = () => {
    if (!activeTournament?.leagueRankPointsEnabled) return;
    const leagueStandings = calculateLeagueRankStandings(
      matches,
      meta.league.trim(),
      activeTournament.leagueRankPointsTable || [],
      activeTournament.tiebreaker || "WWCD-PlacementPoint-Kill"
    );
    const pointsByTeam: Record<string, number> = {};
    leagueStandings.forEach(s => {
      pointsByTeam[s.team.toLowerCase().trim()] = s.totalLeaguePoints;
    });

    setTeams(prev => prev.map(t => {
      const leaguePoints = pointsByTeam[(t.name || "").toLowerCase().trim()];
      if (leaguePoints === undefined) return t;
      const elims = Number(t.eliminationPoints) || 0;
      const placementPoints = calculatePlacementPoints(t.placement);
      return {
        ...t,
        bonusPoints: leaguePoints,
        totalPoints: placementPoints + elims + leaguePoints
      };
    }));

    setSuccessMsg("Bonus Point berhasil diisi dari League Rank Points!");
    setTimeout(() => setSuccessMsg(""), 2500);
  };


  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [touchOverIndex, setTouchOverIndex] = useState<number | null>(null);

  const reorderTeams = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= teams.length) return;
    setTeams(prev => {
      const updated = [...prev];
      const draggedItem = updated[fromIndex];
      updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, draggedItem);

      // Auto-update placements based on new index/order
      return updated.map((t, idx) => {
        const placement = idx + 1;
        const elims = Number(t.eliminationPoints) || 0;
        const bonus = Number(t.bonusPoints) || 0;
        const placementPoints = calculatePlacementPoints(placement);
        return {
          ...t,
          placement,
          placementPoints,
          totalPoints: placementPoints + elims + bonus,
          wwcd: placement === 1,
          players: t.players || []
        };
      });
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    reorderTeams(draggedIndex, index);
    setDraggedIndex(null);
  };

  // Touch (mobile) drag-and-drop support — native HTML5 DnD does not fire on touch devices,
  // so the grip handle is reordered manually by tracking the row under the finger.
  const handleGripTouchStart = (e: React.TouchEvent, index: number) => {
    setDraggedIndex(index);
    setTouchOverIndex(index);
  };

  const handleGripTouchMove = (e: React.TouchEvent) => {
    if (draggedIndex === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = el?.closest("tr[data-team-index]") as HTMLElement | null;
    if (row) {
      const overIdx = Number(row.dataset.teamIndex);
      if (!Number.isNaN(overIdx)) {
        setTouchOverIndex(overIdx);
      }
    }
  };

  const handleGripTouchEnd = () => {
    if (draggedIndex !== null && touchOverIndex !== null) {
      reorderTeams(draggedIndex, touchOverIndex);
    }
    setDraggedIndex(null);
    setTouchOverIndex(null);
  };

  const prevEditingMatchRef = React.useRef<Match | null>(null);

  // Handle editing prefill
  React.useEffect(() => {
    const prev = prevEditingMatchRef.current;
    prevEditingMatchRef.current = editingMatch || null;

    if (editingMatch) {
      if (!prev || prev.id !== editingMatch.id) {
        const matchLeague = editingMatch.league || "PMSL SEA 2026";
        setMeta({
          date: editingMatch.date || getTodayDateString(),
          matchCode: editingMatch.matchCode || "",
          league: matchLeague,
          totalGame: editingMatch.totalGame || "1",
          gameNo: editingMatch.gameNo || "1",
          map: editingMatch.map || "Erangel",
          liveLink: editingMatch.liveLink || ""
        });
        setIsGrandFinal(!!editingMatch.isGrandFinal);

        // Find matching tournament preset by name to keep dropdown synchronized
        const matchingTour = tournaments.find(t => t.name.toLowerCase().trim() === matchLeague.toLowerCase().trim());
        if (matchingTour) {
          setSelectedTournamentId(matchingTour.id);
        }

        if (editingMatch.teams) {
          setTeams(editingMatch.teams.map(t => {
            const bonus = Number(t.bonusPoints) || 0;
            return {
              name: t.name || "",
              placement: t.placement || 1,
              placementPoints: calculatePlacementPoints(t.placement || 1),
              eliminationPoints: t.eliminationPoints || 0,
              bonusPoints: bonus,
              totalPoints: (calculatePlacementPoints(t.placement || 1)) + (t.eliminationPoints || 0) + bonus,
              wwcd: t.placement === 1,
              players: t.players || []
            };
          }));
        }
      }
    } else {
      if (prev !== null) {
        setMeta({
          date: getTodayDateString(),
          matchCode: "",
          league: activeTournament ? activeTournament.name : "PMSL SEA 2026",
          totalGame: "1",
          gameNo: "1",
          map: "Erangel",
          liveLink: ""
        });
        setIsGrandFinal(false);
        applyFormatAndTeamsToLobby();
      }
    }
  }, [editingMatch, tournaments, activeTournament]);

  const handleMetaChange = (field: string, value: string) => {
    setMeta(prev => ({ ...prev, [field]: value }));
  };

  const handleTeamChange = (teamIdx: number, field: keyof Team, value: any) => {
    setTeams(prev => {
      const updated = [...prev];
      if (field === "placement") {
        const placement = Number(value) || 16;
        const elims = Number(updated[teamIdx].eliminationPoints) || 0;
        const bonus = Number(updated[teamIdx].bonusPoints) || 0;
        const placementPoints = calculatePlacementPoints(placement);
        updated[teamIdx] = {
          ...updated[teamIdx],
          placement,
          placementPoints,
          totalPoints: placementPoints + elims + bonus,
          wwcd: placement === 1
        };
      } else if (field === "eliminationPoints") {
        const elims = Number(value) || 0;
        const bonus = Number(updated[teamIdx].bonusPoints) || 0;
        const placementPoints = calculatePlacementPoints(updated[teamIdx].placement);
        updated[teamIdx] = {
          ...updated[teamIdx],
          eliminationPoints: elims,
          totalPoints: placementPoints + elims + bonus
        };
      } else if (field === "bonusPoints") {
        const bonus = Number(value) || 0;
        const elims = Number(updated[teamIdx].eliminationPoints) || 0;
        const placementPoints = calculatePlacementPoints(updated[teamIdx].placement);
        updated[teamIdx] = {
          ...updated[teamIdx],
          bonusPoints: bonus,
          totalPoints: placementPoints + elims + bonus
        };
      } else {
        updated[teamIdx] = {
          ...updated[teamIdx],
          [field]: value
        };
      }
      return updated;
    });
  };

  // Submit Logic
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setIsSubmitting(true);

    try {
      // Validate manual mode
      if (teams.some(t => !t.name.trim())) {
        throw new Error("Semua nama tim harus diisi.");
      }

      // Auto-calculate final values for each team
      const processedTeams = teams.map(t => {
        const eliminationPoints = Number(t.eliminationPoints) || 0;
        const bonusPoints = Number(t.bonusPoints) || 0;
        const placementPoints = calculatePlacementPoints(t.placement);
        return {
          ...t,
          eliminationPoints,
          bonusPoints,
          totalPoints: placementPoints + eliminationPoints + bonusPoints,
          wwcd: t.placement === 1,
          players: t.players || []
        };
      });

      const newMatch: Match = {
        id: editingMatch?.id,
        date: meta.date,
        matchCode: meta.matchCode.trim(),
        league: meta.league.trim(),
        totalGame: meta.totalGame.trim(),
        gameNo: meta.gameNo.trim(),
        map: meta.map,
        patch: "", // Removed as requested
        liveLink: meta.liveLink.trim(),
        isGrandFinal,
        teams: processedTeams.sort((a, b) => a.placement - b.placement)
      };

      await onSave(newMatch);
      setSuccessMsg("Berhasil menyimpan match secara manual!");
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Terjadi kesalahan saat memproses data.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`p-6 rounded-2xl shadow-xl transition-all ${isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200"}`}>
      <div className="border-b pb-4 mb-4 border-slate-800">
        <h2 className={`text-lg font-bold font-display uppercase tracking-tight ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
          {editingMatch ? "EDIT DATA MATCH RECORD" : "TAMBAH DATA MATCH BARU"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* MATCH METADATA ROW */}
        <div className={`p-4 rounded-xl border grid grid-cols-2 md:grid-cols-6 gap-4 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">TANGGAL:</label>
            <div className="flex gap-1">
              <input
                type="date"
                value={meta.date}
                onChange={(e) => handleMetaChange("date", e.target.value)}
                className={`flex-1 p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                required
              />
              <button
                type="button"
                onClick={() => handleMetaChange("date", getTodayDateString())}
                className="px-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono text-[10px] rounded-lg transition-colors cursor-pointer shrink-0"
                title="Set ke Hari Ini"
              >
                Today
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">KODE MATCH:</label>
            <input
              type="text"
              value={meta.matchCode}
              onChange={(e) => handleMetaChange("matchCode", e.target.value)}
              placeholder="Contoh: W1D1"
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">LIGA/KOMPETISI:</label>
            <select
              value={selectedTournamentId}
              onChange={(e) => {
                setSelectedTournamentId(e.target.value);
              }}
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
            >
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">GAME/MATCH KE:</label>
            <input
              type="text"
              value={meta.gameNo}
              onChange={(e) => {
                handleMetaChange("gameNo", e.target.value);
                handleMetaChange("totalGame", e.target.value);
              }}
              placeholder="Contoh: 1"
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">MAP PLAYED:</label>
            <select
              value={meta.map}
              onChange={(e) => handleMetaChange("map", e.target.value)}
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
            >
              <option value="Erangel">Erangel</option>
              <option value="Miramar">Miramar</option>
              <option value="Sanhok">Sanhok</option>
              <option value="Rondo">Rondo</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">LIVE STREAM LINK:</label>
            <input
              type="url"
              value={meta.liveLink}
              onChange={(e) => handleMetaChange("liveLink", e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
            />
          </div>
        </div>

        {/* GRAND FINAL FLAG */}
        <div className={`flex flex-wrap items-center gap-2.5 p-3 rounded-xl border transition-all ${
          isGrandFinal
            ? "bg-amber-500/10 border-amber-500/30"
            : isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"
        }`}>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isGrandFinal}
              onChange={(e) => setIsGrandFinal(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
            <span className={`text-[11px] font-mono font-bold uppercase ${isGrandFinal ? "text-amber-500" : isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
              Tandai sebagai Match Grand Final
            </span>
            <span className="text-[9px] text-slate-500 normal-case">(dipisahkan dari klasemen overall liga yang sama di Standings)</span>
          </label>

          {isGrandFinal && activeTournament?.leagueRankPointsEnabled && (
            <button
              type="button"
              onClick={handleFillBonusFromLeaguePoints}
              className="ml-auto px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-lg border border-teal-500/20 text-[10px] font-bold font-mono transition-all cursor-pointer"
              title="Isi Bonus Point tiap tim dari akumulasi League Rank Points regular season"
            >
              Isi Bonus Point dari League Points
            </button>
          )}
        </div>

        {/* MANUAL ENTRY LAYOUT */}
        <div className="space-y-6 animate-fadeIn">
            
            {/* COLLAPSIBLE ROSTER/GROUP REGISTER SETTINGS */}
            <div className={`p-5 rounded-2xl transition-all ${isDarkMode ? "bg-[#0b0f19]/40" : "bg-slate-50 border border-slate-200"}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black font-mono text-amber-500 tracking-tight flex items-center gap-1.5 uppercase">
                    ⚙️ DETAIL SETTINGS
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCreateTournament()}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black font-mono flex items-center gap-1 transition-all cursor-pointer shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    BUAT TURNAMEN BARU
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRosterSettings(!showRosterSettings)}
                    className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                      showRosterSettings 
                        ? "bg-slate-800 text-slate-200 border-slate-700" 
                        : "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                    }`}
                  >
                    {showRosterSettings ? "✕ Tutup" : "⚙️ Buka Pengaturan"}
                  </button>
                </div>
              </div>

              {showRosterSettings && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Row 1: SELECT, NAME, FORMAT, TIEBREAKER */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-slate-950/20 p-4 rounded-xl border border-slate-850/60">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">SELECT TOURNAMENT TO EDIT</label>
                      <div className="flex gap-1.5">
                        <select
                          value={selectedTournamentId}
                          onChange={(e) => setSelectedTournamentId(e.target.value)}
                          className={`flex-1 p-2 rounded-lg text-xs font-mono font-bold border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-[#0b0f19] border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                        >
                          {tournaments.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteTournament()}
                          className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/40 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Hapus Turnamen Ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">TOURNAMENT NAME</label>
                      <input
                        type="text"
                        value={activeTournament?.name || ""}
                        onChange={(e) => updateActiveTournament({ name: e.target.value })}
                        className={`w-full p-2 rounded-lg text-xs font-mono font-bold border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-[#0b0f19] border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                        placeholder="Nama Turnamen"
                      />
                    </div>

                    <div className="space-y-1.5 pb-1">
                      <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">TOURNAMENT FORMAT</label>
                      <div className="flex flex-wrap gap-2">
                        {([
                          ["16", "16 TIM"],
                          ["20", "20 TIM (A/B/C/D/E)"],
                          ["24", "24 TIM (A/B/C)"],
                          ["32", "32 TIM (A/B)"],
                        ] as const).map(([format, label]) => (
                          <button
                            key={format}
                            type="button"
                            onClick={() => updateActiveTournament({ format })}
                            className={`rounded-lg border px-3 py-1.5 text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                              activeTournament?.format === format
                                ? "border-amber-500 bg-amber-500 text-slate-950"
                                : isDarkMode ? "border-slate-700 bg-slate-950 text-slate-400" : "border-slate-300 bg-white text-slate-600"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">STANDINGS TIEBREAKER</label>
                      <select
                        value={activeTournament?.tiebreaker || "WWCD-PlacementPoint-Kill"}
                        onChange={(e) => updateActiveTournament({ tiebreaker: e.target.value as any })}
                        className={`w-full p-2 rounded-lg text-xs font-mono font-bold border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-[#0b0f19] border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                      >
                        <option value="WWCD-PlacementPoint-Kill">WWCD - Placement - Kill</option>
                        <option value="WWCD-Kill-PlacementPoint">WWCD - Kill - Placement</option>
                      </select>
                    </div>
                  </div>

                  {/* League Rank Points: opt-in per tournament, not every league uses this */}
                  <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-850/60 space-y-3">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!activeTournament?.leagueRankPointsEnabled}
                        onChange={(e) => updateActiveTournament({ leagueRankPointsEnabled: e.target.checked })}
                        className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                      />
                      <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider">Aktifkan League Rank Points</span>
                      <span className="text-[9px] text-slate-500 normal-case">(ranking mingguan dikonversi jadi poin liga terpisah — bisa dipakai sebagai Bonus Point saat Grand Final)</span>
                    </label>

                    {activeTournament?.leagueRankPointsEnabled && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">TABEL POIN (RANK MINGGUAN → POIN LIGA)</label>
                        <div className="flex flex-wrap gap-2">
                          {(activeTournament.leagueRankPointsTable || []).map((pts, idx) => (
                            <div key={idx} className={`flex items-center gap-1 rounded-lg px-2 py-1 border ${isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-300"}`}>
                              <span className="text-[9px] text-slate-500 font-bold">#{idx + 1}</span>
                              <input
                                type="number"
                                value={pts}
                                onChange={(e) => {
                                  const table = [...(activeTournament.leagueRankPointsTable || [])];
                                  table[idx] = Number(e.target.value) || 0;
                                  updateActiveTournament({ leagueRankPointsTable: table });
                                }}
                                className={`w-12 bg-transparent text-center text-xs font-bold focus:outline-none ${isDarkMode ? "text-amber-500" : "text-amber-600"}`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const table = (activeTournament.leagueRankPointsTable || []).filter((_, i) => i !== idx);
                                  updateActiveTournament({ leagueRankPointsTable: table });
                                }}
                                className="text-slate-600 hover:text-red-400 cursor-pointer"
                                title="Hapus rank ini"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const table = [...(activeTournament.leagueRankPointsTable || []), 0];
                              updateActiveTournament({ leagueRankPointsTable: table });
                            }}
                            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-amber-500/20"
                          >
                            <Plus className="w-3 h-3" />
                            Tambah Rank
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Week Selector for 20 and 24 formats */}
                  {(activeTournament?.format === "20" || activeTournament?.format === "24") && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-950/25 p-3.5 rounded-xl border border-slate-850/60 text-xs">
                      <span className="font-mono font-bold text-slate-400 uppercase tracking-wider">
                        📅 PILIH WEEK ACKAN ROTASI GRUP:
                      </span>
                      <div className="flex gap-1.5">
                        {["1", "2", "3"].map((wk) => (
                          <button
                            key={wk}
                            type="button"
                            onClick={() => updateActiveTournament({ activeWeek: wk })}
                            className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border transition-colors cursor-pointer ${
                              activeWeek === wk
                                ? "border-amber-500 bg-amber-500/10 text-amber-500"
                                : isDarkMode ? "border-slate-850 bg-[#0b0f19] text-slate-400 hover:text-slate-200" : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Week {wk}
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-500 italic font-mono sm:ml-auto">
                        *Simpan pembagian grup yang berbeda untuk tiap minggu
                      </span>
                    </div>
                  )}

                  {/* Row 2: Roster Grid Columns */}
                  {activeTournament?.format === "20" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                      {([
                        ["A", "GRUP A", currentGroupAText],
                        ["B", "GRUP B", currentGroupBText],
                        ["C", "GRUP C", currentGroupCText],
                        ["D", "GRUP D", currentGroupDText],
                        ["E", "GRUP E", currentGroupEText]
                      ] as const).map(([groupKey, label, groupText]) => (
                        <div key={groupKey} className="space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                            <span className="text-xs font-black font-mono text-amber-500">{label}</span>
                            <span className="text-[10px] font-mono text-slate-500">4 TIM</span>
                          </div>
                          <div className="space-y-1.5">
                            {getGroupList(groupText, 4).map((team, idx) => (
                              <div key={`${groupKey}-${idx}`} className={`flex items-center gap-2 p-1 px-2.5 rounded-lg border ${isDarkMode ? "bg-slate-950/60 border-slate-900 text-slate-200" : "bg-slate-50 border-slate-200"}`}>
                                <span className="text-[10px] font-mono font-bold text-slate-500 w-5">{groupKey}{idx + 1}.</span>
                                <input
                                  type="text"
                                  value={team}
                                  onChange={(e) => handleGroupItemChange(groupKey, idx, e.target.value)}
                                  className="bg-transparent border-none outline-none font-mono font-bold text-xs w-full text-slate-100 p-0 focus:ring-0"
                                  placeholder={`${groupKey}${idx + 1} Team`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : activeTournament?.format === "24" ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      {/* GRUP A */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="text-xs font-black font-mono text-amber-500">GRUP A</span>
                          <span className="text-[10px] font-mono text-slate-500">8 TIM</span>
                        </div>
                        <div className="space-y-1.5">
                          {getGroupList(currentGroupAText).map((team, idx) => (
                            <div key={`A-${idx}`} className={`flex items-center gap-2 p-1 px-2.5 rounded-lg border ${isDarkMode ? "bg-slate-950/60 border-slate-900 text-slate-200" : "bg-slate-50 border-slate-200"}`}>
                              <span className="text-[10px] font-mono font-bold text-slate-500 w-6">A{idx+1}.</span>
                              <input
                                type="text"
                                value={team}
                                onChange={(e) => handleGroupItemChange("A", idx, e.target.value)}
                                className="bg-transparent border-none outline-none font-mono font-bold text-xs w-full text-slate-100 p-0 focus:ring-0"
                                placeholder={`A-${idx+1} Team Name`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* GRUP B */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="text-xs font-black font-mono text-amber-500">GRUP B</span>
                          <span className="text-[10px] font-mono text-slate-500">8 TIM</span>
                        </div>
                        <div className="space-y-1.5">
                          {getGroupList(currentGroupBText).map((team, idx) => (
                            <div key={`B-${idx}`} className={`flex items-center gap-2 p-1 px-2.5 rounded-lg border ${isDarkMode ? "bg-slate-950/60 border-slate-900 text-slate-200" : "bg-slate-50 border-slate-200"}`}>
                              <span className="text-[10px] font-mono font-bold text-slate-500 w-6">B{idx+1}.</span>
                              <input
                                type="text"
                                value={team}
                                onChange={(e) => handleGroupItemChange("B", idx, e.target.value)}
                                className="bg-transparent border-none outline-none font-mono font-bold text-xs w-full text-slate-100 p-0 focus:ring-0"
                                placeholder={`B-${idx+1} Team Name`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* GRUP C */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="text-xs font-black font-mono text-amber-500">GRUP C</span>
                          <span className="text-[10px] font-mono text-slate-500">8 TIM</span>
                        </div>
                        <div className="space-y-1.5">
                          {getGroupList(currentGroupCText).map((team, idx) => (
                            <div key={`C-${idx}`} className={`flex items-center gap-2 p-1 px-2.5 rounded-lg border ${isDarkMode ? "bg-slate-950/60 border-slate-900 text-slate-200" : "bg-slate-50 border-slate-200"}`}>
                              <span className="text-[10px] font-mono font-bold text-slate-500 w-6">C{idx+1}.</span>
                              <input
                                type="text"
                                value={team}
                                onChange={(e) => handleGroupItemChange("C", idx, e.target.value)}
                                className="bg-transparent border-none outline-none font-mono font-bold text-xs w-full text-slate-100 p-0 focus:ring-0"
                                placeholder={`C-${idx+1} Team Name`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : activeTournament?.format === "32" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {(["A", "B"] as const).map((group) => (
                        <div key={group} className="space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                            <span className="text-xs font-black font-mono text-amber-500">GRUP {group}</span>
                            <span className="text-[10px] font-mono text-slate-500">16 TIM — LOBBY TERPISAH</span>
                          </div>
                          <div className="space-y-1.5">
                            {getGroupList(group === "A" ? currentGroupAText : currentGroupBText, 16).map((team, idx) => (
                              <div key={`${group}-${idx}`} className={`flex items-center gap-2 p-1 px-2.5 rounded-lg border ${isDarkMode ? "bg-slate-950/60 border-slate-900 text-slate-200" : "bg-slate-50 border-slate-200"}`}>
                                <span className="text-[10px] font-mono font-bold text-slate-500 w-7">{group}{idx + 1}.</span>
                                <input
                                  type="text"
                                  value={team}
                                  onChange={(e) => handleGroupItemChange(group, idx, e.target.value)}
                                  className="bg-transparent border-none outline-none font-mono font-bold text-xs w-full text-slate-100 p-0 focus:ring-0"
                                  placeholder={`Grup ${group} Tim ${idx + 1}`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* LOBBY TIM 1-8 */}
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          {getTeams16List(activeTournament.teams16Text).slice(0, 8).map((team, idx) => (
                            <div key={`T-${idx}`} className={`flex items-center gap-2 p-1 px-2.5 rounded-lg border ${isDarkMode ? "bg-slate-950/60 border-slate-900 text-slate-200" : "bg-slate-50 border-slate-200"}`}>
                              <span className="text-[10px] font-mono font-bold text-slate-500 w-6">T{idx+1}.</span>
                              <input
                                type="text"
                                value={team}
                                onChange={(e) => handleTeams16ItemChange(idx, e.target.value)}
                                className="bg-transparent border-none outline-none font-mono font-bold text-xs w-full text-slate-100 p-0 focus:ring-0"
                                placeholder={`Team ${idx+1}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* LOBBY TIM 9-16 */}
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          {getTeams16List(activeTournament.teams16Text).slice(8, 16).map((team, idx) => {
                            const realIdx = idx + 8;
                            return (
                              <div key={`T-${realIdx}`} className={`flex items-center gap-2 p-1 px-2.5 rounded-lg border ${isDarkMode ? "bg-slate-950/60 border-slate-900 text-slate-200" : "bg-slate-50 border-slate-200"}`}>
                                <span className="text-[10px] font-mono font-bold text-slate-500 w-6">T{realIdx+1}.</span>
                                <input
                                  type="text"
                                  value={team}
                                  onChange={(e) => handleTeams16ItemChange(realIdx, e.target.value)}
                                  className="bg-transparent border-none outline-none font-mono font-bold text-xs w-full text-slate-100 p-0 focus:ring-0"
                                  placeholder={`Team ${realIdx+1}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  )}

                  {/* Matchup bar for Round Robin format */}
                  {activeTournament?.format === "20" && (
                    <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-bold font-mono text-slate-300">PILIH MATCHUP GRUP HARI INI:</span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {([
                          ["ABCD", "Grup A+B+C+D"],
                          ["ABCE", "Grup A+B+C+E"],
                          ["ABDE", "Grup A+B+D+E"],
                          ["ACDE", "Grup A+C+D+E"],
                          ["BCDE", "Grup B+C+D+E"]
                        ] as const).map(([matchup, label]) => (
                          <button
                            key={matchup}
                            type="button"
                            onClick={() => updateActiveTournament({ activeMatchup: matchup })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                              activeTournament.activeMatchup === matchup
                                ? "bg-amber-500 text-slate-950 border-amber-500 font-extrabold"
                                : isDarkMode ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {label}
                          </button>
                        ))}

                      </div>
                    </div>
                  )}

                  {activeTournament?.format === "24" && (
                    <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-bold font-mono text-slate-300">PILIH MATCHUP GRUP HARI INI:</span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {(["A_B", "A_C", "B_C"] as const).map((matchup) => (
                          <button
                            key={matchup}
                            type="button"
                            onClick={() => updateActiveTournament({ activeMatchup: matchup })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                              activeTournament.activeMatchup === matchup
                                ? "bg-amber-500 text-slate-950 border-amber-500 font-extrabold"
                                : isDarkMode ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {matchup === "A_B" ? "Grup A vs B" : matchup === "A_C" ? "Grup A vs C" : "Grup B vs C"}
                          </button>
                        ))}

                      </div>
                    </div>
                  )}

                  {activeTournament?.format === "32" && (
                    <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-bold font-mono text-slate-300">PILIH LOBBY GRUP UNTUK MATCH INI:</span>
                      </div>
                      <div className="flex gap-2">
                        {(["A", "B"] as const).map((group) => (
                          <button
                            key={group}
                            type="button"
                            onClick={() => updateActiveTournament({ activeGroup: group })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                              (activeTournament.activeGroup || "A") === group
                                ? "bg-amber-500 text-slate-950 border-amber-500 font-extrabold"
                                : isDarkMode ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Grup {group} — 16 Tim
                          </button>
                        ))}
                      </div>
                    </div>
                  )}


                </div>
              )}
            </div>

            {/* SQUAD TABLE HEADER */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black font-mono text-slate-400 uppercase tracking-tight">
                  📌 MODIFIKASI LOBBY STANDINGS (16 TIM)
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateTeamsFromLobby()}
                  className="px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-lg border border-teal-500/20 text-[10px] font-bold font-mono transition-all cursor-pointer"
                  title="Update nama tim dari pengaturan lobby, tanpa menghapus kills/urutan yang sudah diisi"
                >
                  Update Team
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatAndTeamsToLobby()}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg border border-amber-500/20 text-[10px] font-bold font-mono transition-all cursor-pointer"
                  title="Reset penuh: urutan tim & kills akan dikembalikan ke awal"
                >
                  Reset Lobby
                </button>
              </div>
            </div>

            {/* LOBBY STANDINGS TWO-COLUMN LAYOUT */}
            {(() => {
              const halfLength = Math.ceil(teams.length / 2);
              const leftTeams = teams.slice(0, halfLength);
              const rightTeams = teams.slice(halfLength);

              const renderTableColumn = (teamList: Team[], offset: number, sideLabel: string) => (
                <div className={`border rounded-xl overflow-hidden ${isDarkMode ? "border-slate-850 bg-slate-950/20" : "border-slate-200 bg-white"}`}>
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-xs font-mono border-collapse">
                      <thead>
                        <tr className={`text-left border-b ${isDarkMode ? "bg-slate-950 border-slate-850 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                          <th className="py-2 px-1 w-14 text-center text-[9px] text-slate-500 font-bold uppercase">Grip</th>
                          <th className="py-2 px-1.5 w-8 text-center font-bold uppercase text-[9px] tracking-wider">#</th>
                          <th className="py-2 px-2 min-w-[120px] font-bold uppercase text-[9px] tracking-wider">Nama Squad / Tim</th>
                          <th className="py-2 px-1 w-12 text-center font-bold uppercase text-[9px] tracking-wider">Kills</th>
                          {activeTournament?.format === "16" && (
                            <th className="py-2 px-1 w-12 text-center font-bold uppercase text-[9px] tracking-wider text-teal-400">Bonus</th>
                          )}
                          <th className="py-2 px-2 w-16 text-center font-bold uppercase text-[9px] tracking-wider">Poin</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? "divide-slate-850" : "divide-slate-100"}`}>
                        {teamList.map((team, localIdx) => {
                          const tIdx = offset + localIdx;
                          const placementPoints = calculatePlacementPoints(team.placement);
                          const elims = Number(team.eliminationPoints) || 0;
                          const bonus = Number(team.bonusPoints) || 0;
                          const isDraggingThis = draggedIndex === tIdx;
                          const isTouchDropTarget = draggedIndex !== null && draggedIndex !== tIdx && touchOverIndex === tIdx;

                          return (
                            <tr
                              key={tIdx}
                              data-team-index={tIdx}
                              draggable
                              onDragStart={(e) => handleDragStart(e, tIdx)}
                              onDragOver={(e) => handleDragOver(e, tIdx)}
                              onDrop={(e) => handleDrop(e, tIdx)}
                              className={`transition-all ${
                                isDraggingThis
                                  ? "bg-amber-500/10 opacity-40 border-y-2 border-dashed border-amber-500"
                                  : isTouchDropTarget
                                  ? "bg-amber-500/10 border-y-2 border-dashed border-amber-500"
                                  : isDarkMode ? "hover:bg-slate-900/40" : "hover:bg-slate-50/40"
                              }`}
                            >
                              {/* Grip Handle for Drag and Drop (mouse: HTML5 DnD, touch: manual tracking) + Up/Down reorder buttons */}
                              <td className="py-1.5 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-0.5">
                                  <div className="flex flex-col">
                                    <button
                                      type="button"
                                      onClick={() => reorderTeams(tIdx, tIdx - 1)}
                                      disabled={tIdx === 0}
                                      title="Pindah ke atas"
                                      className="text-slate-500 hover:text-amber-500 disabled:opacity-20 disabled:hover:text-slate-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    >
                                      <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => reorderTeams(tIdx, tIdx + 1)}
                                      disabled={tIdx === teams.length - 1}
                                      title="Pindah ke bawah"
                                      className="text-slate-500 hover:text-amber-500 disabled:opacity-20 disabled:hover:text-slate-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div
                                    className="flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-500 hover:text-amber-500 transition-colors touch-none"
                                    style={{ touchAction: "none" }}
                                    onTouchStart={(e) => handleGripTouchStart(e, tIdx)}
                                    onTouchMove={handleGripTouchMove}
                                    onTouchEnd={handleGripTouchEnd}
                                    onTouchCancel={handleGripTouchEnd}
                                  >
                                    <GripVertical className="w-3 h-3" />
                                  </div>
                                </div>
                              </td>
                              <td className="py-1.5 px-1.5 text-center text-slate-500 font-bold font-mono">
                                {tIdx + 1}
                              </td>
                              <td className="py-1.5 px-2">
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className={`px-1 py-0.5 text-[11px] font-bold font-mono ${
                                    isDarkMode ? "text-slate-100" : "text-slate-900"
                                  }`}>
                                    {team.name || <span className="text-slate-500 italic">Squad {tIdx + 1}</span>}
                                  </div>
                                </div>
                              </td>
                              {/* Narrow and tight eliminations input */}
                              <td className="py-1.5 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="number"
                                  min={0}
                                  value={team.eliminationPoints}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? 0 : Number(e.target.value);
                                    handleTeamChange(tIdx, "eliminationPoints", val);
                                  }}
                                  className={`w-10 p-0.5 text-center font-bold text-[11px] rounded-md border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                                  required
                                />
                              </td>
                              {activeTournament?.format === "16" && (
                                <td className="py-1.5 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="number"
                                    min={0}
                                    value={team.bonusPoints || 0}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const val = e.target.value === "" ? 0 : Number(e.target.value);
                                      handleTeamChange(tIdx, "bonusPoints", val);
                                    }}
                                    title="Bonus / Starting Point (opsional, situasional)"
                                    className={`w-10 p-0.5 text-center font-bold text-[11px] rounded-md border focus:outline-none focus:ring-1 focus:ring-teal-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-teal-300" : "bg-slate-50 border-slate-300 text-teal-700"}`}
                                  />
                                </td>
                              )}
                              <td className="py-1.5 px-2 text-center font-extrabold font-mono text-amber-500 text-[11px]">
                                {placementPoints + elims + bonus} <span className="text-[8px] text-slate-500 font-normal">pts</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {renderTableColumn(leftTeams, 0, `KIRI (TIM 1 - ${halfLength})`)}
                    {renderTableColumn(rightTeams, halfLength, `KANAN (TIM ${halfLength + 1} - ${teams.length})`)}
                  </div>
                </div>
              );
            })()}
          </div>

        {/* Action Error / Success displays */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs font-mono flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl text-xs font-mono text-center">
            {successMsg}
          </div>
        )}

        {/* Buttons Row */}
        <div className="flex gap-3 justify-end pt-3 border-t border-slate-850">
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold font-mono border cursor-pointer transition-all ${
              isDarkMode 
                ? "bg-slate-950 hover:bg-slate-900 text-slate-400 border-slate-800" 
                : "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200"
            }`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono text-xs rounded-xl shadow-lg shadow-amber-500/10 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {isSubmitting ? (
               <>
                 <RefreshCw className="w-4 h-4 animate-spin" />
                 <span>Saving data...</span>
               </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span>Save Match Logs</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
