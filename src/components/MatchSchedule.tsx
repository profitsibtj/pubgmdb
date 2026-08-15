import React, { useState, useEffect, useMemo } from "react";
import { ScheduleEntry, Match } from "../types";
import { gmt7ToIso, isoToGmt7Parts } from "../utils";
import {
  Trash2, Edit2, Clock, Radio, CheckCircle2, Play, CalendarClock, RefreshCw, Flag, ClipboardList, History, X, Users
} from "lucide-react";

interface MatchScheduleProps {
  schedules: ScheduleEntry[];
  isLoading: boolean;
  onSaveSchedule: (schedule: ScheduleEntry) => Promise<void>;
  onDeleteSchedule: (id: string) => Promise<void>;
  // Deep-links into Add New Match Data with this entry's league/map/date/title prefilled, so
  // entering the real results doesn't mean retyping what was already set up here. That save then
  // auto-marks this entry Finished - no separate manual step needed for the common case.
  onEnterResults?: (schedule: ScheduleEntry) => void;
  // Deep-links into Add New Match Data (schedule-only mode) with this entry's own data prefilled,
  // so editing an upcoming/not-yet-played entry happens in the same place it was created instead
  // of this component's own separate form.
  onEditSchedule?: (schedule: ScheduleEntry) => void;
  // Match results entered before this Schedule feature existed (or entered directly, bypassing it)
  // have no corresponding schedule entry - used to offer a one-off "backfill" so they still show up
  // here as Finished, instead of only ever existing in Match Results.
  matches?: Match[];
  // Jumps a finished entry down to its posted result in Match Explorer (matched by league + date).
  onViewMatch?: (schedule: ScheduleEntry) => void;
  isDarkMode: boolean;
  actionPasswordVerified: boolean;
}

type Status = "countdown" | "ongoing" | "finished";

const getStatus = (s: ScheduleEntry, nowMs: number): Status => {
  if (s.isFinished) return "finished";
  const start = new Date(s.scheduledAt).getTime();
  if (!start || Number.isNaN(start)) return "countdown";
  return nowMs < start ? "countdown" : "ongoing";
};

const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

