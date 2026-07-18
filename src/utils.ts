import { Match, Team, Player } from "./types";

export const PUBGM_WEAPONS = [
  "M416", "M762", "SCAR-L", "AKM", "AWM", "Micro UZI", "UMP45", "AMR", "M24", "Mini14", 
  "DP-28", "SLR", "DBS", "AUG", "FAMAS", "Groza", "MK14", "S12K", "Thompson SMG", "Vector", "SKS"
].sort();

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

/**
 * Parses Tab-separated or Comma-separated spreadsheet data for PUBG Mobile Match logs.
 * Supports pasting rows from Google Sheets / Excel directly.
 */
export const parsePUBGMSpreadsheet = (text: string, defaultLeague: string = "PMSL SEA 2026"): Match[] => {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && !lines[0].trim())) {
    throw new Error("Teks kosong! Silakan tempelkan data spreadsheet terlebih dahulu.");
  }

  const rows: string[][] = [];
  lines.forEach((line) => {
    if (!line.trim()) return;
    let cells: string[] = [];
    if (line.includes("\t")) {
      cells = line.split("\t");
    } else {
      cells = line.split(",");
    }
    cells = cells.map(c => c.trim().replace(/^"|"$/g, ''));
    rows.push(cells);
  });

  if (rows.length === 0) {
    throw new Error("Tidak ada baris data yang valid ditemukan.");
  }

  let startIdx = 0;
  const firstRowStr = rows[0].join(" ").toLowerCase();
  let hasHeaders = false;
  if (
    firstRowStr.includes("date") || 
    firstRowStr.includes("tanggal") ||
    firstRowStr.includes("match") || 
    firstRowStr.includes("role") || 
    firstRowStr.includes("player") ||
    firstRowStr.includes("placement") ||
    firstRowStr.includes("posisi") ||
    firstRowStr.includes("tim") ||
    firstRowStr.includes("team")
  ) {
    startIdx = 1;
    hasHeaders = true;
  }

  // Determine column indexes based on headers or defaults
  let dateIdx = 0;
  let matchCodeIdx = 1;
  let leagueIdx = 2;
  let gameNoIdx = 3;
  let mapIdx = 4;
  let patchIdx = 5;
  let liveLinkIdx = 6;
  let teamNameIdx = 7;
  let placementIdx = 8;
  let playerNameIdx = 9;
  let roleIdx = 10;
  let weaponIdx = 11;
  let elimsIdx = 12;
  let assistsIdx = 13;
  let damageIdx = 14;
  let survivalTimeIdx = 15;
  let knocksIdx = 16;
  let healsIdx = 17;
  let mvpIdx = 18;

  // Check sample row length to see if it's a simplified layout
  const sampleRow = rows.find(r => r.length >= 5) || rows[0];
  const isSimplifiedFormat = sampleRow.length <= 10;

  if (isSimplifiedFormat) {
    // Simplified: Date, Match_Code, League, Game_No, Map, Link_Stream, Team_Name, Placement, Elims
    dateIdx = 0;
    matchCodeIdx = 1;
    leagueIdx = 2;
    gameNoIdx = 3;
    mapIdx = 4;
    liveLinkIdx = 5;
    teamNameIdx = 6;
    placementIdx = 7;
    elimsIdx = 8;
    patchIdx = -1;
    playerNameIdx = -1;
  }

  if (hasHeaders) {
    const headers = rows[0].map(h => h.toLowerCase().trim());
    
    const findIdx = (keywords: string[], defaultVal: number): number => {
      const idx = headers.findIndex(h => keywords.some(k => h === k || h.includes(k)));
      return idx !== -1 ? idx : defaultVal;
    };

    if (isSimplifiedFormat) {
      dateIdx = findIdx(["date", "tanggal"], 0);
      matchCodeIdx = findIdx(["match_code", "match code", "kode"], 1);
      leagueIdx = findIdx(["league", "liga", "kompetisi"], 2);
      gameNoIdx = findIdx(["game_no", "game no", "game ke", "game_ke", "match ke", "round"], 3);
      mapIdx = findIdx(["map"], 4);
      liveLinkIdx = findIdx(["live_link", "live link", "link", "stream"], 5);
      teamNameIdx = findIdx(["team_name", "team", "tim", "squad"], 6);
      placementIdx = findIdx(["placement", "posisi"], 7);
      elimsIdx = findIdx(["elims", "kill", "elimination"], 8);
    } else {
      dateIdx = findIdx(["date", "tanggal"], 0);
      matchCodeIdx = findIdx(["match_code", "match code", "kode"], 1);
      leagueIdx = findIdx(["league", "liga", "kompetisi"], 2);
      gameNoIdx = findIdx(["game_no", "game no", "game ke", "game_ke", "match ke", "round"], 3);
      mapIdx = findIdx(["map"], 4);
      patchIdx = findIdx(["patch"], 5);
      liveLinkIdx = findIdx(["live_link", "live link", "link", "stream"], 6);
      teamNameIdx = findIdx(["team_name", "team", "tim", "squad"], 7);
      placementIdx = findIdx(["placement", "posisi"], 8);
      
      playerNameIdx = findIdx(["player_name", "player", "pemain", "nama_pemain"], 9);
      roleIdx = findIdx(["role", "peran"], 10);
      weaponIdx = findIdx(["weapon", "senjata"], 11);
      elimsIdx = findIdx(["elims", "kill", "elimination"], 12);
      assistsIdx = findIdx(["assists", "assist"], 13);
      damageIdx = findIdx(["damage", "dmg"], 14);
      survivalTimeIdx = findIdx(["survival_time", "survival", "waktu"], 15);
      knocksIdx = findIdx(["knocks", "knock"], 16);
      healsIdx = findIdx(["heals", "heal"], 17);
      mvpIdx = findIdx(["mvp"], 18);
    }
  }

  // State to propagate from previous rows
  let lastDate = "";
  let lastMatchCode = "";
  let lastLeague = defaultLeague;
  let lastGameNo = "1";
  let lastMap = "Erangel";
  let lastPatch = "";
  let lastLiveLink = "";
  let lastTeamName = "";
  let lastPlacement = 16;

  const matchGroups: { [key: string]: {
    meta: {
      date: string;
      matchCode: string;
      league: string;
      gameNo: string;
      map: string;
      patch: string;
      liveLink: string;
    };
    teams: {
      [teamName: string]: {
        name: string;
        placement: number;
        eliminationPoints?: number;
        players: Player[];
      }
    };
  }} = {};

  const parseNumber = (val: any): number => {
    if (val === undefined || val === null) return 0;
    const str = String(val).trim();
    if (!str) return 0;
    const clean = str.replace(/[^0-9-]/g, "");
    return parseInt(clean, 10) || 0;
  };

  const parseBool = (val: any): boolean => {
    if (!val) return false;
    const str = String(val).trim().toUpperCase();
    return str === "TRUE" || str === "Y" || str === "YES" || str === "1" || str === "YA" || str === "WIN" || str === "WWCD";
  };

  const parseDateString = (dateStr: string): string => {
    if (!dateStr) return new Date().toISOString().split("T")[0];
    const clean = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      return clean;
    }
    const parts = clean.split(/[-/]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      let year = parseInt(parts[2]);
      if (year < 100) {
        year += 2000;
      }
      const yStr = year.toString();
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${yStr}-${mStr}-${dStr}`;
    }
    return clean;
  };

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 3) continue;

    let date = "";
    let matchCode = "";
    let league = "";
    let gameNo = "";
    let map = "";
    let patch = "";
    let liveLink = "";
    let teamName = "";
    let placement = 16;
    let eliminationPoints = 0;

    if (dateIdx < r.length && r[dateIdx]) lastDate = parseDateString(r[dateIdx]);
    if (matchCodeIdx !== -1 && matchCodeIdx < r.length && r[matchCodeIdx]) lastMatchCode = r[matchCodeIdx];
    if (leagueIdx !== -1 && leagueIdx < r.length && r[leagueIdx]) lastLeague = r[leagueIdx];
    if (gameNoIdx !== -1 && gameNoIdx < r.length && r[gameNoIdx]) lastGameNo = r[gameNoIdx];
    if (mapIdx !== -1 && mapIdx < r.length && r[mapIdx]) lastMap = r[mapIdx];
    if (patchIdx !== -1 && patchIdx < r.length && r[patchIdx]) lastPatch = r[patchIdx];
    if (liveLinkIdx !== -1 && liveLinkIdx < r.length && r[liveLinkIdx]) lastLiveLink = r[liveLinkIdx];

    date = lastDate || new Date().toISOString().split("T")[0];
    matchCode = lastMatchCode || "";
    league = lastLeague || defaultLeague;
    gameNo = lastGameNo || "1";
    map = lastMap || "Erangel";
    patch = lastPatch || "";
    liveLink = lastLiveLink || "";

    if (teamNameIdx < r.length && r[teamNameIdx]) lastTeamName = r[teamNameIdx];
    if (placementIdx < r.length && r[placementIdx]) lastPlacement = parseNumber(r[placementIdx]) || 16;

    teamName = lastTeamName || "Unknown Team";
    placement = lastPlacement;

    const groupKey = `${matchCode || league}||${gameNo}`.trim();
    if (!matchGroups[groupKey]) {
      matchGroups[groupKey] = {
        meta: { date, matchCode, league, gameNo, map, patch, liveLink },
        teams: {}
      };
    }

    if (!matchGroups[groupKey].teams[teamName]) {
      matchGroups[groupKey].teams[teamName] = {
        name: teamName,
        placement,
        eliminationPoints: 0,
        players: []
      };
    }

    const teamObj = matchGroups[groupKey].teams[teamName];

    const hasPlayer = !isSimplifiedFormat && playerNameIdx !== -1 && playerNameIdx < r.length && r[playerNameIdx] && r[playerNameIdx].trim().length > 0;

    if (hasPlayer) {
      const name = r[playerNameIdx];
      const rawRole = (roleIdx !== -1 && roleIdx < r.length && r[roleIdx]) || "PLAYER";
      let normalizedRole = "PLAYER";
      const upperRole = rawRole.toUpperCase().trim();
      if (upperRole.includes("COACH") || upperRole.includes("PELATIH")) {
        normalizedRole = "COACH";
      } else if (upperRole.includes("ANALIS") || upperRole.includes("ANALYST")) {
        normalizedRole = "ANALIS";
      }
      const weapon = (weaponIdx !== -1 && weaponIdx < r.length && r[weaponIdx]) || "M416";
      const elims = elimsIdx !== -1 && elimsIdx < r.length ? parseNumber(r[elimsIdx]) : 0;
      const assists = assistsIdx !== -1 && assistsIdx < r.length ? parseNumber(r[assistsIdx]) : 0;
      const damage = damageIdx !== -1 && damageIdx < r.length ? parseNumber(r[damageIdx]) : 0;
      const survivalTime = (survivalTimeIdx !== -1 && survivalTimeIdx < r.length && r[survivalTimeIdx]) || "15:00";
      const knocks = knocksIdx !== -1 && knocksIdx < r.length ? parseNumber(r[knocksIdx]) : 0;
      const heals = healsIdx !== -1 && healsIdx < r.length ? parseNumber(r[healsIdx]) : 0;
      const mvp = mvpIdx !== -1 && mvpIdx < r.length ? parseBool(r[mvpIdx]) : false;

      teamObj.players.push({
        name,
        role: normalizedRole,
        weapon,
        elims,
        assists,
        damage,
        survivalTime,
        knocks,
        heals,
        mvp
      });
    } else {
      const teamElims = elimsIdx !== -1 && elimsIdx < r.length ? parseNumber(r[elimsIdx]) : 0;
      teamObj.eliminationPoints = teamElims;
    }
  }

  const parsedMatches: Match[] = [];
  Object.entries(matchGroups).forEach(([_, group]) => {
    const teamsList: Team[] = [];
    Object.entries(group.teams).forEach(([teamName, teamData]: [string, any]) => {
      const totalElims = teamData.players.length > 0
        ? teamData.players.reduce((sum: number, p: any) => sum + p.elims, 0)
        : (teamData.eliminationPoints || 0);
      const placementPoints = calculatePlacementPoints(teamData.placement);
      
      teamsList.push({
        name: teamName,
        placement: teamData.placement,
        placementPoints,
        eliminationPoints: totalElims,
        totalPoints: placementPoints + totalElims,
        wwcd: teamData.placement === 1,
        players: teamData.players
      });
    });

    if (teamsList.length > 0) {
      parsedMatches.push({
        date: group.meta.date,
        matchCode: group.meta.matchCode,
        league: group.meta.league,
        totalGame: group.meta.gameNo,
        gameNo: group.meta.gameNo,
        map: group.meta.map,
        patch: group.meta.patch,
        liveLink: group.meta.liveLink,
        teams: teamsList.sort((a, b) => a.placement - b.placement)
      });
    }
  });

  return parsedMatches;
};
