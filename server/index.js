import express from "express";
import cors from "cors";
import { openDb } from "./db.js";

const PORT = Number(process.env.PORT || 8787);
const AUTH_TOKEN = process.env.AUTH_TOKEN || "change-me";
const DB_PATH = process.env.DB_PATH || "./data.sqlite";
const BEAT_SECONDS = Number(process.env.BEAT_SECONDS || 15);

const { insert, agg } = openDb(DB_PATH);

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token !== AUTH_TOKEN) return res.status(401).json({ error: "unauthorized" });
  next();
}

app.get("/", (req, res) => res.send("gocroco ok"));

/** POST /api/track  { email, feature, ts } */
app.post("/api/track", auth, (req, res) => {
  const { email, feature, ts } = req.body || {};
  if (!email || !feature || !ts) return res.status(400).json({ error: "missing_fields" });

  const e = String(email).toLowerCase().trim();
  const f = String(feature).trim();
  const t = Number(ts);

  insert.run(e, f, t);
  res.json({ ok: true });
});

/** GET /api/usage?email=...&from=...&to=... */
app.get("/api/usage", auth, (req, res) => {
  const email = String(req.query.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "missing_email" });

  const now = Date.now();
  const from = Number(req.query.from || (now - 30 * 24 * 3600 * 1000));
  const to = Number(req.query.to || now);

  const rows = agg.all(email, from, to).map(r => ({
    feature: r.feature,
    beats: r.beats,
    seconds: r.beats * BEAT_SECONDS,
    lastSeen: r.lastTs
  }));

  res.json({ email, from, to, beatSeconds: BEAT_SECONDS, features: rows });
});

app.listen(PORT, () => console.log(`gocroco server: http://localhost:${PORT}`));
