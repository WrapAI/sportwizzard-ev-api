import { sw } from "../client/sportwizzard.js";
import { writeOdds, writeEdges, writeArbitrage } from "./bootstrap.js";
import { getSyncState, setSyncState } from "../store/db.js";

export interface DeltaStats {
  lastSync: string;
  oddsUpdated: number;
  edgesUpdated: number;
  arbitrageUpdated: number;
  cycleCount: number;
  errors: number;
  running: boolean;
}

const stats: DeltaStats = {
  lastSync: "never",
  oddsUpdated: 0,
  edgesUpdated: 0,
  arbitrageUpdated: 0,
  cycleCount: 0,
  errors: 0,
  running: false,
};

let timer: ReturnType<typeof setInterval> | null = null;

async function cycle(): Promise<void> {
  try {
    const since = getSyncState("last_delta_sync") ?? new Date(Date.now() - 60000).toISOString();

    const [odds, edges, arbs] = await Promise.all([
      sw.oddsUpdated(since, { odds_format: "decimal" }),
      sw.edges().catch(() => []),
      sw.arbitrage().catch(() => []),
    ]);

    if (odds.length > 0) writeOdds(odds);
    if (edges.length > 0) writeEdges(edges);
    if (arbs.length > 0) writeArbitrage(arbs);

    const now = new Date().toISOString();
    setSyncState("last_delta_sync", now);
    stats.lastSync = now;
    stats.oddsUpdated += odds.length;
    stats.edgesUpdated += edges.length;
    stats.arbitrageUpdated += arbs.length;
    stats.cycleCount++;

    if (odds.length > 0 || arbs.length > 0) {
      console.log(
        `[delta] +${odds.length} odds, +${edges.length} edges, +${arbs.length} arb (cycle ${stats.cycleCount})`,
      );
    }
  } catch (error) {
    stats.errors++;
    console.error(`[delta] error (cycle ${stats.cycleCount}):`, error instanceof Error ? error.message : error);
  }
}

export function startDelta(intervalMs: number): void {
  if (timer) return;
  stats.running = true;
  console.log(`[delta] starting poller at ${intervalMs}ms intervals`);
  cycle();
  timer = setInterval(cycle, intervalMs);
}

export function stopDelta(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    stats.running = false;
    console.log("[delta] stopped");
  }
}

export function getDeltaStats(): DeltaStats {
  return { ...stats };
}
