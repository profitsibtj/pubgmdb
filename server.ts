import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { getSupabase } from "./src/supabaseClient.ts";

// Helper mappings for Supabase (snake_case columns to camelCase frontend)
const mapMatchFromDb = (row: any) => {
  if (!row) return null;
  return {
    id: String(row.id),
    date: row.date || "",
    matchCode: row.match_code || "",
    league: row.league || "",
    totalGame: row.total_game || "1",
    gameNo: row.game_no || "1",
    map: row.map || "Erangel",
    liveLink: row.live_link || "",
    teams: row.teams || [],
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
};

const mapMatchToDb = (data: any) => {
  return {
    date: data.date || null,
    match_code: data.matchCode || null,
    league: data.league || null,
    total_game: data.totalGame ? String(data.totalGame) : null,
    game_no: data.gameNo ? String(data.gameNo) : null,
    map: data.map || null,
    live_link: data.liveLink || null,
    teams: data.teams || null,
  };
};

const mapRosterFromDb = (row: any) => {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name || "",
    role: row.role || "",
    team: row.team || "",
    league: row.league || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
};

const mapRosterToDb = (player: any) => {
  return {
    name: player.name || "",
    role: player.role || null,
    team: player.team || null,
    league: player.league || null,
  };
};

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Credentials loaded dynamically from environment
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
const ACTION_PASSWORD = process.env.ACTION_PASSWORD;

if (!ACCESS_PASSWORD || !ACTION_PASSWORD) {
  console.warn("⚠️ WARNING: ACCESS_PASSWORD and/or ACTION_PASSWORD are not set in environment variables! Please configure them via the Settings panel in AI Studio.");
}

// Auth middleware for internal API calls
const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Unauthorized: Missing Authorization Header" });
    return;
  }
  const token = authHeader.replace("Bearer ", "");
  const isValidAccess = !!ACCESS_PASSWORD && token === ACCESS_PASSWORD;
  if (!isValidAccess) {
    res.status(401).json({ error: "Unauthorized: Invalid Password" });
    return;
  }
  next();
};

// Auth middleware for administrative actions
const checkAdminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.password as string;
  const headerToken = req.headers["x-password"] as string;
  const bodyToken = req.body?.password as string;
  
  const token = (authHeader ? authHeader.replace("Bearer ", "") : "") || queryToken || headerToken || bodyToken;

  if (!token) {
    res.status(401).json({ error: "Unauthorized: Missing Authorization Password" });
    return;
  }
  const isValidAdmin = (!!ACTION_PASSWORD && token === ACTION_PASSWORD) || (!!ACCESS_PASSWORD && token === ACCESS_PASSWORD);
  if (!isValidAdmin) {
    res.status(401).json({ error: "Unauthorized: Invalid Action Password. Akses dibatasi." });
    return;
  }
  next();
};

// Auth Endpoint
app.post("/api/auth", (req, res) => {
  const { password } = req.body;
  if (!!ACCESS_PASSWORD && password === ACCESS_PASSWORD) {
    res.json({ success: true, token: password });
  } else {
    res.status(401).json({ success: false, error: "Password salah! Silakan coba lagi." });
  }
});

// Action Verification Endpoint
app.post("/api/verify-action", (req, res) => {
  const { password } = req.body;
  if ((!!ACTION_PASSWORD && password === ACTION_PASSWORD) || (!!ACCESS_PASSWORD && password === ACCESS_PASSWORD)) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: "Password salah! Hanya admin dengan password aksi yang memiliki wewenang ini." });
  }
});

// Map standard PUBGM placement points system
const calculatePlacementPoints = (placement: number): number => {
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

// Format Match Data to compute percentages and totals dynamically
const formatMatchData = (match: any) => {
  const teams = match.teams || [];
  const formattedTeams = teams.map((team: any) => {
    const players = team.players || [];
    const teamTotalElims = players.length > 0
      ? players.reduce((sum: number, p: any) => sum + (Number(p.elims) || 0), 0)
      : (Number(team.eliminationPoints) || 0);
    const teamTotalDamage = players.reduce((sum: number, p: any) => sum + (Number(p.damage) || 0), 0);

    const formattedPlayers = players.map((player: any) => {
      const elims = Number(player.elims) || 0;
      const damage = Number(player.damage) || 0;
      return {
        ...player,
        elims,
        assists: Number(player.assists) || 0,
        damage,
        knocks: Number(player.knocks) || 0,
        heals: Number(player.heals) || 0,
        mvp: !!player.mvp,
        elimsPercent: teamTotalElims > 0 ? Math.round((elims / teamTotalElims) * 1000) / 10 : 0,
        dmgPercent: teamTotalDamage > 0 ? Math.round((damage / teamTotalDamage) * 1000) / 10 : 0
      };
    });

    const placement = Number(team.placement) || 16;
    return {
      ...team,
      placement,
      placementPoints: calculatePlacementPoints(placement),
      eliminationPoints: teamTotalElims,
      totalPoints: calculatePlacementPoints(placement) + teamTotalElims,
      wwcd: placement === 1,
      players: formattedPlayers
    };
  });

  return { ...match, teams: formattedTeams };
};

// Helper: Sort matches by Date and Round/Game descending
const sortMatches = (matchesList: any[]) => {
  const getNumericValue = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const numMatch = String(val).match(/\d+/);
    return numMatch ? parseInt(numMatch[0], 10) : 0;
  };

  return [...matchesList].sort((a, b) => {
    const dateA = a.date || "";
    const dateB = b.date || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);

    const totalGameA = getNumericValue(a.totalGame);
    const totalGameB = getNumericValue(b.totalGame);
    if (totalGameA !== totalGameB) return totalGameB - totalGameA;

    const codeA = a.matchCode || "";
    const codeB = b.matchCode || "";
    if (codeA !== codeB) return codeB.localeCompare(codeA, undefined, { numeric: true });

    return getNumericValue(b.gameNo) - getNumericValue(a.gameNo);
  });
};

