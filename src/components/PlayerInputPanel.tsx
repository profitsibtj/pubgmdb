import React, { useState, useMemo, useEffect, useRef } from "react";
import { Match, Team, DailyStatsEntry } from "../types";
import { RosterPlayer } from "./RosterManager";
import { getMatchWeekLabel, getTournamentTeamList, canonicalizeTeamName, matchRosterPlayer } from "../utils";
import {
  Users, Save, RefreshCw, Layers, CheckCircle,
  Plus, Trash2
} from "lucide-react";

interface PlayerInputPanelProps {
  matches: Match[];
  dailyStats: DailyStatsEntry[];
  roster: RosterPlayer[];
  onSaveDailyStats: (entry: DailyStatsEntry) => Promise<void>;
  // Deletes the whole loaded day/week/tournament-wide record (every player in it) - only offered
  // once an existing record is actually loaded (existingRecordId set), never for a blank new entry.
  onDeleteDailyStats?: (id: string) => Promise<void>;
  isDarkMode: boolean;
  tournaments?: any[];
  onUpdateTournaments?: (updatedTournaments: any[]) => void;
  // Lets other tabs (e.g. Player Stats "Edit") deep-link straight into an already-posted
  // league+period record here instead of the admin having to reselect it manually.
  presetSelection?: { league: string; date?: string; week?: string; tournamentWide?: boolean } | null;
  onConsumedPresetSelection?: () => void;
}

interface ColumnConfig {
  key: string;
  label: string;
  // "time" columns are entered as free text (e.g. "18:24") but aggregated numerically as seconds
  // in Player Stats, unlike a plain "string" column which is never summed.
  type: "string" | "number" | "time";
}

interface DailyPlayer {
  name: string;
  team: string;
  stats: Record<string, any>;
}

const STANDARD_STAT_COLUMNS: { key: string; label: string }[] = [
  { key: "matchesPlayed", label: "Matches" },
  { key: "elims", label: "Kills" },
  { key: "damage", label: "Damage" },
  { key: "assists", label: "Assists" },
  { key: "heals", label: "Heals" },
  { key: "placementPoints", label: "Placement Points" },
  { key: "wwcdCount", label: "WWCD" },
  { key: "error", label: "Error" },
];

// Derives a custom column's storage key from its name instead of a random/timestamp value, so
// re-adding the same custom column (e.g. "Assist") in a later period's fresh record reuses the
// same key instead of minting a new one - otherwise Player Stats (which aggregates every period
// together) sees each period's copy as a totally different column and shows duplicates.
const slugifyColumnLabel = (label: string): string => {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `custom_${slug || Date.now()}`;
};

// Player fields that are never shown/edited as a data column in this grid.
const NON_COLUMN_PLAYER_KEYS = new Set(["name", "role", "weapon", "survivalTime", "knocks", "mvp", "elimsPercent", "dmgPercent"]);

// Reconstructs a column list straight from a saved record's player data, for records saved before
// customColumns existed (or before the matching Supabase column was added) - those have no
// customColumns metadata at all. Falling back to a fixed column list in that case would hide any
// stat that was actually entered (e.g. Assists) and, since the grid only loads stats.[key] for
// columns it knows about, a subsequent Save would silently overwrite the hidden values with 0.
const reconstructColumnsFromMatch = (match: DailyStatsEntry): ColumnConfig[] => {
  const cols: ColumnConfig[] = [
    { key: "name", label: "Player", type: "string" },
    { key: "team", label: "Team", type: "string" },
  ];
  const allPlayers = (match.teams || []).flatMap(t => t.players || []);

  const alwaysShown = new Set(["matchesPlayed", "elims", "damage"]);
  STANDARD_STAT_COLUMNS.forEach(({ key, label }) => {
    const hasRealData = alwaysShown.has(key) || allPlayers.some(p => Number((p as any)[key]) !== 0);
    if (hasRealData) cols.push({ key, label, type: "number" });
  });

  // Any further custom columns (added via "+ Add Column" before customColumns existed) that
  // survived as extra keys directly on the player objects.
  const standardKeys = new Set(STANDARD_STAT_COLUMNS.map(c => c.key));
  const extraKeys = new Set<string>();
  allPlayers.forEach(p => {
    Object.keys(p).forEach(k => {
      if (standardKeys.has(k) || NON_COLUMN_PLAYER_KEYS.has(k)) return;
      extraKeys.add(k);
    });
  });
  extraKeys.forEach(k => {
    const sample = allPlayers.find(p => (p as any)[k] !== undefined) as any;
    cols.push({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), type: typeof sample?.[k] === "number" ? "number" : "string" });
  });

  return cols;
};

