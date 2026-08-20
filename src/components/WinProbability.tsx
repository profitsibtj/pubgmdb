import React, { useState, useMemo } from "react";
import { Match } from "../types";
import { getTournamentTeamList, canonicalizeTeamName, simulateWinProbability, WinProbabilityResult } from "../utils";
import { Dices, TrendingUp, RefreshCw, Trophy } from "lucide-react";

interface WinProbabilityProps {
  matches: Match[];
  isDarkMode: boolean;
  tournaments?: any[];
}

type Stage = "group" | "survival" | "lcq" | "final";

const STAGE_LABEL: Record<Stage, string> = {
  group: "Group Stage",
  survival: "Survival Stage",
  lcq: "Last Chance Qualifier",
  final: "Grand Final"
};

const SIMULATIONS = 100000;

export const WinProbability: React.FC<WinProbabilityProps> = ({ matches, isDarkMode, tournaments }) => {
  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [stage, setStage] = useState<Stage>("group");
  const [runToken, setRunToken] = useState(0);

  const tournamentPresets = useMemo(() => tournaments || [], [tournaments]);

  const tournamentsList = useMemo(() => {
    const set = new Set<string>();
    matches.forEach(m => { if (m.league) set.add(m.league); });
    return Array.from(set).sort();
  }, [matches]);

  const activeTournamentName = useMemo(() => {
    const active = tournamentPresets.find((t: any) => t.highlighted);
    return active?.name || null;
  }, [tournamentPresets]);

  // First time a highlighted tournament becomes available, prefer it over whichever league
  // happens to be first in the list.
  const hasAppliedHighlightDefault = React.useRef(false);
  React.useEffect(() => {
    if (tournamentsList.length === 0) return;
    if (!hasAppliedHighlightDefault.current && activeTournamentName && tournamentsList.includes(activeTournamentName)) {
      hasAppliedHighlightDefault.current = true;
      setSelectedTournament(activeTournamentName);
      return;
    }
    if (!selectedTournament || !tournamentsList.includes(selectedTournament)) {
      setSelectedTournament(tournamentsList[0]);
    }
  }, [tournamentsList, activeTournamentName]);

  const currentPreset = useMemo(() => {
    if (!selectedTournament) return null;
    return tournamentPresets.find((t: any) => t.name === selectedTournament) || null;
  }, [selectedTournament, tournamentPresets]);

  const canonicalTeamList = useMemo(() => getTournamentTeamList(currentPreset), [currentPreset]);
  const canonicalizeTeam = React.useCallback(
    (rawName: string) => canonicalizeTeamName(rawName, canonicalTeamList, currentPreset?.teamAbbreviations),
    [canonicalTeamList, currentPreset]
  );

  const totalGamesForStage = (s: Stage): number | undefined => {
    if (s === "group") return currentPreset?.groupStageTotalGames;
    if (s === "survival") return currentPreset?.survivalStageTotalGames;
    if (s === "lcq") return currentPreset?.lastChanceQualifierTotalGames;
    return currentPreset?.smashRuleTotalGames;
  };

  // Which stages actually have both matches AND a configured Total Games count - a stage missing
  // either stays hidden instead of showing a tab that can't produce a result.
  const availableStages = useMemo(() => {
    if (!selectedTournament) return [];
    const stages: Stage[] = ["group", "survival", "lcq", "final"];
    return stages.filter(s => {
      const total = totalGamesForStage(s);
      if (!total || total < 1) return false;
      return matches.some(m => {
        if (m.isDailyStats || (m.league || "").trim().toLowerCase() !== selectedTournament.trim().toLowerCase()) return false;
        if (s === "final") return !!m.isGrandFinal;
        if (s === "survival") return !!m.isSurvivalStage;
        if (s === "lcq") return !!m.isLastChanceQualifier;
        return !m.isGrandFinal && !m.isSurvivalStage && !m.isLastChanceQualifier;
      });
    });
  }, [matches, selectedTournament, currentPreset]);

  React.useEffect(() => {
    if (availableStages.length > 0 && !availableStages.includes(stage)) {
      setStage(availableStages[0]);
    }
  }, [availableStages]);

  const [results, setResults] = useState<WinProbabilityResult[] | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [ranFor, setRanFor] = useState<{ tournament: string; stage: Stage } | null>(null);

  const runSimulation = () => {
    if (!selectedTournament) return;
    const total = totalGamesForStage(stage);
    if (!total) return;
    setIsSimulating(true);
    // Deferred a tick so the "Simulating..." state actually paints before the sync Monte Carlo
    // loop (100,000 iterations) blocks the main thread.
    setTimeout(() => {
      const smashRule = stage === "final" ? {
        enabled: !!currentPreset?.smashRuleEnabled,
        lockAfterGame: currentPreset?.smashRuleLockAfterGame || null,
        bonus: Number(currentPreset?.smashRuleBonus) || 0
      } : undefined;
      const out = simulateWinProbability(matches, selectedTournament, stage, total, canonicalizeTeam, smashRule, SIMULATIONS);
      setResults(out);
      setRanFor({ tournament: selectedTournament, stage });
      setIsSimulating(false);
    }, 30);
  };

  const isStale = !ranFor || ranFor.tournament !== selectedTournament || ranFor.stage !== stage;

  return (
    <div className="space-y-6 font-mono text-xs animate-fadeIn">
      <div className={`p-5 rounded-3xl transition-all border ${
        isDarkMode ? "bg-slate-900/50 border-slate-850" : "bg-white border-slate-200 shadow-sm"
      }`}>
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-4 border-b border-slate-800/40 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-500 p-2 rounded-xl text-slate-950">
              <Dices className="w-5 h-5" />
            </div>
            <h3 className={`font-bold font-display text-base uppercase tracking-tight ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
              Win Probability
            </h3>
          </div>

          <div className="flex items-center gap-1.5 w-full md:w-auto">
            <span className="text-slate-500 text-[9px] font-bold uppercase shrink-0">Tournament:</span>
            <select
              value={selectedTournament}
              onChange={(e) => setSelectedTournament(e.target.value)}
              className={`p-2.5 rounded-xl border font-bold cursor-pointer text-xs w-full md:w-48 focus:ring-1 focus:ring-amber-500 outline-none ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            >
              {tournamentsList.length === 0 ? (
                <option value="">No Data Yet</option>
              ) : (
                tournamentsList.map(t => (
                  <option key={t} value={t}>{t === activeTournamentName ? `★ ${t}` : t}</option>
                ))
              )}
            </select>
          </div>
        </div>

        {availableStages.length === 0 ? (
          <div className={`p-4 rounded-xl border text-slate-500 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
            No stage here has both match data and a "Total Games" count set yet. Configure "Win Probability: Total Games Per Stage" (and Grand Final's Smash Rule "Total Scheduled Games") in Add Match Data → Tournament Settings first.
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              {availableStages.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                    stage === s
                      ? "bg-amber-500 text-slate-950 border-amber-500"
                      : isDarkMode ? "bg-slate-950 text-slate-400 border-slate-800 hover:text-white" : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"
                  }`}
                >
                  {STAGE_LABEL[s]}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <p className="text-slate-500 text-[10px]">
                {totalGamesForStage(stage)} games total for {STAGE_LABEL[stage]} · based on {SIMULATIONS.toLocaleString()} simulations, bootstrapped from each team's own results so far
              </p>
              <button
                type="button"
                onClick={runSimulation}
                disabled={isSimulating}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-mono text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all flex items-center gap-2 shadow-md shadow-amber-500/10"
              >
                {isSimulating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Simulating…
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-3.5 h-3.5" />
                    {results && !isStale ? "Re-run Simulation" : "Run Simulation"}
                  </>
                )}
              </button>
            </div>

            {!results || isStale ? (
              <div className={`p-6 rounded-xl border text-center text-slate-500 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
                {results && isStale ? "Tournament/stage changed - run the simulation again to refresh these numbers." : "Click \"Run Simulation\" to compute win probability."}
              </div>
            ) : results.length === 0 ? (
              <div className={`p-6 rounded-xl border text-center text-slate-500 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
                Not enough match data recorded yet for {STAGE_LABEL[stage]} to simulate.
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
                      <th className="py-3 px-4 text-center w-28">Current Points</th>
                      <th className="py-3 px-4 text-center w-28">Max Points</th>
                      <th className="py-3 px-4 text-center text-amber-500 bg-amber-500/5 font-black w-28">Win %</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? "divide-slate-850/30" : "divide-slate-100"}`}>
                    {results.map((r, idx) => (
                      <tr key={r.team} className={isDarkMode ? "text-slate-300 hover:bg-slate-950/60" : "text-slate-800 hover:bg-slate-50"}>
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
                        <td className="py-3 px-4 text-center">{r.currentPoints}</td>
                        <td className="py-3 px-4 text-center text-slate-500">{r.maxPoints}</td>
                        <td className="py-3 px-4 text-center text-sm font-black bg-amber-500/5 text-amber-500">
                          {r.winProbability.toFixed(2)}%
                        </td>
                      </tr>
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
