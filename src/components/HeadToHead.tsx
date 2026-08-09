import React, { useState, useMemo } from "react";
import { Match } from "../types";
import { getTournamentTeamList, canonicalizeTeamName, matchRosterPlayer, remapPlayerCustomKeys } from "../utils";
import { RosterPlayer } from "./RosterManager";
import { Crown, Swords } from "lucide-react";

interface HeadToHeadProps {
  matches: Match[];
  isDarkMode: boolean;
  tournaments?: any[];
  roster?: RosterPlayer[];
}

export const HeadToHead: React.FC<HeadToHeadProps> = ({ matches, isDarkMode, tournaments, roster }) => {
  const [compType, setCompType] = useState<"player" | "team">("player");
  const [target1, setTarget1] = useState("");
  const [target2, setTarget2] = useState("");
  // "ALL" aggregates across every league - otherwise scopes both the radar chart and stat bars to
  // just the matches recorded under this one league. Defaults to whichever tournament is
  // highlighted (see effect below) rather than staying on "ALL".
  const [selectedLeague, setSelectedLeague] = useState("ALL");

  // The tournament an admin has manually marked "highlighted" (Add New Match Data > Tournament
  // Settings), if any - starred in the league filter dropdown below and auto-selected once.
  const highlightedLeagueName = useMemo(() => {
    const highlighted = (tournaments || []).find((t: any) => t.highlighted);
    return highlighted?.name || null;
  }, [tournaments]);

  // Leagues offered in the filter dropdown - tournament presets plus any league name that only
  // shows up on a match (so an unlisted/legacy league is still selectable).
  const uniqueLeagues = useMemo(() => {
    const leaguesSet = new Set<string>();
    (tournaments || []).forEach((t: any) => { if (t.name) leaguesSet.add(t.name.trim()); });
    matches.forEach((m) => { if (m.league) leaguesSet.add(m.league.trim()); });
    return Array.from(leaguesSet).sort();
  }, [tournaments, matches]);

  // The first time a highlighted tournament becomes available, prefer it over "ALL" - not
  // re-applied afterward if the admin later picks "ALL" or another league manually.
  const hasAppliedHighlightDefault = React.useRef(false);
  React.useEffect(() => {
    if (hasAppliedHighlightDefault.current) return;
    if (highlightedLeagueName && uniqueLeagues.includes(highlightedLeagueName)) {
      setSelectedLeague(highlightedLeagueName);
      hasAppliedHighlightDefault.current = true;
    }
  }, [highlightedLeagueName, uniqueLeagues]);

  // Resolves a player name (+ the team it was recorded under) back to the specific roster player
  // it belongs to - reconciling a registered previous nickname back to their current name, and
  // disambiguating two different roster players who share a name (e.g. two players both going by
  // "Shiro" on different teams) by team, so their stats never merge into one person.
  const rosterByLeague = useMemo(() => {
    const map: Record<string, RosterPlayer[]> = {};
    (roster || []).forEach((r) => {
      const key = (r.league || "").trim().toLowerCase();
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [roster]);

  const canonicalizePlayerForMatch = React.useCallback((rawName: string, leagueName: string, teamName: string) => {
    const trimmed = (rawName || "").trim();
    const rosterForLeague = rosterByLeague[(leagueName || "").trim().toLowerCase()];
    if (!rosterForLeague) return { id: trimmed, name: trimmed };
    return matchRosterPlayer(trimmed, teamName, rosterForLeague);
  }, [rosterByLeague]);

  // Process overall stats of players. Only fields actually collected by the Player Input Panel
  // are tracked here (matches, elims, damage, assists, WWCD) - knocks/heals/survival time/MVP
  // aren't part of that data entry flow, so they're left out rather than always showing 0.
  const playersData = useMemo(() => {
    const list: { [id: string]: {
      id: string;
      name: string;
      teamName: string;
      role: string;
      matches: number;
      elims: number;
      assists: number;
      damage: number;
      wwcd: number;
    }} = {};

    matches.forEach((m) => {
      if (selectedLeague !== "ALL" && (m.league || "").trim().toLowerCase() !== selectedLeague.toLowerCase()) return;
      // Player-level data only ever comes from Daily/Weekly Stats records (Player Input Panel) -
      // AddMatchForm has no player-level UI, teams there always have an empty players array.
      // Daily/weekly records also use different semantics: matchesPlayed/wwcdCount are explicit
      // per-player fields instead of one match/placement per Team entry.
      (m.teams || []).forEach((t) => {
        (t.players || []).forEach((rawP) => {
          const identity = canonicalizePlayerForMatch(rawP.name.trim(), m.league || "", t.name || "");
          if (!identity.id) return;

          // A manually-added custom column (e.g. typing "Assist" in Player Input Panel's "+ Add
          // Column") can land under a non-standard key (custom_assist) instead of the standard
          // one this reads directly (assists) - remapped here the same way Player Stats does, so
          // a value entered there isn't silently read as 0 here.
          const p: any = m.isDailyStats ? remapPlayerCustomKeys(rawP, m.customColumns) : rawP;

          if (!list[identity.id]) {
            list[identity.id] = {
              id: identity.id,
              name: identity.name,
              teamName: t.name || "",
              role: p.role || "PLAYER",
              matches: 0,
              elims: 0,
              assists: 0,
              damage: 0,
              wwcd: 0
            };
          }

          const pl = list[identity.id];
          pl.teamName = t.name || pl.teamName;
          if (m.isDailyStats) {
            pl.matches += p.matchesPlayed !== undefined ? p.matchesPlayed : 0;
            pl.wwcd += p.wwcdCount || 0;
          } else {
            pl.matches += 1;
            if (t.placement === 1) pl.wwcd += 1;
          }
          pl.elims += p.elims || 0;
          pl.assists += p.assists || 0;
          pl.damage += p.damage || 0;
        });
      });
    });

    return Object.values(list).map((p) => ({
      ...p,
      avgElims: p.matches > 0 ? Math.round((p.elims / p.matches) * 10) / 10 : 0,
      avgDamage: p.matches > 0 ? Math.round(p.damage / p.matches) : 0,
      avgAssists: p.matches > 0 ? Math.round((p.assists / p.matches) * 10) / 10 : 0,
      wwcdRate: p.matches > 0 ? Math.round((p.wwcd / p.matches) * 100) : 0
    }));
  }, [matches, canonicalizePlayerForMatch, selectedLeague]);

  // Two roster players can legitimately share a display name (see matchRosterPlayer) - flagged
  // here so the picker below can tell them apart by team instead of showing two identical rows.
  const duplicatePlayerNames = useMemo(() => {
    const counts: Record<string, number> = {};
    playersData.forEach((p) => {
      const key = p.name.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
  }, [playersData]);

  // Reconciles team-name variants (e.g. an ABBR typed instead of the full name in Player Input
  // Panel) back to one consistent name per tournament, so the same team never gets silently split
  // into two entries.
  const presetsByLeague = useMemo(() => {
    const map: Record<string, any> = {};
    (tournaments || []).forEach((t: any) => {
      if (t.name) map[t.name.trim().toLowerCase()] = t;
    });
    return map;
  }, [tournaments]);

  const canonicalizeTeamForMatch = React.useCallback((rawName: string, leagueName: string) => {
    const trimmed = (rawName || "").trim();
    const preset = presetsByLeague[(leagueName || "").trim().toLowerCase()];
    if (!preset) return trimmed;
    return canonicalizeTeamName(trimmed, getTournamentTeamList(preset), preset.teamAbbreviations);
  }, [presetsByLeague]);

  // Process overall stats of teams (aggregated across every match they've played)
  const teamsData = useMemo(() => {
    const list: { [name: string]: {
      id: string;
      name: string;
      matches: number;
      elims: number;
      placementPointsTotal: number;
      totalPointsSum: number;
      wwcd: number;
      top4: number;
    }} = {};

    matches.forEach((m) => {
      if (m.isDailyStats) return;
      if (selectedLeague !== "ALL" && (m.league || "").trim().toLowerCase() !== selectedLeague.toLowerCase()) return;
      (m.teams || []).forEach((t) => {
        const name = canonicalizeTeamForMatch(t.name || "", m.league || "");
        if (!name) return;

        if (!list[name]) {
          list[name] = { id: name, name, matches: 0, elims: 0, placementPointsTotal: 0, totalPointsSum: 0, wwcd: 0, top4: 0 };
        }

        const tm = list[name];
        tm.matches += 1;
        tm.elims += Number(t.eliminationPoints) || 0;
        tm.placementPointsTotal += Number(t.placementPoints) || 0;
        tm.totalPointsSum += Number(t.totalPoints) || 0;
        if (t.placement === 1) tm.wwcd += 1;
        if (t.placement >= 1 && t.placement <= 4) tm.top4 += 1;
      });
    });

    return Object.values(list).map((t) => ({
      ...t,
      avgElims: t.matches > 0 ? Math.round((t.elims / t.matches) * 10) / 10 : 0,
      avgPlacementPoints: t.matches > 0 ? Math.round((t.placementPointsTotal / t.matches) * 10) / 10 : 0,
      avgTotalPoints: t.matches > 0 ? Math.round((t.totalPointsSum / t.matches) * 10) / 10 : 0,
      wwcdRate: t.matches > 0 ? Math.round((t.wwcd / t.matches) * 100) : 0,
      top4Rate: t.matches > 0 ? Math.round((t.top4 / t.matches) * 100) : 0
    }));
  }, [matches, canonicalizeTeamForMatch, selectedLeague]);

  const activeData = compType === "player" ? playersData : teamsData;

  // Reset selections when switching Player <-> Team, since the name spaces don't overlap
  React.useEffect(() => {
    setTarget1("");
    setTarget2("");
  }, [compType]);

  // Set initial selections when data changes
  React.useEffect(() => {
    if (activeData.length >= 2) {
      if (!target1 || !activeData.some(p => p.id === target1)) {
        setTarget1(activeData[0].id);
      }
      if (!target2 || !activeData.some(p => p.id === target2)) {
        setTarget2(activeData[1].id);
      }
    }
  }, [activeData]);

  // Get compared objects
  const obj1 = useMemo(() => {
    return activeData.find((p) => p.id === target1);
  }, [activeData, target1]);

  const obj2 = useMemo(() => {
    return activeData.find((p) => p.id === target2);
  }, [activeData, target2]);

  return (
    <div className="space-y-6 animate-fadeIn font-mono">
      {/* SELECTION ROW */}
      <div className={`p-5 rounded-2xl flex flex-col md:flex-row gap-5 justify-between items-start md:items-center transition-all ${
        isDarkMode ? "bg-slate-900/50" : "bg-white border border-slate-200 shadow-sm"
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-black font-mono text-amber-500 tracking-tight uppercase">
            ⚔️ {compType === "player" ? "Player vs Player" : "Team vs Team"} Comparison
          </span>
          <div className="flex items-center gap-1 border border-slate-800/20 p-1 rounded-xl bg-slate-950/20">
            <button
              type="button"
              onClick={() => setCompType("player")}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer ${
                compType === "player" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Player
            </button>
            <button
              type="button"
              onClick={() => setCompType("team")}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer ${
                compType === "team" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Team
            </button>
          </div>
        </div>

        {/* Dynamic selectors */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto text-xs">
          <div className="flex-1 md:flex-none">
            <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">LEAGUE</span>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className={`w-full p-2 rounded-xl border font-bold cursor-pointer ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-700"
              }`}
            >
              <option value="ALL">-- ALL TIME --</option>
              {uniqueLeagues.map((l) => (
                <option key={l} value={l}>{l === highlightedLeagueName ? `★ ${l}` : l}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 md:flex-none">
            <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">COMPETITOR 1</span>
            <select
              value={target1}
              onChange={(e) => setTarget1(e.target.value)}
              className={`w-full p-2 rounded-xl border font-bold cursor-pointer ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-amber-500" : "bg-white border-slate-300 text-amber-600"
              }`}
            >
              {activeData.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === target2}>
                  {compType === "player" && duplicatePlayerNames.has(p.name.toLowerCase())
                    ? `${p.name} (${(p as any).teamName})`
                    : p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="text-slate-600 font-bold shrink-0 self-end mb-2">VS</div>

          <div className="flex-1 md:flex-none">
            <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">COMPETITOR 2</span>
            <select
              value={target2}
              onChange={(e) => setTarget2(e.target.value)}
              className={`w-full p-2 rounded-xl border font-bold cursor-pointer ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-teal-400" : "bg-white border-slate-300 text-teal-600"
              }`}
            >
              {activeData.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === target1}>
                  {compType === "player" && duplicatePlayerNames.has(p.name.toLowerCase())
                    ? `${p.name} (${(p as any).teamName})`
                    : p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* DASHBOARD DETAILS */}
      {!obj1 || !obj2 ? (
        <div className={`py-16 px-6 text-center rounded-2xl flex flex-col items-center justify-center gap-2 ${
          isDarkMode ? "bg-slate-900/50 text-slate-400" : "bg-white border border-slate-200 text-slate-600"
        }`}>
          <Swords className="w-10 h-10 text-amber-500/80 mb-2 animate-pulse" />
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">Not Enough Data</p>
          <p className="max-w-md text-[11px] leading-relaxed text-slate-500 font-mono">
            At least 2 {compType === "player" ? "players" : "teams"} with recorded match data are needed to show this tactical comparison.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* SVG RADAR CHART (Star Chart) */}
          <div className={`p-6 rounded-3xl flex flex-col items-center justify-center transition-colors ${
            isDarkMode ? "bg-slate-900/40" : "bg-white border border-slate-200 shadow-sm"
          }`}>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Tactical Radar Grid</h3>
            {(() => {
              const center = 150;
              const r = 90;
              const size = 300;
              
              // Metrics for Players - only stats actually tracked by the Player Input Panel
              const metrics = compType === "player"
                ? [
                    { label: "AVG ELIMS", val1: (obj1 as any).avgElims, val2: (obj2 as any).avgElims, max: 4.0, display: (v: number) => v.toFixed(1) },
                    { label: "AVG DAMAGE", val1: (obj1 as any).avgDamage, val2: (obj2 as any).avgDamage, max: 600, display: (v: number) => Math.round(v).toString() },
                    { label: "AVG ASSISTS", val1: (obj1 as any).avgAssists, val2: (obj2 as any).avgAssists, max: 3.0, display: (v: number) => v.toFixed(1) },
                    { label: "WWCD RATE", val1: (obj1 as any).wwcdRate, val2: (obj2 as any).wwcdRate, max: 50, display: (v: number) => `${v}%` },
                    { label: "MATCHES", val1: (obj1 as any).matches, val2: (obj2 as any).matches, max: 15, display: (v: number) => `${v}x` }
                  ]
                : [
                    { label: "AVG KILLS", val1: (obj1 as any).avgElims, val2: (obj2 as any).avgElims, max: 6.0, display: (v: number) => v.toFixed(1) },
                    { label: "AVG PLACEMENT PTS", val1: (obj1 as any).avgPlacementPoints, val2: (obj2 as any).avgPlacementPoints, max: 10, display: (v: number) => v.toFixed(1) },
                    { label: "AVG TOTAL PTS", val1: (obj1 as any).avgTotalPoints, val2: (obj2 as any).avgTotalPoints, max: 16, display: (v: number) => v.toFixed(1) },
                    { label: "WWCD RATE", val1: (obj1 as any).wwcdRate, val2: (obj2 as any).wwcdRate, max: 40, display: (v: number) => `${v}%` },
                    { label: "TOP 4 RATE", val1: (obj1 as any).top4Rate, val2: (obj2 as any).top4Rate, max: 100, display: (v: number) => `${v}%` },
                    { label: "MATCHES", val1: (obj1 as any).matches, val2: (obj2 as any).matches, max: 15, display: (v: number) => `${v}x` }
                  ];

              const count = metrics.length;
              const getCoords = (idx: number, val: number, max: number) => {
                const angle = (idx * 2 * Math.PI) / count - Math.PI / 2;
                const pct = Math.max(0.1, Math.min(1.0, val / max));
                const x = center + (pct * r) * Math.cos(angle);
                const y = center + (pct * r) * Math.sin(angle);
                return { x, y };
              };

              const bgPolygons = [0.2, 0.4, 0.6, 0.8, 1.0].map((frac) => {
                return metrics.map((_, idx) => {
                  const angle = (idx * 2 * Math.PI) / count - Math.PI / 2;
                  const x = center + (frac * r) * Math.cos(angle);
                  const y = center + (frac * r) * Math.sin(angle);
                  return `${x},${y}`;
                }).join(" ");
              });

              const p1PointsStr = metrics.map((m, idx) => {
                const coords = getCoords(idx, m.val1, m.max);
                return `${coords.x},${coords.y}`;
              }).join(" ");

              const p2PointsStr = metrics.map((m, idx) => {
                const coords = getCoords(idx, m.val2, m.max);
                return `${coords.x},${coords.y}`;
              }).join(" ");

              return (
                <div className="flex flex-col items-center w-full">
                  <div className="relative w-[300px] h-[300px] flex items-center justify-center">
                    <svg width={size} height={size} className="overflow-visible">
                      {bgPolygons.map((points, idx) => (
                        <polygon
                          key={idx}
                          points={points}
                          fill="none"
                          stroke={isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}
                          strokeWidth="1"
                        />
                      ))}

                      {metrics.map((_, idx) => {
                        const angle = (idx * 2 * Math.PI) / count - Math.PI / 2;
                        const x = center + r * Math.cos(angle);
                        const y = center + r * Math.sin(angle);
                        return (
                          <line
                            key={idx}
                            x1={center}
                            y1={center}
                            x2={x}
                            y2={y}
                            stroke={isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}
                            strokeWidth="1.5"
                            strokeDasharray="2,2"
                          />
                        );
                      })}

                      {/* Amber Polygon */}
                      <polygon
                        points={p1PointsStr}
                        fill="rgba(245, 158, 11, 0.22)"
                        stroke="rgba(245, 158, 11, 0.9)"
                        strokeWidth="2.5"
                      />

                      {/* Teal Polygon */}
                      <polygon
                        points={p2PointsStr}
                        fill="rgba(20, 184, 166, 0.22)"
                        stroke="rgba(20, 184, 166, 0.9)"
                        strokeWidth="2.5"
                      />

                      {/* Labels */}
                      {metrics.map((m, idx) => {
                        const angle = (idx * 2 * Math.PI) / count - Math.PI / 2;
                        const labelR = r + 24;
                        const x = center + labelR * Math.cos(angle);
                        const y = center + labelR * Math.sin(angle) + 4;

                        let textAnchor = "middle";
                        if (Math.cos(angle) > 0.1) textAnchor = "start";
                        else if (Math.cos(angle) < -0.1) textAnchor = "end";

                        return (
                          <g key={idx} className="font-mono text-[9px] font-bold">
                            <text
                              x={x}
                              y={y - 6}
                              fill={isDarkMode ? "#94a3b8" : "#475569"}
                              textAnchor={textAnchor}
                              className="uppercase tracking-wider font-semibold"
                            >
                              {m.label}
                            </text>
                            <text x={x} y={y + 4} textAnchor={textAnchor}>
                              <tspan fill="#f59e0b" fontWeight="extrabold">{m.display(m.val1)}</tspan>
                              <tspan fill={isDarkMode ? "#475569" : "#cbd5e1"}> / </tspan>
                              <tspan fill="#14b8a6" fontWeight="extrabold">{m.display(m.val2)}</tspan>
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Legends */}
                  <div className="flex items-center gap-6 mt-4 text-[10px] font-bold uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <span className="text-amber-500">{obj1.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-teal-500" />
                      <span className="text-teal-400">{obj2.name}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* SIDE-BY-SIDE BARS COMPARISON */}
          <div className="space-y-4">
            <div className={`p-5 rounded-3xl space-y-4 transition-all ${
              isDarkMode ? "bg-slate-900/40" : "bg-white border border-slate-200 shadow-sm"
            }`}>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center border-b border-slate-800/40 pb-2">Statistics Comparison</h3>

              {/* Elims bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className={`text-left flex items-center justify-start gap-1 ${obj1.avgElims > obj2.avgElims ? "text-amber-500 font-bold" : "text-slate-400"}`}>
                    {obj1.avgElims > obj2.avgElims && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    {obj1.avgElims.toFixed(1)} Elims
                  </span>
                  <span className="text-slate-500 font-bold uppercase text-[10px]">AVG ELIMS</span>
                  <span className={`text-right flex items-center justify-end gap-1 ${obj2.avgElims > obj1.avgElims ? "text-teal-400 font-bold" : "text-slate-400"}`}>
                    {obj2.avgElims > obj1.avgElims && <Crown className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                    {obj2.avgElims.toFixed(1)} Elims
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-slate-950 flex border border-slate-900">
                  <div 
                    className="bg-amber-500 h-full border-r border-slate-950 transition-all duration-300" 
                    style={{ width: `${obj1.avgElims + obj2.avgElims > 0 ? (obj1.avgElims / (obj1.avgElims + obj2.avgElims)) * 100 : 50}%` }} 
                  />
                  <div 
                    className="bg-teal-500 h-full transition-all duration-300" 
                    style={{ width: `${obj1.avgElims + obj2.avgElims > 0 ? (obj2.avgElims / (obj1.avgElims + obj2.avgElims)) * 100 : 50}%` }} 
                  />
                </div>
              </div>

              {/* Damage bar (player only - teams have no per-damage field) */}
              {compType === "player" && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className={`text-left flex items-center justify-start gap-1 ${(obj1 as any).avgDamage > (obj2 as any).avgDamage ? "text-amber-500 font-bold" : "text-slate-400"}`}>
                      {(obj1 as any).avgDamage > (obj2 as any).avgDamage && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      {Math.round((obj1 as any).avgDamage)} dmg
                    </span>
                    <span className="text-slate-500 font-bold uppercase text-[10px]">AVG DAMAGE</span>
                    <span className={`text-right flex items-center justify-end gap-1 ${(obj2 as any).avgDamage > (obj1 as any).avgDamage ? "text-teal-400 font-bold" : "text-slate-400"}`}>
                      {(obj2 as any).avgDamage > (obj1 as any).avgDamage && <Crown className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                      {Math.round((obj2 as any).avgDamage)} dmg
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-slate-950 flex border border-slate-900">
                    <div
                      className="bg-amber-500 h-full border-r border-slate-950 transition-all duration-300"
                      style={{ width: `${(obj1 as any).avgDamage + (obj2 as any).avgDamage > 0 ? ((obj1 as any).avgDamage / ((obj1 as any).avgDamage + (obj2 as any).avgDamage)) * 100 : 50}%` }}
                    />
                    <div
                      className="bg-teal-500 h-full transition-all duration-300"
                      style={{ width: `${(obj1 as any).avgDamage + (obj2 as any).avgDamage > 0 ? ((obj2 as any).avgDamage / ((obj1 as any).avgDamage + (obj2 as any).avgDamage)) * 100 : 50}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Placement Points bar (team only) */}
              {compType === "team" && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className={`text-left flex items-center justify-start gap-1 ${(obj1 as any).avgPlacementPoints > (obj2 as any).avgPlacementPoints ? "text-amber-500 font-bold" : "text-slate-400"}`}>
                      {(obj1 as any).avgPlacementPoints > (obj2 as any).avgPlacementPoints && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      {(obj1 as any).avgPlacementPoints.toFixed(1)} pts
                    </span>
                    <span className="text-slate-500 font-bold uppercase text-[10px]">AVG PLACEMENT PTS</span>
                    <span className={`text-right flex items-center justify-end gap-1 ${(obj2 as any).avgPlacementPoints > (obj1 as any).avgPlacementPoints ? "text-teal-400 font-bold" : "text-slate-400"}`}>
                      {(obj2 as any).avgPlacementPoints > (obj1 as any).avgPlacementPoints && <Crown className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                      {(obj2 as any).avgPlacementPoints.toFixed(1)} pts
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-slate-950 flex border border-slate-900">
                    <div
                      className="bg-amber-500 h-full border-r border-slate-950 transition-all duration-300"
                      style={{ width: `${(obj1 as any).avgPlacementPoints + (obj2 as any).avgPlacementPoints > 0 ? ((obj1 as any).avgPlacementPoints / ((obj1 as any).avgPlacementPoints + (obj2 as any).avgPlacementPoints)) * 100 : 50}%` }}
                    />
                    <div
                      className="bg-teal-500 h-full transition-all duration-300"
                      style={{ width: `${(obj1 as any).avgPlacementPoints + (obj2 as any).avgPlacementPoints > 0 ? ((obj2 as any).avgPlacementPoints / ((obj1 as any).avgPlacementPoints + (obj2 as any).avgPlacementPoints)) * 100 : 50}%` }}
                    />
                  </div>
                </div>
              )}

              {/* WWCD Rate bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className={`text-left flex items-center justify-start gap-1 ${obj1.wwcdRate > obj2.wwcdRate ? "text-amber-500 font-bold" : "text-slate-400"}`}>
                    {obj1.wwcdRate > obj2.wwcdRate && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    {obj1.wwcdRate}%
                  </span>
                  <span className="text-slate-500 font-bold uppercase text-[10px]">WWCD WINRATE</span>
                  <span className={`text-right flex items-center justify-end gap-1 ${obj2.wwcdRate > obj1.wwcdRate ? "text-teal-400 font-bold" : "text-slate-400"}`}>
                    {obj2.wwcdRate > obj1.wwcdRate && <Crown className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                    {obj2.wwcdRate}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-slate-950 flex border border-slate-900">
                  <div 
                    className="bg-amber-500 h-full border-r border-slate-950 transition-all duration-300" 
                    style={{ width: `${obj1.wwcdRate + obj2.wwcdRate > 0 ? (obj1.wwcdRate / (obj1.wwcdRate + obj2.wwcdRate)) * 100 : 50}%` }} 
                  />
                  <div 
                    className="bg-teal-500 h-full transition-all duration-300" 
                    style={{ width: `${obj1.wwcdRate + obj2.wwcdRate > 0 ? (obj2.wwcdRate / (obj1.wwcdRate + obj2.wwcdRate)) * 100 : 50}%` }} 
                  />
                </div>
              </div>

              {/* Assists bar (player only) */}
              {compType === "player" && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className={`text-left flex items-center justify-start gap-1 ${(obj1 as any).avgAssists > (obj2 as any).avgAssists ? "text-amber-500 font-bold" : "text-slate-400"}`}>
                      {(obj1 as any).avgAssists > (obj2 as any).avgAssists && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      {(obj1 as any).avgAssists.toFixed(1)} Assists
                    </span>
                    <span className="text-slate-500 font-bold uppercase text-[10px]">AVG ASSISTS</span>
                    <span className={`text-right flex items-center justify-end gap-1 ${(obj2 as any).avgAssists > (obj1 as any).avgAssists ? "text-teal-400 font-bold" : "text-slate-400"}`}>
                      {(obj2 as any).avgAssists > (obj1 as any).avgAssists && <Crown className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                      {(obj2 as any).avgAssists.toFixed(1)} Assists
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-slate-950 flex border border-slate-900">
                    <div
                      className="bg-amber-500 h-full border-r border-slate-950 transition-all duration-300"
                      style={{ width: `${(obj1 as any).avgAssists + (obj2 as any).avgAssists > 0 ? ((obj1 as any).avgAssists / ((obj1 as any).avgAssists + (obj2 as any).avgAssists)) * 100 : 50}%` }}
                    />
                    <div
                      className="bg-teal-500 h-full transition-all duration-300"
                      style={{ width: `${(obj1 as any).avgAssists + (obj2 as any).avgAssists > 0 ? ((obj2 as any).avgAssists / ((obj1 as any).avgAssists + (obj2 as any).avgAssists)) * 100 : 50}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Top 4 Rate bar (team only) */}
              {compType === "team" && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className={`text-left flex items-center justify-start gap-1 ${(obj1 as any).top4Rate > (obj2 as any).top4Rate ? "text-amber-500 font-bold" : "text-slate-400"}`}>
                      {(obj1 as any).top4Rate > (obj2 as any).top4Rate && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      {(obj1 as any).top4Rate}% ({(obj1 as any).top4}x)
                    </span>
                    <span className="text-slate-500 font-bold uppercase text-[10px]">TOP 4 RATE</span>
                    <span className={`text-right flex items-center justify-end gap-1 ${(obj2 as any).top4Rate > (obj1 as any).top4Rate ? "text-teal-400 font-bold" : "text-slate-400"}`}>
                      {(obj2 as any).top4Rate > (obj1 as any).top4Rate && <Crown className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                      {(obj2 as any).top4Rate}% ({(obj2 as any).top4}x)
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-slate-950 flex border border-slate-900">
                    <div
                      className="bg-amber-500 h-full border-r border-slate-950 transition-all duration-300"
                      style={{ width: `${(obj1 as any).top4Rate + (obj2 as any).top4Rate > 0 ? ((obj1 as any).top4Rate / ((obj1 as any).top4Rate + (obj2 as any).top4Rate)) * 100 : 50}%` }}
                    />
                    <div
                      className="bg-teal-500 h-full transition-all duration-300"
                      style={{ width: `${(obj1 as any).top4Rate + (obj2 as any).top4Rate > 0 ? ((obj2 as any).top4Rate / ((obj1 as any).top4Rate + (obj2 as any).top4Rate)) * 100 : 50}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* GENERAL PARAMETERS ROW */}
            <div className={`p-5 rounded-3xl space-y-3 transition-colors ${
              isDarkMode ? "bg-slate-900/40" : "bg-white border border-slate-200 shadow-sm"
            }`}>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">General Records</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-400">Total Matches:</span>
                  <span className="text-slate-200 font-extrabold">{obj1.matches} vs {obj2.matches}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-400">Total Eliminations:</span>
                  <span className="text-slate-200 font-extrabold">{obj1.elims} vs {obj2.elims}</span>
                </div>
                {compType === "player" && (
                  <>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Total Assists:</span>
                      <span className="text-slate-200 font-extrabold">{(obj1 as any).assists} vs {(obj2 as any).assists}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">WWCD Rate:</span>
                      <span className="text-slate-200 font-extrabold">{(obj1 as any).wwcdRate}% vs {(obj2 as any).wwcdRate}%</span>
                    </div>
                  </>
                )}
                {compType === "team" && (
                  <>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Total WWCD:</span>
                      <span className="text-slate-200 font-extrabold">{(obj1 as any).wwcd} vs {(obj2 as any).wwcd}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Total Top 4:</span>
                      <span className="text-slate-200 font-extrabold">{(obj1 as any).top4} vs {(obj2 as any).top4}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Total Points:</span>
                      <span className="text-slate-200 font-extrabold">{(obj1 as any).totalPointsSum} vs {(obj2 as any).totalPointsSum}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