export const MatchSchedule: React.FC<MatchScheduleProps> = ({
  schedules,
  isLoading,
  onSaveSchedule,
  onDeleteSchedule,
  onEnterResults,
  onEditSchedule,
  onViewMatch,
  matches = [],
  isDarkMode,
  actionPasswordVerified
}) => {
  // Ticks once a second so every countdown badge on screen stays live - but only while at least
  // one entry is actually counting down, so the whole card grid isn't re-rendering every second
  // once everything on screen is either live or finished.
  const [now, setNow] = useState(Date.now());
  const hasCountdownEntry = schedules.some(s => getStatus(s, now) === "countdown");
  useEffect(() => {
    if (!hasCountdownEntry) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasCountdownEntry]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Not-yet-played entries have no result to view yet - clicking one instead shows just the
  // confirmed lineup (no ranking, since nothing's actually been played) rather than nothing.
  const [lineupModalSchedule, setLineupModalSchedule] = useState<ScheduleEntry | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const [backfillTime, setBackfillTime] = useState("18:00");
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [showUnscheduledList, setShowUnscheduledList] = useState(false);

  // Normalized for comparison only (trimmed + case-insensitive) - a league name typed/edited with
  // slightly different casing or stray whitespace on one side (e.g. "PMSL SEA 2026 " vs "PMSL SEA
  // 2026") used to silently fail the exact `===` match below, leaving a match stuck in this list
  // forever with no visible reason why, even after a schedule genuinely exists for it.
  const normalizeForMatch = (s?: string) => (s || "").trim().toLowerCase();

  // Match results with no corresponding schedule entry (same league + date match used everywhere
  // else this pairing matters) - candidates for the one-off backfill below.
  const matchesWithoutSchedule = useMemo(() => {
    return matches.filter(m => !schedules.some(s =>
      normalizeForMatch(s.league) === normalizeForMatch(m.league) && isoToGmt7Parts(s.scheduledAt)?.date === m.date
    ));
  }, [matches, schedules]);

  const handleBackfillFromMatches = async () => {
    if (matchesWithoutSchedule.length === 0 || !backfillTime) return;
    setIsBackfilling(true);
    try {
      for (const m of matchesWithoutSchedule) {
        const scheduledAtIso = gmt7ToIso(m.date, backfillTime);
        await onSaveSchedule({
          league: m.league || "",
          matchCode: m.matchCode,
          teams: m.teams.map(t => t.name),
          map: m.map,
          scheduledAt: scheduledAtIso,
          liveLink: m.liveLink || "",
          isFinished: true
        });
      }
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleMarkFinished = async (s: ScheduleEntry) => {
    await onSaveSchedule({ ...s, isFinished: true });
  };

  const handleDeleteConfirmed = async () => {
    if (deleteConfirmId) {
      await onDeleteSchedule(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  // Status and parsed start time are computed once per entry per tick here, then carried through
  // sorting/filtering/rendering below instead of being recomputed (and re-parsing scheduledAt)
  // separately at each of those steps.
  const sorted = useMemo(() => {
    const statusOrder: Record<Status, number> = { ongoing: 0, countdown: 1, finished: 2 };
    const enriched = schedules.map(entry => ({
      entry,
      status: getStatus(entry, now),
      startMs: new Date(entry.scheduledAt).getTime() || 0
    }));
    return enriched.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      return a.status === "finished" ? b.startMs - a.startMs : a.startMs - b.startMs;
    });
  }, [schedules, now]);

  const notFinished = useMemo(() => sorted.filter(s => s.status !== "finished"), [sorted]);
  const visible = showFinished ? sorted : notFinished;
  const finishedCount = sorted.length - notFinished.length;

  return (
    <div className="space-y-4 font-mono text-xs animate-fadeIn">
      <div className={`p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200 shadow-sm"
      }`}>
        <h2 className={`text-sm font-extrabold uppercase tracking-tight flex items-center gap-2 ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
          <CalendarClock className="w-4 h-4 text-amber-500" />
          Match Schedule
        </h2>

        <div className="flex items-center gap-2 flex-wrap">
          {actionPasswordVerified && matchesWithoutSchedule.length > 0 && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border ${isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-100 border-slate-200"}`}>
              <History className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <button
                type="button"
                onClick={() => setShowUnscheduledList(v => !v)}
                title="Lihat daftar match mana aja yang masih kehitung belum ada jadwal"
                className="text-[9px] text-slate-500 uppercase font-bold whitespace-nowrap underline decoration-dotted cursor-pointer hover:text-amber-500"
              >
                {matchesWithoutSchedule.length} match belum ada jadwal
              </button>
              <input
                type="time"
                value={backfillTime}
                onChange={(e) => setBackfillTime(e.target.value)}
                title="Jam yang dipakai untuk semua jadwal yang di-backfill (tanggalnya ikut match masing-masing)"
                className={`p-1 rounded-lg text-[10px] font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              />
              <button
                type="button"
                onClick={handleBackfillFromMatches}
                disabled={isBackfilling}
                title="Buat jadwal (status Finished) untuk semua match yang belum punya jadwal, pakai tanggal match masing-masing + jam di atas"
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-[10px] rounded-lg uppercase cursor-pointer transition-all whitespace-nowrap"
              >
                {isBackfilling ? "Membuat..." : "Buat Jadwal"}
              </button>
            </div>
          )}
          {finishedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowFinished(v => !v)}
              className={`px-3 py-2 rounded-xl border text-[10px] font-bold cursor-pointer transition-all ${
                isDarkMode ? "bg-slate-950 hover:bg-slate-850 text-slate-400 border-slate-800" : "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200"
              }`}
            >
              {showFinished ? "Hide" : "Show"} Finished ({finishedCount})
            </button>
          )}
        </div>
      </div>

      {/* Which matches exactly are still counted as "no schedule" - without this, a mismatch (e.g.
          a league name typed slightly differently between a match and its schedule entry) is
          invisible: the count just never goes down no matter how many other entries get edited. */}
      {showUnscheduledList && matchesWithoutSchedule.length > 0 && (
        <div className={`p-4 rounded-2xl border space-y-2 ${isDarkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"}`}>
          <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">
            Match tanpa jadwal (dicocokkan lewat league + tanggal - kalau match ini sebenarnya sudah ada jadwalnya, cek league/tanggalnya persis sama atau enggak):
          </p>
          <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
            {matchesWithoutSchedule.map((m, idx) => (
              <div
                key={`${m.id || idx}`}
                className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5 rounded-lg text-[10px] ${isDarkMode ? "bg-slate-950/50 text-slate-300" : "bg-slate-50 text-slate-700"}`}
              >
                <span className="font-bold">{m.matchCode || "(no title)"}</span>
                <span className="text-slate-500">•</span>
                <span>{m.league || "(no league)"}</span>
                <span className="text-slate-500">•</span>
                <span>{m.date || "(no date)"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SCHEDULE LIST */}
      {isLoading ? (
        <div className={`flex flex-col items-center justify-center py-12 space-y-3 border rounded-2xl ${
          isDarkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
          <span className="text-slate-500">Loading schedule...</span>
        </div>
      ) : visible.length === 0 ? (
        <div className={`text-center py-10 border rounded-2xl text-slate-500 ${
          isDarkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
        }`}>
          No matches scheduled yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visible.map(({ entry: s, status, startMs }) => {
            const start = new Date(startMs);
            const validStart = startMs > 0;

            const isViewable = status === "finished" && !!onViewMatch;
            const hasLineup = status !== "finished" && (s.teams || []).length > 0;
            const isClickable = isViewable || hasLineup;

            return (
              <div
                key={s.id}
                onClick={isViewable ? () => onViewMatch!(s) : hasLineup ? () => setLineupModalSchedule(s) : undefined}
                title={isViewable ? "Click to view this match's posted result" : hasLineup ? "Click to view the confirmed lineup" : undefined}
                className={`rounded-2xl p-4 flex flex-col gap-3 transition-all ${isClickable ? "cursor-pointer" : ""} ${
                  isDarkMode
                    ? status === "ongoing" ? "bg-red-950/10 border border-red-500/20" : `bg-slate-900/30 border border-slate-900 ${isClickable ? "hover:border-amber-500/30" : "hover:border-slate-800"}`
                    : status === "ongoing" ? "bg-red-50 border border-red-200" : `bg-white border border-slate-200 ${isClickable ? "hover:border-amber-300" : ""} hover:shadow`
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-bold text-sm truncate ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                        {s.matchCode}
                      </h3>
                      {s.league && (
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          isDarkMode ? "bg-slate-950 text-amber-500 border border-slate-850" : "bg-slate-100 text-slate-700"
                        }`}>
                          {s.league}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] text-slate-500">
                      {validStart && (
                        <span>{start.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                      {s.map && (
                        <>
                          <span>•</span>
                          <span>Map: <strong>{s.map}</strong></span>
                        </>
                      )}
                    </div>
                    {s.teams && s.teams.length > 0 && (
                      <p className={`text-[10px] mt-1.5 truncate ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                        {s.teams.length === 2 ? s.teams.join(" vs ") : s.teams.join(", ")}
                        {hasLineup && <span className="text-amber-500 normal-case font-semibold"> · View lineup</span>}
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0">
                    {status === "countdown" && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center gap-1.5 font-bold text-[10px]">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        {validStart ? formatCountdown(startMs - now) : "TBD"}
                      </div>
                    )}
                    {status === "ongoing" && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center gap-1.5 font-black text-[10px] animate-pulse">
                        <Radio className="w-3.5 h-3.5 shrink-0" />
                        LIVE NOW
                      </div>
                    )}
                    {status === "finished" && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-slate-800/50 border border-slate-800 text-slate-400 flex items-center gap-1.5 font-bold text-[10px]">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Finished
                        {isViewable && <span className="text-amber-500 normal-case font-semibold">· View match</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Row */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`flex items-center justify-between gap-2 pt-2 border-t ${isDarkMode ? "border-slate-900/60" : "border-slate-100"}`}
                >
                  <div>
                    {s.liveLink && status !== "finished" && (
                      <a
                        href={s.liveLink}
                        target="_blank"
                        rel="noreferrer"
                        className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                          isDarkMode ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20" : "bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-200"
                        }`}
                      >
                        <Play className="w-3 h-3 shrink-0" />
                        Watch Live
                      </a>
                    )}
                  </div>

                  {actionPasswordVerified && (
                    <div className="flex items-center gap-1.5">
                      {status !== "finished" && onEnterResults && (
                        <button
                          type="button"
                          onClick={() => onEnterResults(s)}
                          title="Opens Add New Match Data with this entry's league/map/date already filled in - saving it auto-marks this schedule Finished"
                          className="px-2.5 py-1.5 rounded-lg border text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/20"
                        >
                          <ClipboardList className="w-3 h-3 shrink-0" />
                          Enter Match Result
                        </button>
                      )}
                      {status === "ongoing" && (
                        <button
                          type="button"
                          onClick={() => handleMarkFinished(s)}
                          className="px-2.5 py-1.5 rounded-lg border text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-500 border-teal-500/20"
                        >
                          <Flag className="w-3 h-3 shrink-0" />
                          Mark as Finished
                        </button>
                      )}
                      {onEditSchedule && (
                        <button
                          type="button"
                          onClick={() => onEditSchedule(s)}
                          className={`p-1.5 rounded-lg border cursor-pointer transition-all ${
                            isDarkMode ? "bg-slate-950 hover:bg-slate-850 text-slate-300 border-slate-800" : "bg-white hover:bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                          title="Opens Add New Match Data with this entry's own data prefilled, in schedule-only mode"
                        >
                          <Edit2 className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(s.id || null)}
                        className={`p-1.5 rounded-lg border cursor-pointer transition-all ${
                          isDarkMode ? "bg-red-950/20 hover:bg-red-900/30 text-red-400 border-red-900/30" : "bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                        }`}
                        title="Delete schedule entry"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
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
                Are you sure you want to permanently delete this schedule entry?
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className={`flex-1 border rounded-lg py-2 font-bold cursor-pointer transition-all text-center ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 border-slate-200"}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirmed}
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

      {/* LINEUP PREVIEW MODAL - for a not-yet-played entry: just the confirmed team list, with no
          rank/points (there's nothing to rank yet), unlike the real Standings this isn't. */}
      {lineupModalSchedule && (
        <div className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[110] p-4 transition-colors duration-200 ${isDarkMode ? "bg-slate-950/80" : "bg-slate-900/40"}`}>
          <div className={`w-full max-w-md border rounded-2xl shadow-2xl overflow-hidden animate-fadeIn transition-colors duration-200 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 text-slate-800"}`}>
            <div className={`flex items-start justify-between gap-2 p-5 border-b ${isDarkMode ? "border-slate-800" : "border-slate-200"}`}>
              <div className="min-w-0">
                <h3 className={`font-bold text-sm truncate ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
                  {lineupModalSchedule.matchCode}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                  {[lineupModalSchedule.league, lineupModalSchedule.map].filter(Boolean).join(" • ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLineupModalSchedule(null)}
                className="p-1 rounded-lg hover:bg-slate-800/40 text-slate-400 hover:text-white transition-all cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Confirmed Lineup - not started yet, no ranking
              </p>
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                {(lineupModalSchedule.teams || []).map((team, idx) => (
                  <div
                    key={`${team}-${idx}`}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl ${isDarkMode ? "bg-slate-950/40" : "bg-slate-50"}`}
                  >
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${isDarkMode ? "bg-slate-800 text-slate-500" : "bg-slate-200 text-slate-500"}`}>
                      {idx + 1}
                    </span>
                    <span className={`text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>{team}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
