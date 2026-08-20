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

const STAGES: Stage[] = ["group", "survival", "lcq", "final"];
const SIMULATIONS = 100000;

export const WinProbability: React.FC<WinProbabilityProps> = ({ matches, isDarkMode, tournaments }) => {
  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [stage, setStage] = useState<Stage>("group");
  // Each stage keeps its own "how many games total" input, entered here per simulation run - not
  // tied to any persisted Tournament Settings, so this stays a free what-if number.
  const [totalGamesByStage, setTotalGamesByStage] = useState<Record<Stage, string>>({ group: "", survival: "", lcq: "", final: "" });
  const [useSmashRule, setUseSmashRule] = useState(true);
  const [manualTeamsText, setManualTeamsText] = useState<string>("");

  const tournamentPresets = useMemo(() => tournaments || [], [tournaments]);

  const tournamentsList = useMemo(() => {
    const set = new Set<string>();
    matches.forEach(m => { if (m.league) set.add(m.league); });
    tournamentPresets.forEach((t: any) => { if (t.name) set.add(t.name); });
    return Array.from(set).sort();
  }, [matches, tournamentPresets]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Whether this tournament/stage combo has any real match data recorded yet - drives whether the
  // manual "who's playing" team list is needed instead.
  const hasRealDataForStage = useMemo(() => {
    if (!selectedTournament) return false;
    return matches.some(m => {
      if (m.isDailyStats || (m.league || "").trim().toLowerCase() !== selectedTournament.trim().toLowerCase()) return false;
      if (stage === "final") return !!m.isGrandFinal;
      if (stage === "survival") return !!m.isSurvivalStage;
      if (stage === "lcq") return !!m.isLastChanceQualifier;
      return !m.isGrandFinal && !m.isSurvivalStage && !m.isLastChanceQualifier;
    });
  }, [matches, selectedTournament, stage]);

  // Prefills the manual team list from whatever this stage's own team list field already has
  // configured (Tournament Settings) - the admin can still edit it here before running.
  const prefillManualTeams = React.useCallback((): string => {
    if (!currentPreset) return "";
    if (stage === "group") return getTournamentTeamList(currentPreset).join("\n");
    if (stage === "survival") return currentPreset.survivalStageTeamsText || "";
    if (stage === "lcq") return currentPreset.lastChanceQualifierTeamsText || "";
    return currentPreset.grandFinalTeamsText || "";
  }, [currentPreset, stage]);

  // Reset the manual team list draft whenever the tournament/stage changes, seeded from that
  // stage's configured team list if one exists.
  React.useEffect(() => {
    setManualTeamsText(prefillManualTeams());
  }, [selectedTournament, stage]);

  const smashRuleConfigured = !!currentPreset?.smashRuleEnabled && !!currentPreset?.smashRuleLockAfterGame;

  const [results, setResults] = useState<WinProbabilityResult[] | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [ranFor, setRanFor] = useState<{ tournament: string; stage: Stage } | null>(null);
  const [runError, setRunError] = useState<string>("");

  const runSimulation = () => {
    if (!selectedTournament) return;
    const total = Number(totalGamesByStage[stage]) || 0;
    if (total < 1) {
      setRunError("Enter how many total games this stage has first.");
      return;
    }
    setRunError("");
    setIsSimulating(true);
    // Deferred a tick so the "Simulating..." state actually paints before the sync Monte Carlo
    // loop (100,000 iterations) blocks the main thread.
    setTimeout(() => {
      const smashRule = stage === "final" && useSmashRule && smashRuleConfigured ? {
        enabled: true,
        lockAfterGame: currentPreset?.smashRuleLockAfterGame || null,
        bonus: Number(currentPreset?.smashRuleBonus) || 0
      } : undefined;
      const manualTeams = hasRealDataForStage ? undefined : manualTeamsText.split("\n").map(t => t.trim()).filter(Boolean);
      // Grand Final's one-time starting bonus (Tournament Settings) applies whether or not any
      // real match has been played yet - a fresh Grand Final that hasn't started still has a
      // seeded bonus to simulate from.
      const startingBonus = stage === "final" ? currentPreset?.grandFinalBonusByTeam : undefined;
      const out = simulateWinProbability(matches, selectedTournament, stage, total, canonicalizeTeam, smashRule, SIMULATIONS, manualTeams, startingBonus);
      if (out.length === 0) {
        setRunError(hasRealDataForStage
          ? "Not enough match data recorded yet to simulate this stage."
          : "Enter at least 2 teams in the list below to simulate this stage.");
        setResults(null);
        setRanFor(null);
      } else {
        setResults(out);
        setRanFor({ tournament: selectedTournament, stage });
      }
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

        {/* Stage picker - always all four; picking one scopes which teams are relevant below. */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {STAGES.map(s => (
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

        {/* Run controls: total games (free input, per simulation), Smash Rule toggle for Grand
            Final only, and (if this stage has no real match data yet) a manual team list. */}
        <div className={`p-4 rounded-xl border space-y-3 mb-4 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Total Games ({STAGE_LABEL[stage]})</label>
              <input
                type="number"
                min={1}
                value={totalGamesByStage[stage]}
                onChange={(e) => setTotalGamesByStage(prev => ({ ...prev, [stage]: e.target.value }))}
                placeholder="e.g. 18"
                className={`w-36 p-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              />
            </div>

            {stage === "final" && smashRuleConfigured && (
              <label className="flex items-center gap-2 cursor-pointer select-none pb-2">
                <input type="checkbox" checked={useSmashRule} onChange={(e) => setUseSmashRule(e.target.checked)} className="w-4 h-4 accent-amber-500 cursor-pointer" />
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Apply Smash Rule</span>
              </label>
            )}

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

          {!hasRealDataForStage && (
            <div className="space-y-1 pt-1">
              <label className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                No match data yet for {STAGE_LABEL[stage]} - enter the teams playing (one per line)
              </label>
              <textarea
                value={manualTeamsText}
                onChange={(e) => setManualTeamsText(e.target.value)}
                rows={5}
                placeholder={"Team A\nTeam B\nTeam C\n..."}
                className={`w-full p-2.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
              />
              <p className="text-[9px] text-slate-500">
                Every simulated game gives each team an equally random placement (nothing real to base form on yet) - once actual results are entered for this stage, re-run to switch to results-based simulation automatically.
              </p>
            </div>
          )}

          {runError && (
            <p className="text-[10px] text-red-400 font-bold">{runError}</p>
          )}

          <p className="text-slate-500 text-[9px]">
            Based on {SIMULATIONS.toLocaleString()} simulations{hasRealDataForStage ? ", bootstrapped from each team's own results so far" : ""}.
          </p>
        </div>

        {!results || isStale ? (
          <div className={`p-6 rounded-xl border text-center text-slate-500 ${isDarkMode ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-200"}`}>
            {results && isStale ? "Tournament/stage changed - run the simulation again to refresh these numbers." : "Click \"Run Simulation\" to compute win probability."}
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
      </div>
    </div>
  );
};
