import React, { useState, useMemo, useRef } from "react";
import { MapPin, X, RefreshCw, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { RosterPlayer } from "./RosterManager";

interface DropZoneSimulatorProps {
  isDarkMode: boolean;
  tournaments?: any[];
  roster: RosterPlayer[];
}

type MapName = "Erangel" | "Miramar" | "Rondo";

const MAPS: MapName[] = ["Erangel", "Miramar", "Rondo"];

// Official top-down minimaps from pubg.com (Krafton), same publisher as PUBG Mobile.
const MAP_IMAGES: Record<MapName, string> = {
  Erangel: "https://wstatic-prod.pubg.com/web/live/main_65379a5/img/590dba7.webp",
  Miramar: "https://wstatic-prod.pubg.com/web/live/main_65379a5/img/24a088e.webp",
  Rondo: "https://wstatic-prod.pubg.com/web/live/main_65379a5/img/8dad1dc.webp"
};

// Cycled per team (by index) so each drop zone pin is visually distinct on the map.
const PIN_COLORS = [
  "#f59e0b", "#14b8a6", "#ef4444", "#6366f1", "#22c55e", "#ec4899",
  "#0ea5e9", "#a855f7", "#eab308", "#f97316", "#84cc16", "#06b6d4",
  "#d946ef", "#64748b", "#10b981", "#f43f5e"
];

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

// Intentionally in-memory only (not persisted) - the board resets every time this tab is opened,
// so anyone can experiment with drop calls without needing admin access or worrying about
// clobbering someone else's saved plan.
export const DropZoneSimulator: React.FC<DropZoneSimulatorProps> = ({
  isDarkMode,
  tournaments,
  roster
}) => {
  const [selectedTournament, setSelectedTournament] = useState<string>(() => {
    if (tournaments && tournaments.length > 0 && tournaments[0]?.name) return tournaments[0].name;
    return "";
  });
  const [selectedMap, setSelectedMap] = useState<MapName>("Erangel");
  const [pinsByMap, setPinsByMap] = useState<Record<MapName, Record<string, { x: number; y: number }>>>({
    Erangel: {}, Miramar: {}, Rondo: {}
  });
  const [zoom, setZoom] = useState(1);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [draggedTeam, setDraggedTeam] = useState<string | null>(null);
  const mapInnerRef = useRef<HTMLDivElement>(null);

  const leagues = useMemo(() => {
    const set = new Set<string>();
    (tournaments || []).forEach((t: any) => { if (t.name) set.add(t.name.trim()); });
    roster.forEach(p => { if (p.league) set.add(p.league.trim()); });
    return Array.from(set).sort();
  }, [tournaments, roster]);

  // The tournament an admin has manually marked "highlighted" (Add New Match Data > Tournament
  // Settings), if any - starred in the dropdown below.
  const highlightedLeagueName = useMemo(() => {
    const highlighted = (tournaments || []).find((t: any) => t.highlighted);
    return highlighted?.name || null;
  }, [tournaments]);

  // Keep selectedTournament in sync if it's not found in leagues - and the first time a
  // highlighted tournament becomes available, prefer it over leagues[0].
  const hasAppliedHighlightDefault = React.useRef(false);
  React.useEffect(() => {
    if (leagues.length === 0) return;
    if (!hasAppliedHighlightDefault.current && highlightedLeagueName && leagues.includes(highlightedLeagueName)) {
      hasAppliedHighlightDefault.current = true;
      setSelectedTournament(highlightedLeagueName);
      return;
    }
    if (!leagues.includes(selectedTournament)) {
      setSelectedTournament(leagues[0]);
    }
  }, [leagues, selectedTournament, highlightedLeagueName]);

  // Teams registered in the Squad Roster for the selected tournament - the same source of truth
  // used across the app (Roster Manager, Player Input Panel), so the board stays tied to real teams.
  const teamsInLeague = useMemo(() => {
    const set = new Set<string>();
    roster.forEach(p => {
      if ((p.league || "").trim().toLowerCase() === selectedTournament.trim().toLowerCase() && p.team) {
        set.add(p.team.trim());
      }
    });
    return Array.from(set).sort();
  }, [roster, selectedTournament]);

  const currentPreset = useMemo(
    () => (tournaments || []).find((t: any) => t.name === selectedTournament),
    [tournaments, selectedTournament]
  );

  const teamAbbrMap: Record<string, string> = (currentPreset && currentPreset.teamAbbreviations) || {};

  const dropZonesForMap = pinsByMap[selectedMap];

  // Reset the zoom level whenever the map changes, so a zoomed-in view on one map doesn't carry
  // over and look broken on the next.
  React.useEffect(() => {
    setZoom(1);
  }, [selectedMap]);

  const teamColor = (teamName: string) => {
    const idx = teamsInLeague.indexOf(teamName);
    return PIN_COLORS[idx % PIN_COLORS.length] || "#f59e0b";
  };

  const setPinPosition = (teamName: string, x: number, y: number) => {
    setPinsByMap(prev => ({
      ...prev,
      [selectedMap]: { ...prev[selectedMap], [teamName]: { x, y } }
    }));
  };

  const removePin = (teamName: string) => {
    setPinsByMap(prev => {
      const nextMapPins = { ...prev[selectedMap] };
      delete nextMapPins[teamName];
      return { ...prev, [selectedMap]: nextMapPins };
    });
  };

  const resetAllForMap = () => {
    setPinsByMap(prev => ({ ...prev, [selectedMap]: {} }));
    setResetConfirmOpen(false);
  };

  const dropAtPointer = (clientX: number, clientY: number, teamName: string) => {
    const rect = mapInnerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    setPinPosition(teamName, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  };

  const handleDragStart = (e: React.DragEvent, team: string) => {
    e.dataTransfer.setData("text/plain", team);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTeam(team);
  };

  const handleMapDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleMapDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const team = e.dataTransfer.getData("text/plain") || draggedTeam;
    setDraggedTeam(null);
    if (!team) return;
    dropAtPointer(e.clientX, e.clientY, team);
  };

  const pinnedCount = Object.keys(dropZonesForMap).length;

  return (
    <div className="space-y-6 animate-fadeIn font-mono">
      {/* HEADER / TOURNAMENT SELECTOR */}
      <div className={`p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white"
      }`}>
        <div>
          <h2 className={`text-base font-bold uppercase tracking-tight flex items-center gap-2 ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
            <MapPin className="w-5 h-5 text-amber-500" />
            Drop Zone Simulator
          </h2>
          <p className="text-[10px] text-slate-500 mt-1">
            Drag a team onto the map to drop its pin. Nothing here is saved - it resets every time you open this tab.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 uppercase text-[10px] font-bold shrink-0">Tournament:</span>
          <select
            value={selectedTournament}
            onChange={(e) => setSelectedTournament(e.target.value)}
            className={`p-2 rounded-lg border cursor-pointer font-bold text-xs ${
              isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
            }`}
          >
            {leagues.length === 0 ? (
              <option value="">No Data Yet</option>
            ) : (
              leagues.map((l) => (
                <option key={l} value={l}>{l === highlightedLeagueName ? `★ ${l}` : l}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* MAP TOGGLE */}
      <div className={`p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white"
      }`}>
        <div className="flex gap-2">
          {MAPS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSelectedMap(m)}
              className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                selectedMap === m
                  ? "bg-amber-500 text-slate-950 border-amber-500"
                  : isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800 hover:text-white" : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 border border-slate-800/20 p-1 rounded-xl bg-slate-950/20">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))}
              disabled={zoom <= MIN_ZOOM}
              className={`p-1.5 rounded-lg transition-all ${zoom <= MIN_ZOOM ? "opacity-30 cursor-not-allowed text-slate-500" : "cursor-pointer text-slate-400 hover:text-white"}`}
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-bold text-slate-400 w-9 text-center">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))}
              disabled={zoom >= MAX_ZOOM}
              className={`p-1.5 rounded-lg transition-all ${zoom >= MAX_ZOOM ? "opacity-30 cursor-not-allowed text-slate-500" : "cursor-pointer text-slate-400 hover:text-white"}`}
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setResetConfirmOpen(true)}
            disabled={pinnedCount === 0}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
              pinnedCount === 0
                ? "opacity-40 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500"
                : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 cursor-pointer"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset {selectedMap} Zones
          </button>
        </div>
      </div>

      {teamsInLeague.length === 0 ? (
        <div className={`text-center py-12 rounded-2xl text-xs text-slate-500 ${isDarkMode ? "bg-slate-900/50" : "bg-white"}`}>
          No teams registered yet for {selectedTournament || "this tournament"}. Add players in Rosters first.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* TEAM LIST */}
          <div className={`p-4 rounded-2xl space-y-2 lg:col-span-1 transition-all ${
            isDarkMode ? "bg-slate-900/50" : "bg-white"
          }`}>
            <h3 className="text-[10px] font-bold uppercase text-slate-500 tracking-wider pb-2 border-b border-slate-800/40 mb-2">
              Teams ({pinnedCount}/{teamsInLeague.length} pinned)
            </h3>
            <p className="text-[9px] text-slate-500 normal-case leading-relaxed pb-1">
              Drag a team onto the map to drop (or move) its pin.
            </p>
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {teamsInLeague.map((team) => {
                const isPinned = !!dropZonesForMap[team];
                const color = teamColor(team);
                return (
                  <div
                    key={team}
                    draggable
                    onDragStart={(e) => handleDragStart(e, team)}
                    onDragEnd={() => setDraggedTeam(null)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-grab active:cursor-grabbing ${
                      draggedTeam === team
                        ? "border-amber-500 bg-amber-500/10 opacity-60"
                        : isDarkMode ? "border-slate-800 bg-slate-950/40 hover:border-slate-700" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
                        style={{ backgroundColor: isPinned ? color : "transparent", borderColor: color }}
                      />
                      <span className="truncate uppercase">{teamAbbrMap[team.toUpperCase().trim()] || team}</span>
                    </span>
                    {isPinned && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removePin(team); }}
                        className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer shrink-0"
                        title="Remove pin"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* MAP CANVAS - intentionally always dark regardless of app theme (unlike every other
              card here): the official minimap art is dark/muted with transparent edges, so both
              this card's frame and the viewport inside it stay dark-styled even in light mode
              instead of looking washed out / mismatched against a light frame. */}
          <div className="p-4 rounded-2xl lg:col-span-3 transition-all bg-slate-900/50">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {selectedMap} Map
              </span>
            </div>
            <div
              className="relative w-full aspect-square rounded-xl overflow-auto border border-slate-800"
              style={{ backgroundColor: "#0a1420" }}
            >
              <div
                ref={mapInnerRef}
                onDragOver={handleMapDragOver}
                onDrop={handleMapDrop}
                className="relative select-none"
                style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, minWidth: "100%", minHeight: "100%" }}
              >
                <img
                  src={MAP_IMAGES[selectedMap]}
                  alt={selectedMap}
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
                {Object.entries(dropZonesForMap).map(([team, pos]: [string, { x: number; y: number }]) => (
                  <div
                    key={team}
                    draggable
                    onDragStart={(e) => handleDragStart(e, team)}
                    onDragEnd={() => setDraggedTeam(null)}
                    className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center cursor-grab active:cursor-grabbing"
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  >
                    <span
                      className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white mb-0.5 shadow whitespace-nowrap"
                      style={{ backgroundColor: teamColor(team) }}
                    >
                      {teamAbbrMap[team.toUpperCase().trim()] || team}
                    </span>
                    <MapPin
                      className="w-6 h-6 drop-shadow-lg"
                      style={{ fill: teamColor(team), color: "#0b0f19" }}
                    />
                  </div>
                ))}
              </div>
            </div>
            {zoom > MIN_ZOOM && (
              <p className="text-[9px] text-slate-500 mt-2 normal-case">Scroll inside the map to pan around while zoomed in.</p>
            )}
          </div>
        </div>
      )}

      {/* RESET CONFIRMATION MODAL */}
      {resetConfirmOpen && (
        <div className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[110] p-4 transition-colors duration-200 ${isDarkMode ? "bg-slate-950/80" : "bg-slate-900/40"}`}>
          <div className={`w-full max-w-sm border rounded-2xl shadow-2xl overflow-hidden animate-fadeIn transition-colors duration-200 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 text-slate-800"}`}>
            <div className="bg-red-600 p-5 text-white flex flex-col items-center">
              <div className={`p-2.5 rounded-full mb-2 ${isDarkMode ? "bg-slate-950 text-red-500" : "bg-white/40 text-red-600"}`}>
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-center uppercase">
                Reset {selectedMap} Drop Zones
              </h3>
            </div>
            <div className="p-6 space-y-4 text-xs text-center">
              <p className={`${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                Clear all {pinnedCount} team pin{pinnedCount === 1 ? "" : "s"} on {selectedMap}?
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(false)}
                  className={`flex-1 border rounded-lg py-2 font-bold cursor-pointer transition-all text-center ${isDarkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 border-slate-200"}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={resetAllForMap}
                  className="flex-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg py-2 font-bold cursor-pointer transition-all flex items-center justify-center gap-1 shadow-lg shadow-red-600/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Yes, Reset</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
