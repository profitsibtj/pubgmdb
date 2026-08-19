import React, { useState, useMemo } from "react";
import { Match, Team, DailyStatsEntry, ScheduleEntry } from "../types";
import { calculatePlacementPoints, calculateLeagueRankStandings, calculateStageStandingsOrder, shuffleArray, getTournamentTeamList, canonicalizeTeamName, canonicalCustomKey, looksLikeTimeValue, gmt7ToIso, isoToGmt7Parts } from "../utils";
import {
  Plus, Trash2, RefreshCw, AlertTriangle, Save, GripVertical, Layers,
  ChevronUp, ChevronDown, X, Crown, CalendarClock
} from "lucide-react";

interface AddMatchFormProps {
  onSave: (match: Match) => Promise<void>;
  onClose: () => void;
  isDarkMode: boolean;
  editingMatch?: Match | null;
  matches?: Match[];
  // Player Input Panel's entries - only needed here to know which stats are actually tracked per
  // league, for the MVP Score Formula aspect picker below.
  dailyStats?: DailyStatsEntry[];
  tournaments?: any[];
  onUpdateTournaments?: (updatedTournaments: any[]) => void;
  // Deep-link from a Match Schedule entry ("Enter Match Result") so the league, map, date, time,
  // title and (when the schedule entry specified one) game number don't have to be retyped here
  // after already being entered once in the schedule.
  matchPrefill?: { league?: string; map?: string; date?: string; time?: string; matchCode?: string; gameNo?: string; isGrandFinal?: boolean; isSurvivalStage?: boolean; isLastChanceQualifier?: boolean } | null;
  onConsumedMatchPrefill?: () => void;
  // Lets a brand-new match be saved as a not-yet-played Schedule entry instead of a full result,
  // from this same form - one place to add a match either way, instead of a separate screen.
  onSaveSchedule?: (schedule: ScheduleEntry) => Promise<void>;
  // Deep-link from a Match Schedule entry's "Edit" action - reopens this same not-yet-played entry
  // here (in schedule-only mode, locked) instead of Match Schedule's own separate edit screen, so
  // there's only ever one place to create or edit a scheduled match. Stays set for the whole
  // editing session (mirrors editingMatch) - the caller clears it via onClose. Saving updates this
  // same entry (by id) instead of creating a duplicate.
  editingSchedule?: ScheduleEntry | null;
  // "Back" button behavior - separate from onClose (which also fires after a successful save, and
  // for this form's other host, the Edit Match modal, just closes the popup). Falls back to
  // onClose when not given, so callers that don't need the distinction can skip it.
  onCancel?: () => void;
}

