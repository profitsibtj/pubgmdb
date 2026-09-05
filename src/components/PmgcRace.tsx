import React, { useState, useMemo } from "react";
import { Match } from "../types";
import { calculatePmgcRaceStandings, PmgcRaceResult } from "../utils";
import { Trophy, Globe2, ChevronDown, ChevronUp } from "lucide-react";

interface PmgcRaceProps {
  matches: Match[];
  isDarkMode: boolean;
  tournaments?: any[];
}

export const PmgcRace: React.FC<PmgcRaceProps> = ({ matches, isDarkMode, tournaments }) => {
  const tournamentPresets = useMemo(() => tournaments || [], [tournaments]);

  // Every year at least one tournament has actually been tagged "PMGC Race" for, newest first -
  // only these are worth showing a tab for.
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    tournamentPresets.forEach((t: any) => {
      if (t.pmgcRaceEnabled && (t.pmgcRaceYear || "").trim()) years.add(t.pmgcRaceYear.trim());
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [tournamentPresets]);

  const [selectedYear, setSelectedYear] = useState<string>("");
  React.useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears]);

  const standings: PmgcRaceResult[] = useMemo(() => {
    if (!selectedYear) return [];
    return calculatePmgcRaceStandings(matches, tournamentPresets, selectedYear);
  }, [matches, tournamentPresets, selectedYear]);

  // Which tournaments contribute to the currently selected year - shown as context above the
  // table so it's clear exactly what's being counted.
  const contributingLeagues = useMemo(() => {
    if (!selectedYear) return [];
    return tournamentPresets
      .filter((t: any) => t.pmgcRaceEnabled && (t.pmgcRaceYear || "").trim() === selectedYear)
      .map((t: any) => t.name);
  }, [tournamentPresets, selectedYear]);

  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  // Every distinct region tagged on any team in the current standings (set per-team in Squad
  // Roster) - "Indonesia" is pinned first since that's this tracker's home scene, the rest follow
  // alphabetically. Teams with no region tagged fall into "Other" (kept out of this list, always
  // rendered last).
  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    standings.forEach(r => { if (r.region) regions.add(r.region); });
    return Array.from(regions).sort((a, b) => {
      const aIsID = a.toLowerCase() === "indonesia";
      const bIsID = b.toLowerCase() === "indonesia";
      if (aIsID !== bIsID) return aIsID ? -1 : 1;
      return a.localeCompare(b);
    });
  }, [standings]);

  const [selectedRegion, setSelectedRegion] = useState<string>("ALL");
  React.useEffect(() => {
    if (selectedRegion !== "ALL" && !availableRegions.includes(selectedRegion)) {
      setSelectedRegion("ALL");
    }
  }, [availableRegions, selectedRegion]);

  const OTHER_REGION = "Other";

  // Groups the (already points-sorted) standings by region - Indonesia's section first, then the
  // rest alphabetically, "Other" (untagged teams) always last - so each section reads as its own
  // regional leaderboard, ranked 1..N within that region rather than the overall race position.
  const groupedStandings = useMemo(() => {
    const order = selectedRegion === "ALL" ? [...availableRegions, OTHER_REGION] : [selectedRegion];
    return order
      .map(region => ({
        region,
        teams: standings.filter(r => (r.region || OTHER_REGION) === region)
      }))
      .filter(g => g.teams.length > 0);
  }, [standings, availableRegions, selectedRegion]);

  return (
    <div className="space-y-6 font-mono text-xs animate-fadeIn">
      <div className={`p-5 rounded-3xl transition-all border ${
        isDarkMode ? "bg-slate-900/50 border-slate-850" : "bg-white border-slate-200 shadow-sm"
      }`}>
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-4 border-b border-slate-800/40 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-500 p-2 rounded-xl text-slate-950">
              <Globe2 className="w-5 h-5" />
            </div>
            <h3 className={`font-bold font-display text-base uppercase tracking-tight ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
              PMGC Race
            </h3>
          </div>

          {availableYears.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className={`p-2.5 rounded-xl border font-bold cursor-pointer text-xs w-full md:w-32 focus:ring-1 focus:ring-amber-500 outline-none ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                >
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              {availableRegions.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Region:</span>
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className={`p-2.5 rounded-xl border font-bold cursor-pointer text-xs w-full md:w-36 focus:ring-1 focus:ring-amber-500 outline-none ${
                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  >
                    <option value="ALL">All Regions</option>
                    {availableRegions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {availableYears.length === 0 ? (
          <div className={`p-4 rounded-xl border text-slate-500 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
            No tournament has been tagged "PMGC Race" yet. Set it up in Add Match Data → Tournament Settings → Tournament Options, on whichever tournaments count toward a year's race.
          </div>
        ) : (
          <>
            {contributingLeagues.length > 0 && (
              <p className="text-slate-500 text-[10px] mb-4">
                Counting: <strong className={isDarkMode ? "text-slate-300" : "text-slate-700"}>{contributingLeagues.join(", ")}</strong>
              </p>
            )}

            {standings.length === 0 ? (
              <div className={`p-6 rounded-xl border text-center text-slate-500 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
                No results recorded yet for {selectedYear}'s contributing tournaments.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800/40">
                <table className="w-full text-left font-mono border-collapse">
                  <thead>
                    <tr className={`text-[10px] uppercase tracking-wider font-bold border-b ${
                      isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      <th className="py-3 px-3 text-center w-12">R</th>
                      <th className="py-3 px-4 text-left">Team</th>
                      <th className="py-3 px-4 text-center w-24">Events</th>
                      <th className="py-3 px-4 text-center text-amber-500 bg-amber-500/5 font-black w-28">PMGC Points</th>
                      <th className="py-3 px-3 text-center w-10" />
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? "divide-slate-850/30" : "divide-slate-100"}`}>
                    {groupedStandings.map(group => (
                      <React.Fragment key={group.region}>
                        {/* Section header - only worth showing when there's more than one group on
                            screen, so a single-region view (or "All Regions" with everyone untagged)
                            doesn't get a redundant header above its own only section. */}
                        {groupedStandings.length > 1 && (
                          <tr>
                            <td colSpan={5} className={`py-2 px-4 text-[9px] font-black uppercase tracking-wider ${
                              isDarkMode ? "bg-slate-950/80 text-sky-400" : "bg-slate-100 text-sky-600"
                            }`}>
                              {group.region} <span className="opacity-60 font-bold">({group.teams.length})</span>
                            </td>
                          </tr>
                        )}
                        {group.teams.map((r, idx) => {
                          const isExpanded = expandedTeam === r.team;
                          return (
                            <React.Fragment key={r.team}>
                              <tr
                                onClick={() => setExpandedTeam(isExpanded ? null : r.team)}
                                className={`cursor-pointer transition-colors ${isDarkMode ? "text-slate-300 hover:bg-slate-950/60" : "text-slate-800 hover:bg-slate-50"}`}
                              >
                                <td className="py-3 px-3 text-center w-12">
                                  <span className={`w-6 h-6 rounded-md inline-flex items-center justify-center font-extrabold text-[10px] ${
                                    idx === 0
                                      ? "bg-amber-500 text-slate-950"
                                      : idx === 1
                                        ? "bg-slate-300 text-slate-950"
                                        : idx === 2
                                          ? "bg-amber-700 text-slate-100"
                                          : isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
                                  }`}>
                                    {idx + 1}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-bold uppercase tracking-tight">
                                  <span className="flex items-center gap-1.5">
                                    {r.team}
                                    {idx === 0 && <Trophy className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center text-slate-500">{r.contributions.length}</td>
                                <td className="py-3 px-4 text-center text-sm font-black bg-amber-500/5 text-amber-500">
                                  {r.pmgcPoints}
                                </td>
                                <td className="py-3 px-3 text-center text-slate-500">
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 mx-auto" /> : <ChevronDown className="w-3.5 h-3.5 mx-auto" />}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={5} className={`px-4 pb-4 ${isDarkMode ? "bg-slate-950/30" : "bg-slate-50"}`}>
                                    <div className="space-y-1.5 pt-2">
                                      {r.contributions.map((c, cIdx) => (
                                        <div key={cIdx} className="flex items-center justify-between text-[10px] px-3 py-1.5 rounded-lg border border-slate-800/40">
                                          <span className={isDarkMode ? "text-slate-300" : "text-slate-700"}>{c.league}</span>
                                          <span className="text-slate-500">Rank #{c.rank}</span>
                                          <span className="text-amber-500 font-bold">+{c.points} pts</span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
