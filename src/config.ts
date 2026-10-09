import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  apiKey: required("SPORTWIZZARD_API_KEY", ""),
  baseUrl: "https://api.sportwizzard.com/api/v1",
  syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS ?? "3000", 10),
  snapshotOnStart: process.env.SNAPSHOT_ON_START === "true",
  port: parseInt(process.env.PORT ?? "3400", 10),
  host: process.env.HOST ?? "0.0.0.0",
  dbPath: process.env.DB_PATH ?? "./ev-engine.db",
  minEvPercent: parseFloat(process.env.MIN_EV_PERCENT ?? "1.0"),
  minEdgePercent: parseFloat(process.env.MIN_EDGE_PERCENT ?? "0.5"),
};