export const PlayerInputPanel: React.FC<PlayerInputPanelProps> = ({
  matches,
  dailyStats,
  roster,
  onSaveDailyStats,
  onDeleteDailyStats,
  isDarkMode,
  tournaments,
  onUpdateTournaments,
  presetSelection,
  onConsumedPresetSelection
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
    // Second, add any other leagues from real match results
    matches.forEach(m => {
      if (m.league) {
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

  // Player names typed into the spreadsheet must link back to a registered Squad Roster player
  // for this league (either their current name or a registered previous nickname) - used both to
  // power the name autocomplete and to validate on save.
  const rosterForLeague = useMemo(() => {
    return (roster || []).filter(r => (r.league || "").trim().toLowerCase() === selectedLeague.trim().toLowerCase());
  }, [roster, selectedLeague]);

  const rosterNamesForLeague = useMemo(() => {
    const set = new Set<string>();
    rosterForLeague.forEach(r => {
      set.add(r.name.trim().toLowerCase());
      (r.previousNames || []).forEach(pn => set.add(pn.trim().toLowerCase()));
    });
    return set;
  }, [rosterForLeague]);

  const rosterNameOptions = useMemo(() => {
    const names = new Set<string>();
    rosterForLeague.forEach(r => names.add(r.name.trim()));
    return Array.from(names).sort();
  }, [rosterForLeague]);

  // Typed/pasted name (current name or a registered previous nickname) -> that roster player's
  // team, used to auto-fill the Team cell so it doesn't have to be typed twice. A name shared by
  // two different roster players on different teams (see matchRosterPlayer) maps to null instead -
  // ambiguous, so the Team field is left for the admin to fill in by hand rather than guessing.
  const nameToTeamMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    rosterForLeague.forEach(r => {
      const names = [r.name.trim().toLowerCase(), ...(r.previousNames || []).map(pn => pn.trim().toLowerCase())];
      names.forEach(n => {
        if (!n) return;
        map[n] = n in map ? null : r.team;
      });
    });
    return map;
  }, [rosterForLeague]);

  // Reconciles a typed name (given the team it's being entered under) back to the specific
  // roster player it belongs to - both resolving a registered previous nickname back to their
  // current name, and disambiguating two different roster players who share a name by team, so
  // this record always stores the right person's actual current name.
  const canonicalizePlayer = React.useCallback(
    (rawName: string, teamName: string) => matchRosterPlayer(rawName, teamName, rosterForLeague).name,
    [rosterForLeague]
  );

  // Look up the selected tournament's preset to see which stats granularities it supports.
  // Not every tournament tracks both - day and week are independently opt-in per tournament.
  const selectedTournamentPreset = useMemo(() => {
    if (!tournaments || !selectedLeague) return null;
    return tournaments.find((t: any) => (t.name || "").toLowerCase().trim() === selectedLeague.toLowerCase().trim()) || null;
  }, [tournaments, selectedLeague]);

  // Canonical team names configured for this tournament (plus any registered ABBR), so a team
  // typed as an abbreviation (e.g. "BTR") gets auto-corrected to its full registered name (e.g.
  // "Bigetron by Vitality") on save instead of silently creating a second, separate "team".
  const teamListForLeague = useMemo(() => getTournamentTeamList(selectedTournamentPreset), [selectedTournamentPreset]);
  const canonicalizeTeam = React.useCallback(
    (rawName: string) => canonicalizeTeamName(rawName, teamListForLeague, selectedTournamentPreset?.teamAbbreviations),
    [teamListForLeague, selectedTournamentPreset]
  );

  // Missing config defaults to day-only, matching every tournament's behavior before this setting existed.
  const dayStatsEnabled = selectedTournamentPreset ? selectedTournamentPreset.playerStatsDayEnabled !== false : true;
  const weekStatsEnabled = !!selectedTournamentPreset?.playerStatsWeekEnabled;
  // "Sepanjang Turnamen" (whole-tournament): one single record with no day/week breakdown, meant
  // for old/legacy data that predates or doesn't fit a clean day/week structure.
  const tournamentStatsEnabled = !!selectedTournamentPreset?.playerStatsTournamentEnabled;

  // Lives here (not in Input Match Data) since it's specifically about how player stats are
  // sourced/entered - e.g. some tournaments only publish player stats weekly, never per day.
  const handleTogglePlayerStatsGranularity = (field: "playerStatsDayEnabled" | "playerStatsWeekEnabled" | "playerStatsTournamentEnabled", value: boolean) => {
    if (!tournaments || !selectedTournamentPreset || !onUpdateTournaments) return;
    const updated = tournaments.map((t: any) => t.id === selectedTournamentPreset.id ? { ...t, [field]: value } : t);
    onUpdateTournaments(updated);
  };

  const [statsMode, setStatsMode] = useState<"day" | "week" | "tournament">("day");

  // Keep statsMode valid for whichever granularities the current tournament actually supports
  useEffect(() => {
    const enabledFor: Record<"day" | "week" | "tournament", boolean> = {
      day: dayStatsEnabled, week: weekStatsEnabled, tournament: tournamentStatsEnabled
    };
    if (enabledFor[statsMode]) return;
    const fallback = (["day", "week", "tournament"] as const).find(m => enabledFor[m]);
    if (fallback) setStatsMode(fallback);
  }, [selectedLeague, dayStatsEnabled, weekStatsEnabled, tournamentStatsEnabled, statsMode]);

  // 2. Extract existing dates for the selected tournament
  const availableDates = useMemo(() => {
    if (!selectedLeague) return [];
    const dates = new Set<string>();
    matches.forEach(m => {
      if (m.league && m.league.toLowerCase().trim() === selectedLeague.toLowerCase().trim() && m.date) {
        dates.add(m.date);
      }
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a)); // Descending
  }, [matches, selectedLeague]);

  // Extract existing weeks for the selected tournament (only present when matchCodes encode a week)
  const availableWeeks = useMemo(() => {
    if (!selectedLeague) return [];
    const weeks = new Set<string>();
    matches.forEach(m => {
      if (m.league && m.league.toLowerCase().trim() === selectedLeague.toLowerCase().trim()) {
        const w = getMatchWeekLabel(m);
        if (w) weeks.add(w);
      }
    });
    return Array.from(weeks).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nb = parseInt(b.replace(/\D/g, ""), 10);
      return nb - na; // Descending, matching availableDates' most-recent-first order
    });
  }, [matches, selectedLeague]);

  // 3. Date/Week Selection state
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<string>("");

  // Holds a date/week requested via `presetSelection` (deep-link from Player Stats "Edit") until
  // the date/week effects below get a chance to apply it - they'd otherwise immediately overwrite
  // it back to the most-recent entry as soon as `selectedLeague` changes.
  const pendingPresetPeriodRef = useRef<{ date?: string; week?: string } | null>(null);

  // Apply an incoming deep-link selection once, then let the parent clear it
  useEffect(() => {
    if (!presetSelection) return;
    pendingPresetPeriodRef.current = { date: presetSelection.date, week: presetSelection.week };
    setSelectedLeague(presetSelection.league);
    if (presetSelection.tournamentWide) {
      setStatsMode("tournament");
    } else if (presetSelection.week) {
      setStatsMode("week");
    } else if (presetSelection.date) {
      setStatsMode("day");
    }
    if (onConsumedPresetSelection) onConsumedPresetSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetSelection]);

  // Adjust date selection when selectedLeague or availableDates changes
  useEffect(() => {
    if (availableDates.length > 0) {
      const pendingDate = pendingPresetPeriodRef.current?.date;
      if (pendingDate && availableDates.includes(pendingDate)) {
        setSelectedDate(pendingDate);
        pendingPresetPeriodRef.current = { ...pendingPresetPeriodRef.current, date: undefined };
      } else {
        setSelectedDate(availableDates[0]);
      }
    } else {
      setSelectedDate("");
    }
  }, [selectedLeague, availableDates]);

  // Adjust week selection when selectedLeague or availableWeeks changes
  useEffect(() => {
    if (availableWeeks.length > 0) {
      const pendingWeek = pendingPresetPeriodRef.current?.week;
      if (pendingWeek && availableWeeks.includes(pendingWeek)) {
        setSelectedWeek(pendingWeek);
        pendingPresetPeriodRef.current = { ...pendingPresetPeriodRef.current, week: undefined };
      } else {
        setSelectedWeek(availableWeeks[0]);
      }
    } else {
      setSelectedWeek("");
    }
  }, [selectedLeague, availableWeeks]);

  const dailyWeekMatchCode = (week: string) => "DAILY_" + week.replace(/\s+/g, "").toUpperCase();

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
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [deleteRecordConfirmOpen, setDeleteRecordConfirmOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // States for custom column addition to avoid iframe prompt/confirm issues
  const [showAddColInput, setShowAddColInput] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<"number" | "string" | "time">("number");

  // The database's real (auto-generated) id for whichever daily-stats record is currently loaded,
  // if one already exists for this league+period. Undefined means "no existing record" - saving
  // must then INSERT and let the database assign an id, never invent one client-side (the matches
  // table's id column is a bigint identity column, so it can't accept an arbitrary string id).
  const [existingRecordId, setExistingRecordId] = useState<string | undefined>(undefined);

  // Load existing daily stats match record if it exists
  const loadExistingDailyStats = React.useCallback(() => {
    const periodKey = statsMode === "week" ? selectedWeek : statsMode === "tournament" ? "TOURNAMENT" : selectedDate;
    if (!selectedLeague || !periodKey) {
      setFlatPlayers([]);
      setExistingRecordId(undefined);
      return;
    }

    const foundDailyMatch = dailyStats.find(m => {
      if ((m.league || "").toLowerCase().trim() !== selectedLeague.toLowerCase().trim()) {
        return false;
      }
      if (statsMode === "week") return m.matchCode === dailyWeekMatchCode(selectedWeek);
      if (statsMode === "tournament") return m.matchCode === "DAILY_TOURNAMENT";
      return m.date === selectedDate;
    });

    setExistingRecordId(foundDailyMatch?.id);

    if (foundDailyMatch) {
      // Load custom columns config from the match record if it exists. Older records saved before
      // customColumns existed have none - reconstruct the columns from their actual player data
      // instead of a fixed list, so entered stats (e.g. Assists) aren't hidden or later wiped out.
      const loadedCols: ColumnConfig[] = foundDailyMatch.customColumns || reconstructColumnsFromMatch(foundDailyMatch);
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
      setStatusMsg({ type: "success", text: "Successfully loaded saved daily stats data!" });
    } else {
      // No existing record for this period yet - inherit the most recently used column set from
      // another period already recorded for this league, if any, instead of always resetting to
      // the bare defaults. Otherwise every new day/week means re-adding the same custom columns
      // (e.g. Assist, Survival Time) from scratch, one period at a time.
      const leagueRecordsWithColumns = dailyStats.filter(m =>
        (m.league || "").toLowerCase().trim() === selectedLeague.toLowerCase().trim() && m.customColumns && m.customColumns.length > 0
      );
      const mostRecent = [...leagueRecordsWithColumns].sort((a, b) =>
        (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "")
      )[0];

      const defaultCols: ColumnConfig[] = mostRecent?.customColumns || [
        { key: "name", label: "Player", type: "string" },
        { key: "team", label: "Team", type: "string" },
        { key: "matchesPlayed", label: "Matches", type: "number" },
        { key: "elims", label: "Kills", type: "number" },
        { key: "damage", label: "Damage", type: "number" },
      ];
      setColumns(defaultCols);

      // Start with 1 blank row, zeroed/emptied out to match whichever columns were just inherited
      const blankStats: Record<string, any> = {};
      defaultCols.forEach(col => {
        if (col.key !== "name" && col.key !== "team") blankStats[col.key] = col.type === "number" ? 0 : "";
      });
      const initialPlayers: DailyPlayer[] = [{ name: "", team: "", stats: blankStats }];

      setFlatPlayers(initialPlayers);
      setStatusMsg(null);
    }
  }, [selectedLeague, selectedDate, selectedWeek, statsMode, dailyStats]);

  // Load whenever selected league, day/week mode, or the chosen period changes
  useEffect(() => {
    loadExistingDailyStats();
  }, [selectedLeague, selectedDate, selectedWeek, statsMode, dailyStats.length]);

  // Add Dynamic Column via Custom Inline Form
  const submitAddColumn = () => {
    const trimmed = newColName.trim();
    if (!trimmed) return;

    // Check duplicate
    const exists = columns.some(col => col.label.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      alert("A column with that name already exists!");
      return;
    }

    const key = slugifyColumnLabel(trimmed);
    setColumns(prev => [
      ...prev,
      { key, label: trimmed, type: newColType }
    ]);

    // Update stats dictionary on existing player rows
    setFlatPlayers(prev => prev.map(p => ({
      ...p,
      stats: {
        ...p.stats,
        [key]: newColType === "number" ? 0 : ""
      }
    })));

    setShowAddColInput(false);
    setNewColName("");
    setNewColType("number");
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

  // Change an already-created column's type (e.g. a Survival Time column added back when only
  // Number/Text existed, reclassified to Time now that it's a real option) - the stored text values
  // themselves don't need to change, only how they're subsequently input/aggregated.
  const handleChangeColumnType = (key: string, type: ColumnConfig["type"]) => {
    setColumns(prev => prev.map(col => (col.key === key ? { ...col, type } : col)));
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
    setFlatPlayers(prev => [...prev, makeBlankPlayerRow()]);
  };

  // Delete Player row (confirm-free to avoid iframe blocks)
  const handleDeletePlayerRow = (idx: number) => {
    setFlatPlayers(prev => prev.filter((_, i) => i !== idx));
  };

  // Update specific cell values. Typing/selecting a name that uniquely matches one roster player
  // also auto-fills that row's Team, so it doesn't need typing a second time.
  const handleUpdatePlayerCell = (idx: number, field: "name" | "team", value: string) => {
    setFlatPlayers(prev => {
      const next = [...prev];
      const updated = { ...next[idx], [field]: value };
      if (field === "name") {
        const matchedTeam = nameToTeamMap[value.trim().toLowerCase()];
        if (matchedTeam) updated.team = matchedTeam;
      }
      next[idx] = updated;
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

  const makeBlankPlayerRow = (): DailyPlayer => {
    const blank: DailyPlayer = { name: "", team: "", stats: {} };
    columns.forEach(col => {
      if (col.key !== "name" && col.key !== "team") blank.stats[col.key] = col.type === "number" ? 0 : "";
    });
    return blank;
  };

  // Paste rows/columns copied from a spreadsheet (Excel/Google Sheets) directly into the grid,
  // starting at the cell the user pasted into. Rows are tab/newline separated like any
  // spreadsheet clipboard payload. Single-cell pastes are left to the browser's default behavior.
  const handlePasteGrid = (e: React.ClipboardEvent, startRowIdx: number, startColKey: string) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (rows.length > 1 && rows[rows.length - 1] === "") rows.pop();
    const grid = rows.map(r => r.split("\t"));

    if (grid.length === 1 && grid[0].length === 1) {
      return; // Single value - let the input handle the paste natively
    }

    e.preventDefault();

    const startColIdx = columns.findIndex(col => col.key === startColKey);
    if (startColIdx === -1) return;

    setFlatPlayers(prev => {
      const next = [...prev];

      grid.forEach((rowCells, rOffset) => {
        const targetRowIdx = startRowIdx + rOffset;
        while (next.length <= targetRowIdx) {
          next.push(makeBlankPlayerRow());
        }

        const targetRow = { ...next[targetRowIdx], stats: { ...next[targetRowIdx].stats } };

        rowCells.forEach((rawValue, cOffset) => {
          const targetColIdx = startColIdx + cOffset;
          if (targetColIdx >= columns.length) return;
          const targetCol = columns[targetColIdx];
          const value = rawValue.trim();

          if (targetCol.key === "name") {
            targetRow.name = value;
            const matchedTeam = nameToTeamMap[value.trim().toLowerCase()];
            if (matchedTeam) targetRow.team = matchedTeam;
          } else if (targetCol.key === "team") {
            targetRow.team = value;
          } else if (targetCol.type !== "number") {
            targetRow.stats[targetCol.key] = value;
          } else {
            targetRow.stats[targetCol.key] = Number(value) || 0;
          }
        });

        next[targetRowIdx] = targetRow;
      });

      return next;
    });
  };

  // Save All flat players to Firestore as grouped team objects
  const handleSaveAllDailyStats = async () => {
    const finalLeagueName = selectedLeague.trim();
    if (!finalLeagueName) {
      alert("Please select a tournament!");
      return;
    }
    if (statsMode === "week" ? !selectedWeek : statsMode === "day" ? !selectedDate : false) {
      alert(statsMode === "week" ? "Please select a week!" : "Please select a date!");
      return;
    }

    // Every player name entered here must exist in the Squad Roster for this league - stats are
    // meaningless (and can't be cross-referenced) for a name that isn't a registered roster player.
    const invalidNames = Array.from(new Set(
      flatPlayers
        .map(p => p.name.trim())
        .filter(name => name && !rosterNamesForLeague.has(name.toLowerCase()))
    ));
    if (invalidNames.length > 0) {
      setStatusMsg({
        type: "error",
        text: `The following player names were not found in the Squad Roster for "${finalLeagueName}": ${invalidNames.join(", ")}. Add or fix these player names in the Squad Roster menu before saving.`
      });
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);

    try {
      // 1. Group the flat list of players by their team value - skipping any row nobody typed a
      // name into. The invalidNames check above only rejects a NON-empty unregistered name, so a
      // still-blank row (e.g. the single default row this form always starts a fresh period with,
      // or an "Add Player" row added and then left empty) would otherwise get saved as a real
      // player with an empty name, polluting Player Stats/Comparisons with a ghost entry.
      const playersByTeam: Record<string, DailyPlayer[]> = {};
      flatPlayers.filter(p => p.name.trim().length > 0).forEach(p => {
        const tName = canonicalizeTeam((p.team || "Independent").trim());
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
            name: canonicalizePlayer(p.name.trim(), teamName),
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

      // 3. Create the daily stats record. Only set id when updating an already-loaded record
      // (a real database id) - leave it unset for a first-time save so the database assigns one.
      const dailyStatsRecord: DailyStatsEntry = {
        id: existingRecordId,
        league: finalLeagueName,
        date: statsMode === "week" ? selectedWeek : statsMode === "tournament" ? "Sepanjang Turnamen" : selectedDate,
        matchCode: statsMode === "week" ? dailyWeekMatchCode(selectedWeek) : statsMode === "tournament" ? "DAILY_TOURNAMENT" : ("DAILY_" + selectedDate.replace(/-/g, "")),
        teams: savedTeams,
        customColumns: columns
      };

      await onSaveDailyStats(dailyStatsRecord);

      setStatusMsg({
        type: "success",
        text: `All daily player stats saved successfully!`
      });
    } catch (err: any) {
      setStatusMsg({ type: "error", text: "Failed to save stats: " + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDeleteRecord = async () => {
    if (!existingRecordId || !onDeleteDailyStats) return;
    setIsDeletingRecord(true);
    try {
      await onDeleteDailyStats(existingRecordId);
      setDeleteRecordConfirmOpen(false);
      // dailyStats prop refreshing afterward re-runs loadExistingDailyStats, which finds no record
      // for this period anymore and resets the form to blank on its own - nothing to clear here.
    } catch (err: any) {
      setStatusMsg({ type: "error", text: "Failed to delete the record: " + err.message });
    } finally {
      setIsDeletingRecord(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-mono">
      <datalist id="pip-roster-names">
        {rosterNameOptions.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="pip-team-names">
        {teamListForLeague.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* HEADER SECTION */}
      <div className={`p-6 rounded-2xl shadow-xl transition-all ${isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200"}`}>
        <div className="border-b pb-4 border-slate-800">
          <h2 className={`text-lg font-bold font-display uppercase tracking-tight ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
            ADD NEW PLAYER DATA
          </h2>
        </div>
      </div>

      {/* SELECTION FLOW CARD */}
      <div className={`p-5 rounded-2xl space-y-4 transition-all ${
        isDarkMode ? "bg-slate-900/40" : "bg-white border border-slate-200 shadow-sm"
      }`}>
        <h3 className="text-xs font-extrabold uppercase text-amber-500 flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Select tournament
        </h3>

        {leagues.length === 0 ? (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 text-xs">
            ⚠️ <strong>Notice:</strong> No match data has been imported yet. Please import a Match Log first in the <strong>"Import Match Log"</strong> tab so tournaments and dates can be synced automatically.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* League Select */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">1. Select League / Tournament:</label>
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                className={`w-full rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              >
                <option value="">-- Select League / Tournament --</option>
                {leagues.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Date/Week Dropdown strictly from match logs */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] text-slate-400 font-bold uppercase block">
                  2. {statsMode === "tournament" ? "Sepanjang Turnamen" : `Select Match ${statsMode === "week" ? "Week" : "Date"}:`}
                </label>
                {[dayStatsEnabled, weekStatsEnabled, tournamentStatsEnabled].filter(Boolean).length > 1 && (
                  <div className="flex gap-1 shrink-0">
                    {dayStatsEnabled && (
                      <button
                        type="button"
                        onClick={() => setStatsMode("day")}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase cursor-pointer transition-all ${
                          statsMode === "day" ? "bg-amber-500 text-slate-950" : "bg-slate-850 text-slate-400"
                        }`}
                      >
                        Per Day
                      </button>
                    )}
                    {weekStatsEnabled && (
                      <button
                        type="button"
                        onClick={() => setStatsMode("week")}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase cursor-pointer transition-all ${
                          statsMode === "week" ? "bg-amber-500 text-slate-950" : "bg-slate-850 text-slate-400"
                        }`}
                      >
                        Per Week
                      </button>
                    )}
                    {tournamentStatsEnabled && (
                      <button
                        type="button"
                        onClick={() => setStatsMode("tournament")}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase cursor-pointer transition-all ${
                          statsMode === "tournament" ? "bg-amber-500 text-slate-950" : "bg-slate-850 text-slate-400"
                        }`}
                      >
                        Sepanjang Turnamen
                      </button>
                    )}
                  </div>
                )}
              </div>
              {statsMode === "tournament" ? (
                <div className="p-2.5 bg-slate-950/20 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs italic">
                  Data akan disimpan sebagai satu rekap total untuk seluruh turnamen ini, tanpa dipecah per hari/minggu.
                </div>
              ) : statsMode === "week" ? (
                availableWeeks.length > 0 ? (
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className={`w-full rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                    }`}
                  >
                    <option value="">-- Select Existing Week --</option>
                    {availableWeeks.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2.5 bg-slate-950/20 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs italic">
                    {selectedLeague ? "No Week detected (matchCode doesn't contain a Week yet) for this tournament." : "Please select a tournament first."}
                  </div>
                )
              ) : availableDates.length > 0 ? (
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className={`w-full rounded-lg p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                >
                  <option value="">-- Select Existing Date --</option>
                  {availableDates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              ) : (
                <div className="p-2.5 bg-slate-950/20 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs italic">
                  {selectedLeague ? "No match dates found for this tournament in the Match Log." : "Please select a tournament first."}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Player Stats Granularity - lives here since it's specifically about how this
            tournament's player stats are sourced (some organizers only publish weekly, never daily) */}
        {selectedTournamentPreset && (
          <div className={`p-3.5 rounded-xl border space-y-2 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Player Stats Data Source For This Tournament:</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dayStatsEnabled}
                  onChange={(e) => handleTogglePlayerStatsGranularity("playerStatsDayEnabled", e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                />
                <span className="text-[10px] font-mono font-bold text-slate-300 uppercase">Per Day</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={weekStatsEnabled}
                  onChange={(e) => handleTogglePlayerStatsGranularity("playerStatsWeekEnabled", e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                />
                <span className="text-[10px] font-mono font-bold text-slate-300 uppercase">Per Week</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tournamentStatsEnabled}
                  onChange={(e) => handleTogglePlayerStatsGranularity("playerStatsTournamentEnabled", e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                />
                <span className="text-[10px] font-mono font-bold text-slate-300 uppercase">Sepanjang Turnamen</span>
              </label>
            </div>
            <p className="text-[9px] text-slate-500 normal-case">Enable Per Day and/or Per Week for data with clean date/week granularity. Enable "Sepanjang Turnamen" for old/legacy data that should just be recorded as one total for the whole tournament.</p>
          </div>
        )}
      </div>

      {/* SPREADSHEET */}
      {selectedLeague && (statsMode === "week" ? selectedWeek : statsMode === "tournament" ? true : selectedDate) && (
        <div className="space-y-4">
          <div className={`p-5 rounded-2xl space-y-5 border transition-all ${
            isDarkMode ? "bg-slate-950 border-slate-850" : "bg-white border-slate-200 shadow-sm"
          }`}>
            
            {/* Spreadsheet Header Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <span className="text-xs font-extrabold uppercase text-amber-500 flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Player Input Spreadsheet ({flatPlayers.length} Players)
                </span>
                <p className="text-[9px] text-slate-500 italic mt-1 normal-case">
                  Tip: you can copy multiple cells/rows directly from Excel or Google Sheets, then paste into any cell in this table.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {showAddColInput ? (
                  <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800 animate-fadeIn">
                    <input
                      type="text"
                      placeholder="Column name..."
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
                    {/* Number columns only accept digits. Time columns accept "MM:SS" (or "H:MM:SS")
                        and get summed as seconds in Player Stats. Text accepts anything but is
                        never aggregated - browsers block symbols like ":" in a number input, which
                        is why Survival Time needs its own Time type instead of Number. */}
                    <div className="flex items-center rounded-lg border border-slate-800 overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => setNewColType("number")}
                        title="Numbers only (e.g. Kills, Damage)"
                        className={`px-2 py-1 text-[9px] font-bold uppercase cursor-pointer transition-all ${
                          newColType === "number" ? "bg-amber-500 text-slate-950" : "bg-slate-950 text-slate-400 hover:text-white"
                        }`}
                      >
                        123
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewColType("time")}
                        title="Time as MM:SS (e.g. Survival Time) - summed as seconds in Player Stats"
                        className={`px-2 py-1 text-[9px] font-bold uppercase cursor-pointer transition-all ${
                          newColType === "time" ? "bg-amber-500 text-slate-950" : "bg-slate-950 text-slate-400 hover:text-white"
                        }`}
                      >
                        MM:SS
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewColType("string")}
                        title="Any other text - not aggregated in Player Stats"
                        className={`px-2 py-1 text-[9px] font-bold uppercase cursor-pointer transition-all ${
                          newColType === "string" ? "bg-amber-500 text-slate-950" : "bg-slate-950 text-slate-400 hover:text-white"
                        }`}
                      >
                        Abc
                      </button>
                    </div>
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
                        setNewColType("number");
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-[9px] rounded-lg uppercase cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddColInput(true)}
                    className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-amber-500 font-bold text-[10px] rounded-lg transition-all flex items-center gap-1 cursor-pointer border border-amber-500/10"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Column</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddPlayerRow}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Player</span>
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
                            placeholder="Category..."
                          />
                          {col.key !== "name" && col.key !== "team" && (
                            <>
                              <select
                                value={col.type}
                                onChange={(e) => handleChangeColumnType(col.key, e.target.value as ColumnConfig["type"])}
                                title="Column type - Time (MM:SS) is summed as seconds in Player Stats, Text is never aggregated"
                                className={`text-[8px] font-bold uppercase rounded px-1 py-0.5 cursor-pointer border-none focus:outline-none ${isDarkMode ? "bg-slate-950 text-slate-400" : "bg-slate-100 text-slate-500"}`}
                              >
                                <option value="number">123</option>
                                <option value="time">MM:SS</option>
                                <option value="string">Abc</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleDeleteColumn(col.key)}
                                className="text-[8px] text-red-400/60 hover:text-red-400 uppercase tracking-tighter"
                                title="Delete Column"
                              >
                                [Delete]
                              </button>
                            </>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="py-2.5 px-3 w-16 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/20">
                  {flatPlayers.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 2} className="py-8 text-center text-slate-500 italic">
                        No player data yet. Click "Add Player" to get started.
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
                                  onPaste={(e) => handlePasteGrid(e, idx, "name")}
                                  placeholder="Player..."
                                  list="pip-roster-names"
                                  title={p.name.trim() && !rosterNamesForLeague.has(p.name.trim().toLowerCase()) ? "This name was not found in the Squad Roster for this league" : undefined}
                                  className={`w-full rounded p-1 text-xs font-bold border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                    p.name.trim() && !rosterNamesForLeague.has(p.name.trim().toLowerCase())
                                      ? "border-red-500/60 bg-red-950/10 text-red-400"
                                      : isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
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
                                  onPaste={(e) => handlePasteGrid(e, idx, "team")}
                                  placeholder="Team..."
                                  list="pip-team-names"
                                  title="Abbreviations are auto-corrected to the full team name on save"
                                  className={`w-full rounded p-1 text-xs font-bold border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                    isDarkMode ? "bg-slate-900 border-slate-800 text-teal-400" : "bg-slate-50 border-slate-200 text-teal-600"
                                  }`}
                                />
                              </td>
                            );
                          } else if (col.type !== "number") {
                            return (
                              <td key={col.key} className="py-1 px-1.5">
                                <input
                                  type="text"
                                  value={p.stats[col.key] !== undefined ? p.stats[col.key] : ""}
                                  onChange={(e) => handleUpdatePlayerStatCell(idx, col.key, e.target.value)}
                                  onPaste={(e) => handlePasteGrid(e, idx, col.key)}
                                  placeholder={col.type === "time" ? "e.g. 18:24" : ""}
                                  className={`w-full rounded p-1 text-xs text-center font-semibold border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                    isDarkMode ? "bg-slate-900 border-slate-800 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-800"
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
                                  onPaste={(e) => handlePasteGrid(e, idx, col.key)}
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
                            title="Delete Player"
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
              {existingRecordId && onDeleteDailyStats && (
                <button
                  type="button"
                  onClick={() => setDeleteRecordConfirmOpen(true)}
                  title="Permanently deletes this whole day/week/tournament record - every player in it"
                  className={`px-4 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    isDarkMode ? "bg-red-950/20 hover:bg-red-900/30 text-red-400 border-red-900/30" : "bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete This Record</span>
                </button>
              )}
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
                <span>{isSaving ? "Saving data..." : "Save All Daily Stats"}</span>
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

      {/* DELETE RECORD CONFIRMATION MODAL */}
      {deleteRecordConfirmOpen && (
        <div className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[110] p-4 transition-colors duration-200 ${isDarkMode ? "bg-slate-950/80" : "bg-slate-900/40"}`}>
          <div className={`w-full max-w-sm border rounded-2xl shadow-2xl overflow-hidden animate-fadeIn transition-colors duration-200 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 text-slate-800"}`}>
            <div className="bg-red-600 p-5 text-white flex flex-col items-center">
              <div className={`p-2.5 rounded-full mb-2 ${isDarkMode ? "bg-slate-950 text-red-500" : "bg-white/40 text-red-600"}`}>
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-center uppercase">
                Confirm Deletion
              </h3>
              <p className="text-[9px] tracking-wider mt-0.5 opacity-90 text-center uppercase">
                This action cannot be undone!
              </p>
            </div>

            <div className="p-6 space-y-4 text-xs text-center">
              <p className={`${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                Delete this entire record ({flatPlayers.length} player{flatPlayers.length === 1 ? "" : "s"}) permanently from the database?
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteRecordConfirmOpen(false)}
                  disabled={isDeletingRecord}
                  className={`flex-1 border rounded-lg py-2 font-bold cursor-pointer transition-all text-center ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 border-slate-200"}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteRecord}
                  disabled={isDeletingRecord}
                  className="flex-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg py-2 font-bold cursor-pointer transition-all flex items-center justify-center gap-1 shadow-lg shadow-red-600/10 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeletingRecord ? "Deleting..." : "Yes, Delete"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