// Matches Endpoints
app.get("/api/matches", checkAuth, async (req, res) => {
  try {
    const { data: rawMatches, error } = await getSupabase().from("matches").select("*");
    if (error) {
      if (error.code === "PGRST205" || error.message?.includes("relation \"matches\" does not exist")) {
        return res.status(409).json({
          error: "DATABASE_SETUP_NEEDED",
          message: "Tabel 'matches' belum dibuat di database Supabase Anda."
        });
      }
      throw error;
    }
    const formatted = (rawMatches || []).map(m => mapMatchFromDb(m));
    res.json(sortMatches(formatted.map(m => formatMatchData(m))));
  } catch (error: any) {
    console.error("Error in GET /api/matches:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/matches", checkAdminAuth, async (req, res) => {
  try {
    const dbObj: any = mapMatchToDb(req.body);
    dbObj.created_at = new Date().toISOString();
    const { data, error } = await getSupabase().from("matches").insert([dbObj]).select("id").single();
    if (error) throw error;

    res.json({ success: true, id: String(data.id) });
  } catch (error: any) {
    console.error("Error in POST /api/matches:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/matches/:id", checkAdminAuth, async (req, res) => {
  try {
    const { error } = await getSupabase().from("matches").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/matches:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/matches/:id", checkAdminAuth, async (req, res) => {
  try {
    const dbObj: any = mapMatchToDb(req.body);
    dbObj.updated_at = new Date().toISOString();
    const { error } = await getSupabase().from("matches").update(dbObj).eq("id", req.params.id);
    if (error) throw error;

    res.json({ success: true, id: req.params.id });
  } catch (error: any) {
    console.error("Error in PUT /api/matches:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/roster", async (req, res) => {
  try {
    const { data: rawRoster, error } = await getSupabase().from("roster").select("*");
    if (error) {
      if (error.code === "PGRST205" || error.message?.includes("relation \"roster\" does not exist")) {
        return res.status(409).json({
          error: "DATABASE_SETUP_NEEDED",
          message: "Tabel 'roster' belum dibuat di database Supabase Anda."
        });
      }
      throw error;
    }

    res.json((rawRoster || []).map(r => mapRosterFromDb(r)));
  } catch (error: any) {
    console.error("Error in GET /api/roster:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/roster", async (req, res) => {
  try {
    const { password, player } = req.body;
    const isValidAdmin = (!!ACTION_PASSWORD && password === ACTION_PASSWORD) || (!!ACCESS_PASSWORD && password === ACCESS_PASSWORD);
    if (!isValidAdmin) {
      return res.status(401).json({ error: "Password salah! Hanya admin yang bisa mengedit roster." });
    }

    if (player.id) {
      const dbObj: any = mapRosterToDb(player);
      dbObj.updated_at = new Date().toISOString();
      const { error } = await getSupabase().from("roster").update(dbObj).eq("id", player.id);
      if (error) throw error;
      
      res.json({ success: true, id: player.id });
    } else {
      const dbObj: any = mapRosterToDb(player);
      dbObj.created_at = new Date().toISOString();
      const { data: inserted, error } = await getSupabase().from("roster").insert([dbObj]).select("id").single();
      if (error) throw error;
      
      res.json({ success: true, id: String(inserted.id) });
    }
  } catch (error: any) {
    console.error("Error in POST /api/roster:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/roster/:id", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const authPass = authHeader ? authHeader.replace("Bearer ", "") : "";
    const reqPassword = req.body.password || req.query.password || req.headers["x-password"] || authPass;

    const isValidAdmin = (!!ACTION_PASSWORD && reqPassword === ACTION_PASSWORD) || (!!ACCESS_PASSWORD && reqPassword === ACCESS_PASSWORD);
    if (!isValidAdmin) {
      return res.status(401).json({ error: "Password salah! Hanya admin yang bisa menghapus roster." });
    }

    const { error } = await getSupabase().from("roster").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/roster:", error);
    res.status(500).json({ error: error.message });
  }
});

// Setup Vite Dev server or Serve Static files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

