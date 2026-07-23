import { Match } from "./types";

export const calculatePlacementPoints = (placement: number): number => {
  const p = Number(placement) || 0;
  if (p === 1) return 10;
  if (p === 2) return 6;
  if (p === 3) return 5;
  if (p === 4) return 4;
  if (p === 5) return 3;
  if (p === 6) return 2;
  if (p === 7 || p === 8) return 1;
  return 0;
};

// Pulls just the Week number out of a matchCode, e.g. "W2D3" -> "Week 2".
// Returns null when no week is encoded (not every league uses a week structure).
export const getMatchWeekLabel = (match: Match): string | null => {
  const code = (match.matchCode || "").toUpperCase();
  const weekMatch = code.match(/W(\d+)/);
  return weekMatch ? `Week ${weekMatch[1]}` : null;
};

export interface LeagueRankStanding {
  team: string;
  totalLeaguePoints: number;
  weeklyPoints: { week: string; rank: number; points: number }[];
}

// League Rank Points: at the end of each week, teams are ranked by that week's total points
// (placement + kills + bonus, summed across that week's matches), and that weekly RANK itself
// (not the raw points) is converted into "League Points" via a tournament-specific table.
// League Points accumulate across weeks, separately from the raw/overall standings total -
// used e.g. to seed a team's Bonus Point going into the Grand Final.
export const calculateLeagueRankStandings = (
  matches: Match[],
  leagueName: string,
  pointsTable: number[],
  tiebreaker: "WWCD-PlacementPoint-Kill" | "WWCD-Kill-PlacementPoint" = "WWCD-PlacementPoint-Kill"
): LeagueRankStanding[] => {
  const relevantMatches = matches.filter(m =>
    !m.isDailyStats && !m.isGrandFinal && m.league === leagueName && getMatchWeekLabel(m) !== null
  );

  const byWeek: Record<string, Match[]> = {};
  relevantMatches.forEach(m => {
    const week = getMatchWeekLabel(m) as string;
    if (!byWeek[week]) byWeek[week] = [];
    byWeek[week].push(m);
  });

  const teamAgg: Record<string, LeagueRankStanding> = {};

  Object.entries(byWeek).forEach(([week, weekMatches]) => {
    const weekTeamTotals: Record<string, { totalPoints: number; wwcdCount: number; placementPoints: number; eliminationPoints: number }> = {};

    weekMatches.forEach(m => {
      m.teams.forEach(t => {
        const name = t.name.trim();
        if (!name) return;
        if (!weekTeamTotals[name]) {
          weekTeamTotals[name] = { totalPoints: 0, wwcdCount: 0, placementPoints: 0, eliminationPoints: 0 };
        }
        weekTeamTotals[name].totalPoints += Number(t.totalPoints) || 0;
        weekTeamTotals[name].wwcdCount += t.placement === 1 ? 1 : 0;
        weekTeamTotals[name].placementPoints += Number(t.placementPoints) || 0;
        weekTeamTotals[name].eliminationPoints += Number(t.eliminationPoints) || 0;
      });
    });

    const ranked = Object.entries(weekTeamTotals).sort(([, a], [, b]) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.wwcdCount !== a.wwcdCount) return b.wwcdCount - a.wwcdCount;
      if (tiebreaker === "WWCD-PlacementPoint-Kill") {
        if (b.placementPoints !== a.placementPoints) return b.placementPoints - a.placementPoints;
        return b.eliminationPoints - a.eliminationPoints;
      }
      if (b.eliminationPoints !== a.eliminationPoints) return b.eliminationPoints - a.eliminationPoints;
      return b.placementPoints - a.placementPoints;
    });

    ranked.forEach(([teamName], idx) => {
      const rank = idx + 1;
      const points = pointsTable[rank - 1] || 0;
      if (!teamAgg[teamName]) {
        teamAgg[teamName] = { team: teamName, totalLeaguePoints: 0, weeklyPoints: [] };
      }
      teamAgg[teamName].totalLeaguePoints += points;
      teamAgg[teamName].weeklyPoints.push({ week, rank, points });
    });
  });

  return Object.values(teamAgg).sort((a, b) => b.totalLeaguePoints - a.totalLeaguePoints);
};

