import Database from "better-sqlite3";

export function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      feature TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_email_ts ON events(email, ts);
    CREATE INDEX IF NOT EXISTS idx_events_email_feature_ts ON events(email, feature, ts);
  `);

  const insert = db.prepare(`INSERT INTO events (email, feature, ts) VALUES (?, ?, ?)`);
  const agg = db.prepare(`
    SELECT feature, COUNT(*) as beats, MAX(ts) as lastTs
    FROM events
    WHERE email = ? AND ts BETWEEN ? AND ?
    GROUP BY feature
    ORDER BY beats DESC
  `);

  return { db, insert, agg };
}