export const AddMatchForm: React.FC<AddMatchFormProps> = ({
  onSave,
  onClose,
  onCancel,
  isDarkMode,
  editingMatch,
  matches = [],
  dailyStats = [],
  tournaments: passedTournaments,
  onUpdateTournaments,
  matchPrefill,
  onConsumedMatchPrefill,
  onSaveSchedule,
  editingSchedule
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [scheduleTeamsInput, setScheduleTeamsInput] = useState("");
  // Set once a brand-new entry has been deep-linked from a Schedule's "Enter Match Result" button
  // (matchPrefill) - keeps this form in full-result mode from then on, overriding the date/time
  // auto-detection below, since that action always means "enter the real result now" regardless
  // of whether the scheduled time has technically passed yet.
  const [forceFullResultMode, setForceFullResultMode] = useState(false);

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
    time: "",
    matchCode: "",
    league: "PMSL SEA 2026",
    totalGame: "1",
    gameNo: "1",
    map: "Erangel",
    liveLink: ""
  });

  // Auto-detects "hasn't happened yet" straight from the Date/Time fields instead of a separate
  // manual toggle - a match dated/timed in the future is always a schedule entry, so there's only
  // one thing to fill in instead of a field plus a checkbox that could disagree with it. No Time
  // filled in falls back to comparing Date alone, so "today" without a time defaults to a real
  // result (the common case: entering today's match after it's already been played).
  const isFutureSchedule = (): boolean => {
    if (!meta.date) return false;
    if (meta.time) {
      const dt = new Date(`${meta.date}T${meta.time}`);
      if (!Number.isNaN(dt.getTime())) return dt.getTime() > Date.now();
    }
    return meta.date > getTodayDateString();
  };

  // Deep-linking in from "Enter Match Result" (forceFullResultMode) or editing an already-saved
  // match (editingMatch) always overrides the auto-detection above; editing an existing schedule
  // entry (editingSchedule) always forces it on, regardless of what its date/time say. Starts
  // correct immediately for editingSchedule so there's no flash of the wrong form on mount.
  const [isScheduleOnly, setIsScheduleOnly] = useState(() => !!editingSchedule);

  // Applies the mode above, debounced for the plain auto-detect case: typing a Time fires onChange
  // more than once as the browser's HH/MM segments fill in (e.g. a transient "21:02" on the way to
  // "21:20"), and switching which form is rendered mid-keystroke unmounts the focused input,
  // stealing/misdirecting whatever's still being typed. Waiting for a short pause in typing avoids
  // that; the forced cases below don't need to wait since they're not driven by fast typing.
  React.useEffect(() => {
    if (editingMatch) {
      setIsScheduleOnly(false);
      return;
    }
    if (editingSchedule) {
      setIsScheduleOnly(true);
      return;
    }
    if (forceFullResultMode || !onSaveSchedule) {
      setIsScheduleOnly(false);
      return;
    }
    const timeout = setTimeout(() => setIsScheduleOnly(isFutureSchedule()), 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.date, meta.time, editingMatch, editingSchedule, forceFullResultMode, onSaveSchedule]);

  // Marks this match as part of the Grand Final stage, kept separate from the
  // overall/regular-season standings for the same league in Standings.
  const [isGrandFinal, setIsGrandFinal] = useState(false);

  // Marks this match as part of the Survival Stage - a separate, fresh-points stage some
  // tournaments run between Group Stage and Grand Final, also kept out of the overall/
  // regular-season standings.
  const [isSurvivalStage, setIsSurvivalStage] = useState(false);

  // Marks this match as part of the Last Chance Qualifier - a separate, fresh-points stage
  // feeding a limited number of teams into the main event, also kept out of the overall/
  // regular-season standings.
  const [isLastChanceQualifier, setIsLastChanceQualifier] = useState(false);

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
    // Manual "this is the current/featured tournament" flag, set by an admin (not date-based) -
    // used to auto-select and badge this league across Match Standings, Player Stats, Squad
    // Roster, Comparisons, and Drop Zone Simulator. Match Results is intentionally excluded.
    highlighted?: boolean;
    // Opt-in per tournament: shows the "Filter Group" control on Match Standings, splitting the
    // table by Group A/B/C/etc instead of always one combined table. Off by default even for a
    // format with groups configured (20/24/32), since Group A-E's team lists here are only
    // reliably filled in for tournaments where an admin has actually maintained them - for others,
    // a stale/incomplete group roster would surface a filter that misleadingly shows only 1-2
    // teams in a group instead of the real full lineup.
    groupStandingsEnabled?: boolean;
    // How many top teams advance out of the Survival Stage - varies per tournament, and doesn't
    // necessarily mean straight to Grand Final (some formats route a lower slice through the Last
    // Chance Qualifier instead - e.g. top 6 of 16 go direct to Grand Final, the rest to LCQ). Only
    // used to highlight the advancing teams in Standings; undefined just skips that highlight.
    survivalStageAdvanceCount?: number;
    // Same idea for the Last Chance Qualifier - how many top teams advance into Grand Final from there.
    lastChanceQualifierAdvanceCount?: number;
    // Each of these three later stages gets its own free-form team list (one name per line, no
    // fixed count) instead of sharing Group Stage's teams16Text/format-driven groups below - their
    // team counts differ from Group Stage and from each other, and change as the bracket plays out,
    // so reusing one shared list would mean overwriting one stage's roster to enter another's.
    grandFinalTeamsText?: string;
    survivalStageTeamsText?: string;
    lastChanceQualifierTeamsText?: string;
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
    // How "Fill Bonus from League Points" derives each team's Grand Final bonus from their overall
    // regular-season standing (index i in that sorted standing = rank i+1). "leaguePoints" (default,
    // matches every preset's behavior before this setting existed) uses the team's accumulated
    // League Points total as-is. "rankTable" instead looks up a separate, independently-set bonus
    // value for that rank from finalBonusPointsTable - some tournaments publish a fixed bonus per
    // final standing (e.g. "Overall Rank 1 = 10 bonus") that isn't the same number as their League
    // Points total.
    finalBonusMode?: "leaguePoints" | "rankTable";
    finalBonusPointsTable?: number[];
    // Smash Rule: an alternative Grand Final win condition (used by e.g. PMWC/PMGC), distinct from
    // the plain "highest total after every scheduled game" default - opt-in per tournament since
    // most leagues don't use it. Once smashRuleLockAfterGame games are in, the then-current leader's
    // total + smashRuleBonus becomes the "Match Point" target; any team whose total reaches that
    // target is "Match Point Eligible", and the tournament ends the moment an eligible team gets a
    // WWCD. smashRuleTotalGames (optional) is the full schedule's game count, used only to fall
    // back to crowning the plain points leader if nobody ever smashes.
    smashRuleEnabled?: boolean;
    smashRuleLockAfterGame?: number;
    smashRuleBonus?: number;
    smashRuleTotalGames?: number;
    // Player Stats' MVP Score column: a weighted sum of "this player's share of the league's total
    // for a stat" per aspect below. Only stats actually tracked via Player Input Panel for this
    // league can be picked (see numericStatOptions). Admin-only to configure, since only admins can
    // enter the underlying data anyway - Player Stats itself only reads this, never edits it.
    mvpFormula?: { key: string; label: string; weight: number }[];
    // Registered team ABBR -> full team name (set in Squad Roster), used to auto-correct an
    // abbreviation typed for a Schedule entry's teams back to the full registered name.
    teamAbbreviations?: Record<string, string>;
    // Not every tournament tracks player stats at both granularities - each is independently opt-in.
    // Missing/undefined defaults to day-only (matches pre-existing behavior for older presets).
    playerStatsDayEnabled?: boolean;
    playerStatsWeekEnabled?: boolean;
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

  // Keep selectedTournamentId in sync if it's not found in the current tournament list - and the
  // first time a highlighted tournament becomes available (the real tournaments list can arrive
  // async from the server after this form's own local/default state is set up), prefer it over
  // tournaments[0] so this form defaults to the admin's manually-marked current tournament
  // instead of whichever preset just happens to be first. Runs before the "editing prefill" effect
  // below, so opening this form to edit an existing match still overrides this with that match's
  // own league.
  const hasAppliedHighlightDefault = React.useRef(false);
  React.useEffect(() => {
    if (tournaments.length === 0) return;
    const highlighted = tournaments.find(t => t.highlighted);
    if (!hasAppliedHighlightDefault.current && highlighted) {
      hasAppliedHighlightDefault.current = true;
      setSelectedTournamentId(highlighted.id);
      return;
    }
    if (!tournaments.some(t => t.id === selectedTournamentId)) {
      setSelectedTournamentId(tournaments[0].id);
    }
  }, [tournaments]);

  // Consume a one-time prefill deep-linked from a Match Schedule entry: pick the matching
  // tournament (which drives the auto-populated team list) and seed the remaining meta fields.
  // Older schedule entries (saved before Game/Match No existed there) carry no game number - Game/
  // Match No is then left to auto-increment below instead of always landing on the field's default
  // "1", which otherwise silently saves every game of the day as "Game 1" unless manually
  // corrected each time.
  React.useEffect(() => {
    if (!matchPrefill) return;
    setForceFullResultMode(true);
    if (matchPrefill.league) {
      const matched = tournaments.find(t => t.name === matchPrefill.league);
      if (matched) setSelectedTournamentId(matched.id);
    }
    // Carries the stage the schedule entry was created under (Group/Survival/LCQ/Grand Final) into
    // the full result form, instead of always resetting to Group Stage - which also used to mean
    // the wrong team list (Group Stage's) got auto-populated for a Grand Final/Survival Stage/LCQ
    // schedule entry the moment "Enter Match Result" was clicked.
    setIsGrandFinal(!!matchPrefill.isGrandFinal);
    setIsSurvivalStage(!!matchPrefill.isSurvivalStage);
    setIsLastChanceQualifier(!!matchPrefill.isLastChanceQualifier);
    // Normalized league comparison (trim + case-insensitive) - an exact `===` here could undercount
    // how many games this day already has (whenever the schedule entry's league string differed by
    // stray whitespace/casing from the matches already saved for it), suggesting a Game/Match No
    // that collides with an already-used one instead of the real next number. Two real matches
    // sharing the same (date, Game/Match No) then silently collapse into one "game" everywhere that
    // counts distinct Grand Final games (e.g. Smash Rule's total games played).
    const existingGamesForDay = matchPrefill.league && matchPrefill.date
      ? matches.filter(m => !m.isDailyStats && (m.league || "").trim().toLowerCase() === matchPrefill.league!.trim().toLowerCase() && m.date === matchPrefill.date).length
      : 0;
    const nextGameNo = matchPrefill.gameNo || String(existingGamesForDay + 1);
    setMeta(prev => ({
      ...prev,
      ...(matchPrefill.map ? { map: matchPrefill.map } : {}),
      ...(matchPrefill.date ? { date: matchPrefill.date } : {}),
      ...(matchPrefill.time ? { time: matchPrefill.time } : {}),
      ...(matchPrefill.matchCode ? { matchCode: matchPrefill.matchCode } : {}),
      gameNo: nextGameNo,
      totalGame: nextGameNo
    }));
    if (onConsumedMatchPrefill) onConsumedMatchPrefill();
  }, [matchPrefill]);

  // Deep-link from a Match Schedule entry's "Edit" action: load that entry's own data into the
  // schedule-only fields (locked into schedule mode below) instead of Match Schedule's own
  // separate edit form, so there's one place to create or edit a not-yet-played match. Stays
  // applied for as long as editingSchedule is set (the parent clears it via onClose) - guarded by
  // id here so it doesn't re-stomp in-progress edits if the parent's schedules list happens to
  // re-render with a new object for the same entry.
  const prevEditingScheduleIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = editingSchedule?.id || null;
    if (!editingSchedule || prevEditingScheduleIdRef.current === id) return;
    prevEditingScheduleIdRef.current = id;
    if (editingSchedule.league) {
      const matched = tournaments.find(t => t.name === editingSchedule.league);
      if (matched) setSelectedTournamentId(matched.id);
    }
    setIsGrandFinal(!!editingSchedule.isGrandFinal);
    setIsSurvivalStage(!!editingSchedule.isSurvivalStage);
    setIsLastChanceQualifier(!!editingSchedule.isLastChanceQualifier);
    const gmt7Parts = isoToGmt7Parts(editingSchedule.scheduledAt);
    setMeta(prev => ({
      ...prev,
      matchCode: editingSchedule.matchCode || "",
      gameNo: editingSchedule.gameNo || "1",
      totalGame: editingSchedule.gameNo || "1",
      ...(gmt7Parts ? { date: gmt7Parts.date } : {}),
      time: gmt7Parts?.time || "",
      ...(editingSchedule.map ? { map: editingSchedule.map } : {}),
      liveLink: editingSchedule.liveLink || ""
    }));
    setScheduleTeamsInput((editingSchedule.teams || []).join("\n"));
  }, [editingSchedule, tournaments]);

  const activeWeek = activeTournament?.activeWeek || "1";

  // Each group's team list is duplicated per week (groupAText / _w2 / _w3) - this picks whichever
  // copy the given week points to.
  const getGroupTextForWeek = (tour: TournamentPreset, group: "A" | "B" | "C" | "D" | "E", week: string): string => {
    const suffix = week === "2" ? "_w2" : week === "3" ? "_w3" : "";
    return (tour as any)[`group${group}Text${suffix}`] || "";
  };

  const currentGroupAText = activeTournament ? getGroupTextForWeek(activeTournament, "A", activeWeek) : "";
  const currentGroupBText = activeTournament ? getGroupTextForWeek(activeTournament, "B", activeWeek) : "";
  const currentGroupCText = activeTournament ? getGroupTextForWeek(activeTournament, "C", activeWeek) : "";
  const currentGroupDText = activeTournament ? getGroupTextForWeek(activeTournament, "D", activeWeek) : "";
  const currentGroupEText = activeTournament ? getGroupTextForWeek(activeTournament, "E", activeWeek) : "";

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
      name: `New Tournament ${tournaments.length + 1}`,
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
    
    setSuccessMsg("New tournament created successfully!");
    setTimeout(() => setSuccessMsg(""), 2000);
  };

  const handleDeleteTournament = (idToDelete?: string) => {
    const targetId = idToDelete || selectedTournamentId;
    if (tournaments.length <= 1) {
      setErrorMsg("Failed to delete! At least 1 tournament must remain registered.");
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
    setSuccessMsg("Tournament deleted successfully!");
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

    const grpAText = getGroupTextForWeek(tour, "A", week);
    const grpBText = getGroupTextForWeek(tour, "B", week);
    const grpCText = getGroupTextForWeek(tour, "C", week);
    const grpDText = getGroupTextForWeek(tour, "D", week);
    const grpEText = getGroupTextForWeek(tour, "E", week);

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
        while (group.length < 16) group.push(`Group ${selectedGroup} Team ${group.length + 1}`);
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

  // Which team list feeds the "MODIFY LOBBY STANDINGS" grid depends on which stage is currently
  // checked (Grand Final / Survival Stage / Last Chance Qualifier all get their own free-form list,
  // set up in Tournament Settings, instead of reusing Group Stage's format-driven teams16Text/
  // groupA-E - their rosters differ in count and composition, so sharing one list would mean
  // overwriting one stage's roster to enter another's). Falls back to Group Stage's format-driven
  // list when none of those flags are checked.
  const getTeamsForCurrentStage = (tour: TournamentPreset): string[] => {
    const stageText = isGrandFinal ? tour.grandFinalTeamsText
      : isSurvivalStage ? tour.survivalStageTeamsText
      : isLastChanceQualifier ? tour.lastChanceQualifierTeamsText
      : undefined;
    if (stageText !== undefined) {
      return stageText.split("\n").map(t => t.trim()).filter(t => t.length > 0);
    }
    return getTeamsFromActiveTournament(tour, tour.format, tour.activeMatchup, tour.activeGroup || "A");
  };

  type StageTeamsField = "grandFinalTeamsText" | "survivalStageTeamsText" | "lastChanceQualifierTeamsText";

  // Every team name already typed anywhere in this tournament (Group Stage's roster, plus
  // whatever's already in Survival Stage/LCQ/Grand Final's own lists) - offered as autocomplete
  // suggestions when building each stage's team list below, so advancing teams can be picked
  // instead of retyped (and mistyped) from scratch. Still a free-text field underneath, since LCQ
  // in particular can include teams that never appeared in Group Stage at all.
  const knownTournamentTeams = useMemo(() => {
    if (!activeTournament) return [];
    const pool = new Set<string>();
    getTournamentTeamList(activeTournament).forEach(t => pool.add(t));
    ([activeTournament.survivalStageTeamsText, activeTournament.lastChanceQualifierTeamsText, activeTournament.grandFinalTeamsText] as (string | undefined)[])
      .forEach(text => (text || "").split("\n").map(t => t.trim()).filter(Boolean).forEach(t => pool.add(t)));
    return Array.from(pool).sort();
  }, [activeTournament]);

  // Stage team lists are stored the same way as before (one newline-joined string per stage) -
  // only the editing UI below changes, from a plain textarea to one autocomplete row per team.
  // Distinguishes "never touched" (undefined -> no rows) from "has rows, possibly a single blank
  // one" (any defined string, including "") - collapsing both to [] (as a plain `text.length > 0`
  // check used to) meant the very first "Add Team" click on a brand-new stage list produced a
  // 1-element array of "", which joins back to "" and then round-trips as zero rows again, so the
  // button looked completely broken until a second team already had a real name in the list.
  const getStageTeamRows = (field: StageTeamsField): string[] => {
    const text = activeTournament?.[field];
    return text === undefined ? [] : text.split("\n");
  };

  const handleStageTeamRowChange = (field: StageTeamsField, index: number, value: string) => {
    const rows = [...getStageTeamRows(field)];
    rows[index] = value;
    updateActiveTournament({ [field]: rows.join("\n") } as Partial<TournamentPreset>);
  };

  const handleAddStageTeamRow = (field: StageTeamsField) => {
    updateActiveTournament({ [field]: [...getStageTeamRows(field), ""].join("\n") } as Partial<TournamentPreset>);
  };

  const handleRemoveStageTeamRow = (field: StageTeamsField, index: number) => {
    const rows = getStageTeamRows(field).filter((_, i) => i !== index);
    // Back to undefined (not "") once the list is empty again, so it's correctly read as "no rows"
    // instead of "one blank row" on the next render.
    updateActiveTournament({ [field]: rows.length > 0 ? rows.join("\n") : undefined } as Partial<TournamentPreset>);
  };

  // Which teams from Survival Stage/LCQ are confirmed to advance can't be fixed programmatically
  // (it varies per tournament - straight to Grand Final, routed through LCQ first, or some split
  // of both), so the admin picks the destination by clicking one of these buttons. What CAN be
  // automated once that call is made: the actual team names (taken from that stage's own
  // standings, ranked the same way Tournament Standings does) don't need to be re-typed by hand,
  // and their seed order is intentionally shuffled rather than carried over, since Survival
  // Stage/LCQ rank isn't meant to leak into the next lobby's starting order. Already-listed teams
  // in the destination (case-insensitive) are left alone - this only appends the newly-advancing
  // ones.
  const handleCarryAdvancingTeams = (source: "survival" | "lcq", destinationField: StageTeamsField) => {
    if (!activeTournament) return;
    const advanceCount = source === "survival"
      ? activeTournament.survivalStageAdvanceCount
      : activeTournament.lastChanceQualifierAdvanceCount;
    if (!advanceCount) return;

    const canonicalize = (raw: string) => canonicalizeTeamName(raw, knownTournamentTeams, activeTournament.teamAbbreviations);
    const order = calculateStageStandingsOrder(
      matches,
      activeTournament.name,
      source,
      activeTournament.tiebreaker || "WWCD-PlacementPoint-Kill",
      canonicalize
    );
    const advancing = order.slice(0, advanceCount);
    if (advancing.length === 0) {
      setErrorMsg(`No ${source === "survival" ? "Survival Stage" : "Last Chance Qualifier"} match results found yet for this league.`);
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    const existingRows = getStageTeamRows(destinationField).map(t => t.trim()).filter(Boolean);
    const existingLower = new Set(existingRows.map(t => t.toLowerCase()));
    const newTeams = shuffleArray(advancing.filter(t => !existingLower.has(t.toLowerCase())));
    if (newTeams.length === 0) {
      setSuccessMsg("All advancing teams are already in the destination list.");
      setTimeout(() => setSuccessMsg(""), 2500);
      return;
    }

    updateActiveTournament({ [destinationField]: [...existingRows, ...newTeams].join("\n") } as Partial<TournamentPreset>);
    setSuccessMsg(`${newTeams.length} advancing team(s) carried over (order shuffled)!`);
    setTimeout(() => setSuccessMsg(""), 2500);
  };

  // One autocomplete row per team (backed by the shared "known-tournament-teams" datalist below)
  // instead of a plain textarea - reused for Grand Final/Survival Stage/LCQ's team lists.
  const renderStageTeamRows = (field: StageTeamsField, ring: string) => {
    const rows = getStageTeamRows(field);
    return (
      <div className="space-y-1.5">
        {rows.length === 0 && (
          <p className="text-[9px] text-slate-500 italic">No teams added yet.</p>
        )}
        {rows.map((team, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-slate-500 w-5 shrink-0">{idx + 1}.</span>
            <input
              type="text"
              list="known-tournament-teams"
              value={team}
              onChange={(e) => handleStageTeamRowChange(field, idx, e.target.value)}
              placeholder="Select or type a team..."
              className={`flex-1 p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 ${ring} ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
            />
            <button
              type="button"
              onClick={() => handleRemoveStageTeamRow(field, idx)}
              className="text-slate-600 hover:text-red-400 cursor-pointer shrink-0"
              title="Remove"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => handleAddStageTeamRow(field)}
          className="px-2.5 py-1 bg-slate-800/60 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-slate-700/60"
        >
          <Plus className="w-3 h-3" />
          Add Team
        </button>
      </div>
    );
  };

  // Shared between the full result form and the schedule-only form (both need to pick which stage
  // a match belongs to) - one row instead of 3 stacked checkboxes, since a match can only be in one
  // of these at a time (or none, the default Group Stage). Picking a stage here also drives which
  // team list auto-fills below (Group Stage's format-driven lobby/group, or Grand Final/Survival
  // Stage/LCQ's own free-form list), so scheduling e.g. a Grand Final match here doesn't
  // accidentally fill in Group Stage's roster instead.
  const renderMatchStageBar = () => (
    <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border transition-all ${
      isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"
    }`}>
      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase shrink-0">Match Stage:</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ["group", "Group Stage"],
          ["survival", "Survival Stage"],
          ["lcq", "Last Chance Qualifier"],
          ["final", "Grand Final"]
        ] as const).map(([key, label]) => {
          const isActive = key === "group" ? (!isGrandFinal && !isSurvivalStage && !isLastChanceQualifier)
            : key === "survival" ? isSurvivalStage
            : key === "lcq" ? isLastChanceQualifier
            : isGrandFinal;
          const activeClass = key === "survival" ? "bg-teal-500 border-teal-500 text-slate-950"
            : key === "lcq" ? "bg-indigo-500 border-indigo-500 text-slate-950"
            : key === "final" ? "bg-amber-500 border-amber-500 text-slate-950"
            : isDarkMode ? "bg-slate-700 border-slate-600 text-slate-100" : "bg-slate-300 border-slate-300 text-slate-900";
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setIsGrandFinal(key === "final");
                setIsSurvivalStage(key === "survival");
                setIsLastChanceQualifier(key === "lcq");
              }}
              title={
                key === "survival" ? "Its own fresh-points table in Standings, separate from Overall and Grand Final"
                : key === "lcq" ? "Its own fresh-points table in Standings, separate from Overall, Survival Stage and Grand Final"
                : key === "final" ? "Separated from the overall standings of the same league in Standings"
                : undefined
              }
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wide transition-all cursor-pointer border ${
                isActive ? activeClass : isDarkMode ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isGrandFinal && activeTournament?.leagueRankPointsEnabled && (
        <button
          type="button"
          onClick={handleFillBonusFromLeaguePoints}
          className="ml-auto px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-lg border border-teal-500/20 text-[10px] font-bold font-mono transition-all cursor-pointer"
          title={activeTournament.finalBonusMode === "rankTable"
            ? "Fill in each team's Bonus Points from the Grand Final Bonus rank table, based on their overall regular season standing"
            : "Fill in each team's Bonus Points from accumulated regular season League Rank Points"}
        >
          {activeTournament.finalBonusMode === "rankTable" ? "Fill Bonus Points from Rank Table" : "Fill Bonus Points from League Points"}
        </button>
      )}
    </div>
  );

  const getGroupList = (text: string, count = 8) => {
    const list = (text || "").split("\n");
    while (list.length < count) list.push("");
    return list.slice(0, count);
  };

  const handleGroupItemChange = (group: "A" | "B" | "C" | "D" | "E", index: number, value: string) => {
    if (!activeTournament) return;
    const week = activeTournament.activeWeek || "1";
    const suffix = week === "1" ? "" : `_w${week}`;
    const currentText = getGroupTextForWeek(activeTournament, group, week);

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

  // Auto-populate teams to standings on change of tournament settings, format, or which stage is
  // checked (only if not editing an existing match) - each stage pulls from its own team list.
  React.useEffect(() => {
    if (!editingMatch && activeTournament) {
      const names = getTeamsForCurrentStage(activeTournament);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournamentId, activeTournament?.format, activeTournament?.activeMatchup, activeTournament?.activeGroup, editingMatch, isGrandFinal, isSurvivalStage, isLastChanceQualifier]);

  // Auto-fill the schedule-mode Participating Teams from whichever stage is currently picked in
  // the Match Stage bar (Group Stage's format-driven lobby/group, or Grand Final/Survival Stage/
  // LCQ's own free-form list - same source getTeamsForCurrentStage already gives the full form
  // above), whenever schedule mode turns on, the league changes, or the stage picked changes - so
  // scheduling e.g. a Grand Final match doesn't silently fill in Group Stage's roster instead.
  // Still freely editable afterward (only re-fills on that change, not on every keystroke).
  // Skipped while editing an existing schedule entry - that entry's own team list was already
  // loaded by the editingSchedule effect above and shouldn't be replaced with the stage default.
  React.useEffect(() => {
    if (!isScheduleOnly || !activeTournament || editingSchedule) return;
    const names = getTeamsForCurrentStage(activeTournament);
    setScheduleTeamsInput(names.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScheduleOnly, selectedTournamentId, isGrandFinal, isSurvivalStage, isLastChanceQualifier]);

  // Sync current metadata league to the active tournament name
  React.useEffect(() => {
    if (activeTournament) {
      handleMetaChange("league", activeTournament.name);
    }
  }, [selectedTournamentId, activeTournament?.name]);

  const applyFormatAndTeamsToLobby = () => {
    if (!activeTournament) return;
    const teamNames = getTeamsForCurrentStage(activeTournament);
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
    const teamNames = getTeamsForCurrentStage(activeTournament);

    setTeams(prev => teamNames.map((name, idx) => {
      const existing = prev[idx];
      if (existing) {
        return { ...existing, name };
      }
      const placement = idx + 1;
      return createEmptyTeam(name, placement);
    }));

    setSuccessMsg("Teams updated successfully! Kills & player data already entered remain saved.");
    setTimeout(() => setSuccessMsg(""), 2500);
  };

  // Seed each team's Bonus Point from their overall regular-season standing, for use going into a
  // Grand Final match. Matches teams by name (case-insensitive). Two sources, per finalBonusMode:
  // the raw accumulated League Points total (default), or a separate bonus value per final standing
  // (leagueStandings is already sorted by rank, so its index directly maps to finalBonusPointsTable).
  const handleFillBonusFromLeaguePoints = () => {
    if (!activeTournament?.leagueRankPointsEnabled) return;
    const leagueStandings = calculateLeagueRankStandings(
      matches,
      meta.league.trim(),
      activeTournament.leagueRankPointsTable || [],
      activeTournament.tiebreaker || "WWCD-PlacementPoint-Kill"
    );
    const useRankTable = activeTournament.finalBonusMode === "rankTable";
    const finalBonusPointsTable = activeTournament.finalBonusPointsTable || [];
    const pointsByTeam: Record<string, number> = {};
    leagueStandings.forEach((s, idx) => {
      pointsByTeam[s.team.toLowerCase().trim()] = useRankTable ? (finalBonusPointsTable[idx] || 0) : s.totalLeaguePoints;
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

    setSuccessMsg("Bonus Points filled in from League Rank Points successfully!");
    setTimeout(() => setSuccessMsg(""), 2500);
  };

  // Stats actually tracked (via Player Input Panel's customColumns) for the currently selected
  // league - only these make sense to divide/weight as an MVP Score aspect.
  const numericStatOptions = useMemo(() => {
    const seen = new Map<string, { key: string; label: string }>();
    const league = (activeTournament?.name || meta.league || "").trim().toLowerCase();
    if (!league) return [];
    dailyStats.forEach((d) => {
      if ((d.league || "").trim().toLowerCase() !== league) return;
      (d.customColumns || []).forEach((c) => {
        if (c.key === "name" || c.key === "team") return;
        const isUsable = c.type === "number" || c.type === "time" ||
          (c.type === "string" && (d.teams || []).some((t) => (t.players || []).some((p: any) => looksLikeTimeValue(p[c.key]))));
        if (!isUsable) return;
        const canonicalKey = canonicalCustomKey(c.key, c.label);
        if (seen.has(canonicalKey)) return;
        seen.set(canonicalKey, { key: canonicalKey, label: c.label });
      });
    });
    return Array.from(seen.values());
  }, [dailyStats, activeTournament?.name, meta.league]);

  const mvpFormula = activeTournament?.mvpFormula || [];

  const handleUpdateMvpFormula = (newFormula: { key: string; label: string; weight: number }[]) => {
    updateActiveTournament({ mvpFormula: newFormula });
  };

  const handleAddMvpAspect = () => {
    const firstOption = numericStatOptions.find((o) => !mvpFormula.some((a) => a.key === o.key)) || numericStatOptions[0];
    if (!firstOption) return;
    handleUpdateMvpFormula([...mvpFormula, { key: firstOption.key, label: firstOption.label, weight: 0 }]);
  };

  const handleRemoveMvpAspect = (idx: number) => {
    handleUpdateMvpFormula(mvpFormula.filter((_, i) => i !== idx));
  };

  const handleChangeMvpAspectKey = (idx: number, key: string) => {
    const opt = numericStatOptions.find((o) => o.key === key);
    if (!opt) return;
    handleUpdateMvpFormula(mvpFormula.map((a, i) => (i === idx ? { ...a, key: opt.key, label: opt.label } : a)));
  };

  const handleChangeMvpAspectWeight = (idx: number, weight: number) => {
    handleUpdateMvpFormula(mvpFormula.map((a, i) => (i === idx ? { ...a, weight } : a)));
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

  const handleDragOver = (e: React.DragEvent) => {
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
  const handleGripTouchStart = (index: number) => {
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
          time: editingMatch.time || "",
          matchCode: editingMatch.matchCode || "",
          league: matchLeague,
          totalGame: editingMatch.totalGame || "1",
          gameNo: editingMatch.gameNo || "1",
          map: editingMatch.map || "Erangel",
          liveLink: editingMatch.liveLink || ""
        });
        setIsGrandFinal(!!editingMatch.isGrandFinal);
        setIsSurvivalStage(!!editingMatch.isSurvivalStage);
        setIsLastChanceQualifier(!!editingMatch.isLastChanceQualifier);

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
          time: "",
          matchCode: "",
          league: activeTournament ? activeTournament.name : "PMSL SEA 2026",
          totalGame: "1",
          gameNo: "1",
          map: "Erangel",
          liveLink: ""
        });
        setIsGrandFinal(false);
        setIsSurvivalStage(false);
        setIsLastChanceQualifier(false);
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

  // Saves the "hasn't happened yet" toggle's simplified fields as a Schedule entry instead of a
  // full match result. Reuses meta.date/meta.time (the same fields the full form already has)
  // rather than asking for the scheduled time a second time.
  const handleSubmitSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    if (!onSaveSchedule) {
      setErrorMsg("Schedule saving isn't available right now.");
      return;
    }
    setIsSubmitting(true);
    try {
      // knownTournamentTeams (not just getTournamentTeamList's Group Stage roster) so a Grand
      // Final/Survival Stage/LCQ team name - or an ABBR for one - canonicalizes correctly too.
      const teams = scheduleTeamsInput.split("\n").map(t => t.trim()).filter(Boolean)
        .map(t => canonicalizeTeamName(t, knownTournamentTeams, activeTournament?.teamAbbreviations));
      const scheduledAtIso = gmt7ToIso(meta.date, meta.time);

      await onSaveSchedule({
        id: editingSchedule?.id,
        league: (activeTournament?.name || meta.league).trim(),
        matchCode: meta.matchCode.trim(),
        gameNo: meta.gameNo.trim() || undefined,
        teams,
        map: meta.map,
        scheduledAt: scheduledAtIso,
        liveLink: meta.liveLink.trim(),
        isFinished: editingSchedule?.isFinished ?? false,
        isGrandFinal,
        isSurvivalStage,
        isLastChanceQualifier
      });
      setSuccessMsg(editingSchedule ? "Schedule updated successfully!" : "Match scheduled successfully!");
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred while saving the schedule.");
    } finally {
      setIsSubmitting(false);
    }
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
        throw new Error("All team names must be filled in.");
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
        time: meta.time,
        matchCode: meta.matchCode.trim(),
        league: meta.league.trim(),
        totalGame: meta.totalGame.trim(),
        gameNo: meta.gameNo.trim(),
        map: meta.map,
        patch: "", // Removed as requested
        liveLink: meta.liveLink.trim(),
        isGrandFinal,
        isSurvivalStage,
        isLastChanceQualifier,
        teams: processedTeams.sort((a, b) => a.placement - b.placement)
      };

      await onSave(newMatch);
      setSuccessMsg("Match saved successfully!");
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred while processing the data.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`p-6 rounded-2xl shadow-xl transition-all ${isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200"}`}>
      <datalist id="known-tournament-teams">
        {knownTournamentTeams.map(t => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="border-b pb-4 mb-4 border-slate-800">
        <h2 className={`text-lg font-bold font-display uppercase tracking-tight ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
          {editingMatch ? "EDIT DATA MATCH RECORD" : editingSchedule ? "EDIT SCHEDULED MATCH" : "ADD NEW MATCH DATA"}
        </h2>
      </div>

      {/* Not-yet-played mode is auto-detected from Date/Time below instead of a manual toggle - a
          future date/time always saves as a Schedule entry, a today-or-earlier one (or no time at
          all) always saves as a real result, so there's nothing to remember to check separately.
          Only shown for a brand-new entry - editing an already-saved result (or an existing
          schedule entry, locked into schedule mode via editingSchedule) is always the real thing. */}
      {!editingMatch && !editingSchedule && onSaveSchedule && (
        <div className={`flex items-center gap-2.5 p-3 mb-4 rounded-xl border text-[11px] font-mono font-bold uppercase ${
          isScheduleOnly
            ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
            : isDarkMode ? "bg-slate-950/40 border-slate-850 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
        }`}>
          <CalendarClock className="w-4 h-4 shrink-0" />
          {isScheduleOnly
            ? "Otomatis disimpan sebagai jadwal - Date/Time yang diisi masih di masa depan"
            : "Otomatis disimpan sebagai hasil match - isi Date/Time yang masih di masa depan untuk jadikan ini jadwal"}
        </div>
      )}

      {isScheduleOnly && !editingMatch ? (
        <form onSubmit={handleSubmitSchedule} className="space-y-6">
          {renderMatchStageBar()}
          <div className={`p-4 rounded-xl border grid grid-cols-1 md:grid-cols-2 gap-4 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">LEAGUE/COMPETITION:</label>
              <select
                value={selectedTournamentId}
                onChange={(e) => setSelectedTournamentId(e.target.value)}
                className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              >
                {tournaments.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">TITLE (e.g. Week 1 Day 2):</label>
              <input
                type="text"
                value={meta.matchCode}
                onChange={(e) => handleMetaChange("matchCode", e.target.value)}
                placeholder="Week 1 Day 2"
                className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">GAME/MATCH NO:</label>
              <input
                type="text"
                value={meta.gameNo}
                onChange={(e) => handleMetaChange("gameNo", e.target.value)}
                placeholder="e.g. 1"
                className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">SCHEDULED DATE:</label>
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
                  title="Set to Today"
                >
                  Today
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">SCHEDULED TIME:</label>
              <input
                type="time"
                value={meta.time}
                onChange={(e) => handleMetaChange("time", e.target.value)}
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
                {["Erangel", "Miramar", "Sanhok", "Rondo"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">LIVE STREAM LINK (optional):</label>
              <input
                type="text"
                value={meta.liveLink}
                onChange={(e) => handleMetaChange("liveLink", e.target.value)}
                placeholder="https://youtube.com/..."
                className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">PARTICIPATING TEAMS (ONE PER LINE):</label>
              <textarea
                value={scheduleTeamsInput}
                onChange={(e) => setScheduleTeamsInput(e.target.value)}
                placeholder={"Team A\nTeam B\n..."}
                rows={6}
                className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 resize-y ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              />
              <p className="text-[9px] text-slate-500">Auto-filled from whichever Match Stage is picked above (Group Stage's current lobby/group, or Grand Final/Survival Stage/LCQ's own team list) - edit if this match's lineup is different. One team name per line.</p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/40 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-teal-950/20 border border-teal-900/40 text-teal-400 text-xs">
              {successMsg}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel || onClose}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs cursor-pointer transition-all flex items-center gap-2"
            >
              <CalendarClock className="w-4 h-4" />
              {isSubmitting ? "Saving..." : editingSchedule ? "Update Schedule" : "Save Schedule"}
            </button>
          </div>
        </form>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* MATCH METADATA ROW */}
        <div className={`p-4 rounded-xl border grid grid-cols-2 md:grid-cols-4 gap-4 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">DATE:</label>
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
                title="Set to Today"
              >
                Today
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">TIME (OPTIONAL):</label>
            <input
              type="time"
              value={meta.time}
              onChange={(e) => handleMetaChange("time", e.target.value)}
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">MATCH CODE:</label>
            <input
              type="text"
              value={meta.matchCode}
              onChange={(e) => handleMetaChange("matchCode", e.target.value)}
              placeholder="e.g. W1D1"
              className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">LEAGUE/COMPETITION:</label>
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
            <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">GAME/MATCH NO:</label>
            <input
              type="text"
              value={meta.gameNo}
              onChange={(e) => {
                handleMetaChange("gameNo", e.target.value);
                handleMetaChange("totalGame", e.target.value);
              }}
              placeholder="e.g. 1"
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

        {renderMatchStageBar()}

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
                    CREATE NEW TOURNAMENT
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
                    {showRosterSettings ? "✕ Close" : "⚙️ Open Settings"}
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
                          title="Delete This Tournament"
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
                        placeholder="Tournament Name"
                      />
                    </div>

                    <div className="space-y-1.5 pb-1">
                      <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">TOURNAMENT FORMAT</label>
                      <div className="flex flex-wrap gap-2">
                        {([
                          ["16", "16 TEAMS"],
                          ["20", "20 TEAMS (A/B/C/D/E)"],
                          ["24", "24 TEAMS (A/B/C)"],
                          ["32", "32 TEAMS (A/B)"],
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

                  {/* All four tournament-wide on/off toggles in one row - previously each lived in
                      its own block scattered between the stage team-list sections below, meaning
                      flipping two of these meant scrolling past all three stages' settings twice. */}
                  <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-850/60">
                    <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-3">Tournament Options</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!activeTournament?.highlighted}
                            onChange={(e) => updateActiveTournament({ highlighted: e.target.checked })}
                            className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                          />
                          <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider">Highlight Tournament</span>
                        </label>
                        <p className="text-[9px] text-slate-500 mt-1.5 leading-relaxed">Marks this as the current/featured league, auto-selected and badged across Match Standings, Player Stats, Squad Roster, Comparisons, and Drop Zone Simulator. Only one tournament should be highlighted at a time.</p>
                      </div>
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!activeTournament?.groupStandingsEnabled}
                            onChange={(e) => updateActiveTournament({ groupStandingsEnabled: e.target.checked })}
                            className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                          />
                          <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider">Group Standings Filter</span>
                        </label>
                        <p className="text-[9px] text-slate-500 mt-1.5 leading-relaxed">Adds a "Filter Group" control on Match Standings. Only turn this on once Group A-E's team lists are fully filled in and kept up to date.</p>
                      </div>
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!activeTournament?.leagueRankPointsEnabled}
                            onChange={(e) => updateActiveTournament({ leagueRankPointsEnabled: e.target.checked })}
                            className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                          />
                          <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider">League Rank Points</span>
                        </label>
                        <p className="text-[9px] text-slate-500 mt-1.5 leading-relaxed">Weekly ranking converted into separate league points - can be used as Bonus Points during Grand Final.</p>
                      </div>
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!activeTournament?.smashRuleEnabled}
                            onChange={(e) => updateActiveTournament({ smashRuleEnabled: e.target.checked })}
                            className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                          />
                          <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider">Smash Rule (Grand Final)</span>
                        </label>
                        <p className="text-[9px] text-slate-500 mt-1.5 leading-relaxed">The leader's total + bonus becomes a "Match Point" target - first eligible team to WWCD wins early.</p>
                      </div>
                    </div>
                  </div>

                  {/* Stage team lists only show up for whichever stage is currently picked in the
                      "Match Stage" bar above (Group Stage shows none of these three - it uses the
                      format-driven Team Register grid further below instead), instead of all three
                      always stacked together regardless of which one is actually relevant right now. */}
                  {!isGrandFinal && !isSurvivalStage && !isLastChanceQualifier && (
                    <p className="text-[10px] text-slate-500 italic px-1">Pick Survival Stage, Last Chance Qualifier, or Grand Final in the Match Stage bar above to edit that stage's own team list here.</p>
                  )}

                  {/* Grand Final's own team list - separate from Group Stage's teams16Text/groups
                      below, so switching stages never means overwriting one stage's roster with
                      another's. Free-form (one team per line): Grand Final's team count varies by
                      tournament and isn't necessarily fixed at 16. */}
                  {isGrandFinal && (
                    <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-850/60">
                      <label className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider block mb-2">Grand Final: Team List</label>
                      {renderStageTeamRows("grandFinalTeamsText", "focus:ring-amber-500")}
                      <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">Used for the lobby grid below whenever "Mark as Grand Final Match" is checked. Pick from teams already in this tournament or type a new one - team count isn't fixed, add or remove rows as the bracket firms up.</p>
                    </div>
                  )}

                  {/* Survival Stage advance count + its own team list - only meaningful once at
                      least one match here is marked "Survival Stage" below. Advance count varies
                      per tournament and doesn't necessarily mean straight to Grand Final - some of
                      those teams may route through Last Chance Qualifier instead, which is why the
                      "Carry Top N" action below offers both destinations rather than assuming one. */}
                  {isSurvivalStage && (
                    <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-850/60 space-y-3">
                      <div>
                        <label className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-wider block mb-2">Survival Stage: Teams Advancing</label>
                        <input
                          type="number"
                          min={1}
                          value={activeTournament?.survivalStageAdvanceCount || ""}
                          onChange={(e) => updateActiveTournament({ survivalStageAdvanceCount: Number(e.target.value) || undefined })}
                          placeholder="e.g. 6"
                          className={`w-full max-w-[140px] p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-teal-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                        />
                        <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">How many top teams advance out of Survival Stage (to Grand Final and/or Last Chance Qualifier, however this tournament splits it) - varies per tournament. Used in Standings to highlight who's advancing once matches there are marked "Survival Stage" below. Leave blank to skip the highlight.</p>
                        {!!activeTournament?.survivalStageAdvanceCount && (
                          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-850/60">
                            <span className="text-[9px] text-slate-500 font-mono uppercase">Carry Top {activeTournament.survivalStageAdvanceCount} (shuffled) →</span>
                            <button
                              type="button"
                              onClick={() => handleCarryAdvancingTeams("survival", "grandFinalTeamsText")}
                              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg text-[10px] font-bold cursor-pointer border border-amber-500/20"
                            >
                              Grand Final
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCarryAdvancingTeams("survival", "lastChanceQualifierTeamsText")}
                              className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-[10px] font-bold cursor-pointer border border-indigo-500/20"
                            >
                              Last Chance Qualifier
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="pt-2 border-t border-slate-850/60">
                        <label className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-wider block mb-2">Survival Stage: Team List</label>
                        {renderStageTeamRows("survivalStageTeamsText", "focus:ring-teal-500")}
                        <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">Used for the lobby grid below whenever "Mark as Survival Stage Match" is checked. Pick from teams already in this tournament (e.g. Group Stage's roster) or type a new one - team count isn't fixed, add or remove rows as needed.</p>
                      </div>
                    </div>
                  )}

                  {/* Last Chance Qualifier advance count + its own team list - same idea as
                      Survival Stage above, minus the fork: LCQ only ever feeds into Grand Final. */}
                  {isLastChanceQualifier && (
                    <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-850/60 space-y-3">
                      <div>
                        <label className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider block mb-2">Last Chance Qualifier: Teams Advancing</label>
                        <input
                          type="number"
                          min={1}
                          value={activeTournament?.lastChanceQualifierAdvanceCount || ""}
                          onChange={(e) => updateActiveTournament({ lastChanceQualifierAdvanceCount: Number(e.target.value) || undefined })}
                          placeholder="e.g. 2"
                          className={`w-full max-w-[140px] p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                        />
                        <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">How many top teams advance out of the Last Chance Qualifier into Grand Final - varies per tournament. Used in Standings to highlight who's advancing once matches there are marked "Last Chance Qualifier" below. Leave blank to skip the highlight.</p>
                        {!!activeTournament?.lastChanceQualifierAdvanceCount && (
                          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-850/60">
                            <span className="text-[9px] text-slate-500 font-mono uppercase">Carry Top {activeTournament.lastChanceQualifierAdvanceCount} (shuffled) →</span>
                            <button
                              type="button"
                              onClick={() => handleCarryAdvancingTeams("lcq", "grandFinalTeamsText")}
                              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg text-[10px] font-bold cursor-pointer border border-amber-500/20"
                            >
                              Grand Final
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="pt-2 border-t border-slate-850/60">
                        <label className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider block mb-2">Last Chance Qualifier: Team List</label>
                        {renderStageTeamRows("lastChanceQualifierTeamsText", "focus:ring-indigo-500")}
                        <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">Used for the lobby grid below whenever "Mark as Last Chance Qualifier Match" is checked. Pick from teams already in this tournament or type a new one (LCQ can include teams that never played Group Stage) - team count isn't fixed, add or remove rows as needed.</p>
                      </div>
                    </div>
                  )}

                  {/* League Rank Points configuration - the on/off toggle itself now lives in
                      Tournament Options above, this only renders the extra setup once it's on. */}
                  {activeTournament?.leagueRankPointsEnabled && (
                    <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-850/60 space-y-3">
                      <label className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider block">League Rank Points: Configuration</label>

                      <div className="space-y-2">
                        <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">POINTS TABLE (WEEKLY RANK → LEAGUE POINTS)</label>
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
                                title="Delete this rank"
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
                            Add Rank
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 pt-3 border-t border-slate-850/60">
                        <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">GRAND FINAL BONUS SOURCE</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateActiveTournament({ finalBonusMode: "leaguePoints" })}
                            className={`flex-1 rounded-lg border px-3 py-2 text-[10px] font-mono font-bold transition-colors cursor-pointer text-left ${
                              (activeTournament.finalBonusMode || "leaguePoints") === "leaguePoints"
                                ? "border-amber-500 bg-amber-500 text-slate-950"
                                : isDarkMode ? "border-slate-700 bg-slate-950 text-slate-400" : "border-slate-300 bg-white text-slate-600"
                            }`}
                          >
                            Total League Points
                            <span className="block font-normal normal-case text-[9px] opacity-80 mt-0.5">Bonus = accumulated League Points total, as-is.</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateActiveTournament({ finalBonusMode: "rankTable" })}
                            className={`flex-1 rounded-lg border px-3 py-2 text-[10px] font-mono font-bold transition-colors cursor-pointer text-left ${
                              activeTournament.finalBonusMode === "rankTable"
                                ? "border-amber-500 bg-amber-500 text-slate-950"
                                : isDarkMode ? "border-slate-700 bg-slate-950 text-slate-400" : "border-slate-300 bg-white text-slate-600"
                            }`}
                          >
                            Custom Rank Table
                            <span className="block font-normal normal-case text-[9px] opacity-80 mt-0.5">Bonus = a separately-set value per overall final standing.</span>
                          </button>
                        </div>

                        {activeTournament.finalBonusMode === "rankTable" && (
                          <div className="space-y-2 pt-1">
                            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">BONUS TABLE (OVERALL RANK → BONUS POINTS)</label>
                            <div className="flex flex-wrap gap-2">
                              {(activeTournament.finalBonusPointsTable || []).map((pts, idx) => (
                                <div key={idx} className={`flex items-center gap-1 rounded-lg px-2 py-1 border ${isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-300"}`}>
                                  <span className="text-[9px] text-slate-500 font-bold">#{idx + 1}</span>
                                  <input
                                    type="number"
                                    value={pts}
                                    onChange={(e) => {
                                      const table = [...(activeTournament.finalBonusPointsTable || [])];
                                      table[idx] = Number(e.target.value) || 0;
                                      updateActiveTournament({ finalBonusPointsTable: table });
                                    }}
                                    className={`w-12 bg-transparent text-center text-xs font-bold focus:outline-none ${isDarkMode ? "text-amber-500" : "text-amber-600"}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const table = (activeTournament.finalBonusPointsTable || []).filter((_, i) => i !== idx);
                                      updateActiveTournament({ finalBonusPointsTable: table });
                                    }}
                                    className="text-slate-600 hover:text-red-400 cursor-pointer"
                                    title="Delete this rank"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const table = [...(activeTournament.finalBonusPointsTable || []), 0];
                                  updateActiveTournament({ finalBonusPointsTable: table });
                                }}
                                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-amber-500/20"
                              >
                                <Plus className="w-3 h-3" />
                                Add Rank
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Smash Rule configuration - same deal, toggle lives in Tournament Options above. */}
                  {activeTournament?.smashRuleEnabled && (
                    <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-850/60 space-y-3">
                      <label className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider block">Smash Rule: Configuration</label>
                      <p className="text-[9px] text-slate-500 -mt-1">(the leader's total + bonus becomes a "Match Point" target — first eligible team to WWCD wins early)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">LOCK TARGET AFTER GAME #</label>
                          <input
                            type="number"
                            min={1}
                            value={activeTournament.smashRuleLockAfterGame || ""}
                            onChange={(e) => updateActiveTournament({ smashRuleLockAfterGame: Number(e.target.value) || undefined })}
                            placeholder="e.g. 12"
                            className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">BONUS ADDED TO TARGET</label>
                          <input
                            type="number"
                            value={activeTournament.smashRuleBonus ?? ""}
                            onChange={(e) => updateActiveTournament({ smashRuleBonus: Number(e.target.value) || 0 })}
                            placeholder="e.g. 10 (blank = 0, used as soon as Grand Final games are entered)"
                            className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">TOTAL SCHEDULED GAMES (optional)</label>
                          <input
                            type="number"
                            min={1}
                            value={activeTournament.smashRuleTotalGames || ""}
                            onChange={(e) => updateActiveTournament({ smashRuleTotalGames: Number(e.target.value) || undefined })}
                            placeholder="e.g. 18"
                            className={`w-full p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                          />
                        </div>
                        <p className="text-[9px] text-slate-500 sm:col-span-3">
                          Example (PMWC): Lock after game 12, bonus +10 → the leader's total after game 12, plus 10, becomes the Match Point target. Any team reaching it is Match Point Eligible; the tournament is won the moment an eligible team gets a WWCD. If nobody smashes by the Total Scheduled Games count (if set), the plain points leader is crowned instead.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Player Stats' MVP Score: per-league weighted formula, admin-only since only
                      admins can enter the underlying data (Player Input Panel) anyway. */}
                  <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-850/60 space-y-3">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider">MVP Score Formula — {activeTournament?.name || meta.league}</span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-relaxed">
                      MVP Score (shown in Player Stats) = sum of, for each aspect below, (this player's total ÷ everyone's total for that stat) × weight.
                      Only stats already tracked in Player Input Panel for this league can be picked.
                    </p>

                    {mvpFormula.length === 0 ? (
                      <p className="text-xs text-slate-500 font-mono">No aspects configured yet - MVP Score stays hidden in Player Stats until you add at least one.</p>
                    ) : (
                      <div className="space-y-2">
                        {mvpFormula.map((aspect, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <select
                              value={aspect.key}
                              onChange={(e) => handleChangeMvpAspectKey(idx, e.target.value)}
                              className={`flex-1 p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                            >
                              {numericStatOptions.map((opt) => (
                                // Normalized to a consistent case here - a custom column's label is
                                // free text (e.g. "KNOCK" vs "Kills"), so left as-is it renders
                                // visually inconsistent next to the standard labels.
                                <option key={opt.key} value={opt.key}>{opt.label.toUpperCase()}</option>
                              ))}
                            </select>
                            <span className="text-[10px] text-slate-500 font-mono uppercase shrink-0">weight</span>
                            <input
                              type="number"
                              step="0.01"
                              value={aspect.weight}
                              onChange={(e) => handleChangeMvpAspectWeight(idx, Number(e.target.value) || 0)}
                              className={`w-20 p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-amber-400" : "bg-white border-slate-300 text-amber-600"}`}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveMvpAspect(idx)}
                              className="p-2 rounded-lg border border-red-900/30 bg-red-950/20 hover:bg-red-900/30 text-red-400 cursor-pointer transition-all shrink-0"
                              title="Remove aspect"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleAddMvpAspect}
                      disabled={numericStatOptions.length === 0}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-amber-500 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-amber-500/20"
                    >
                      <Plus className="w-3 h-3" />
                      Add Aspect
                    </button>
                  </div>

                  {/* Week Selector for 20 and 24 formats */}
                  {(activeTournament?.format === "20" || activeTournament?.format === "24") && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-950/25 p-3.5 rounded-xl border border-slate-850/60 text-xs">
                      <span className="font-mono font-bold text-slate-400 uppercase tracking-wider">
                        📅 SELECT WEEK FOR GROUP ROTATION:
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
                        *Save different group divisions for each week
                      </span>
                    </div>
                  )}

                  {/* Row 2: Roster Grid Columns */}
                  {activeTournament?.format === "20" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                      {([
                        ["A", "GROUP A", currentGroupAText],
                        ["B", "GROUP B", currentGroupBText],
                        ["C", "GROUP C", currentGroupCText],
                        ["D", "GROUP D", currentGroupDText],
                        ["E", "GROUP E", currentGroupEText]
                      ] as const).map(([groupKey, label, groupText]) => (
                        <div key={groupKey} className="space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                            <span className="text-xs font-black font-mono text-amber-500">{label}</span>
                            <span className="text-[10px] font-mono text-slate-500">4 TEAMS</span>
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
                          <span className="text-xs font-black font-mono text-amber-500">GROUP A</span>
                          <span className="text-[10px] font-mono text-slate-500">8 TEAMS</span>
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
                          <span className="text-xs font-black font-mono text-amber-500">GROUP B</span>
                          <span className="text-[10px] font-mono text-slate-500">8 TEAMS</span>
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
                          <span className="text-xs font-black font-mono text-amber-500">GROUP C</span>
                          <span className="text-[10px] font-mono text-slate-500">8 TEAMS</span>
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
                            <span className="text-xs font-black font-mono text-amber-500">GROUP {group}</span>
                            <span className="text-[10px] font-mono text-slate-500">16 TEAMS — SEPARATE LOBBY</span>
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
                                  placeholder={`Group ${group} Team ${idx + 1}`}
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
                        <span className="text-xs font-bold font-mono text-slate-300">SELECT TODAY'S GROUP MATCHUP:</span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {([
                          ["ABCD", "Group A+B+C+D"],
                          ["ABCE", "Group A+B+C+E"],
                          ["ABDE", "Group A+B+D+E"],
                          ["ACDE", "Group A+C+D+E"],
                          ["BCDE", "Group B+C+D+E"]
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
                        <span className="text-xs font-bold font-mono text-slate-300">SELECT TODAY'S GROUP MATCHUP:</span>
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
                            {matchup === "A_B" ? "Group A vs B" : matchup === "A_C" ? "Group A vs C" : "Group B vs C"}
                          </button>
                        ))}

                      </div>
                    </div>
                  )}

                  {activeTournament?.format === "32" && (
                    <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-bold font-mono text-slate-300">SELECT LOBBY GROUP FOR THIS MATCH:</span>
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
                            Group {group} — 16 Teams
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
                  📌 MODIFY LOBBY STANDINGS ({teams.length} TEAM{teams.length === 1 ? "" : "S"})
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateTeamsFromLobby()}
                  className="px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-lg border border-teal-500/20 text-[10px] font-bold font-mono transition-all cursor-pointer"
                  title="Update team names from lobby settings, without removing kills/order already entered"
                >
                  Update Team
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatAndTeamsToLobby()}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg border border-amber-500/20 text-[10px] font-bold font-mono transition-all cursor-pointer"
                  title="Full reset: team order & kills will be reset to the beginning"
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

              const renderTableColumn = (teamList: Team[], offset: number) => (
                <div className={`border rounded-xl overflow-hidden ${isDarkMode ? "border-slate-850 bg-slate-950/20" : "border-slate-200 bg-white"}`}>
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-xs font-mono border-collapse">
                      <thead>
                        <tr className={`text-left border-b ${isDarkMode ? "bg-slate-950 border-slate-850 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                          <th className="py-2 px-1 w-14 text-center text-[9px] text-slate-500 font-bold uppercase">Grip</th>
                          <th className="py-2 px-1.5 w-8 text-center font-bold uppercase text-[9px] tracking-wider">#</th>
                          <th className="py-2 px-2 min-w-[120px] font-bold uppercase text-[9px] tracking-wider">Squad / Team Name</th>
                          <th className="py-2 px-1 w-12 text-center font-bold uppercase text-[9px] tracking-wider">Kills</th>
                          {activeTournament?.format === "16" && (
                            <th className="py-2 px-1 w-12 text-center font-bold uppercase text-[9px] tracking-wider text-teal-400">Bonus</th>
                          )}
                          <th className="py-2 px-2 w-16 text-center font-bold uppercase text-[9px] tracking-wider">Points</th>
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
                              onDragOver={handleDragOver}
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
                                      title="Move up"
                                      className="text-slate-500 hover:text-amber-500 disabled:opacity-20 disabled:hover:text-slate-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    >
                                      <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => reorderTeams(tIdx, tIdx + 1)}
                                      disabled={tIdx === teams.length - 1}
                                      title="Move down"
                                      className="text-slate-500 hover:text-amber-500 disabled:opacity-20 disabled:hover:text-slate-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div
                                    className="flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-500 hover:text-amber-500 transition-colors touch-none"
                                    style={{ touchAction: "none" }}
                                    onTouchStart={() => handleGripTouchStart(tIdx)}
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
                                    title="Bonus / Starting Point (optional, situational)"
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
                    {renderTableColumn(leftTeams, 0)}
                    {renderTableColumn(rightTeams, halfLength)}
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
            onClick={onCancel || onClose}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold font-mono border cursor-pointer transition-all ${
              isDarkMode
                ? "bg-slate-950 hover:bg-slate-900 text-slate-400 border-slate-800"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200"
            }`}
          >
            Back
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
      )}
    </div>
  );
};
