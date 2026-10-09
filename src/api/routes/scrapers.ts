import { Router } from "express";
import {
  listScrapers,
  runScraper,
  runAllScrapers,
  healthCheckAll,
  getScraperStats,
} from "../../scrapers/registry.js";

export const scrapersRouter = Router();

scrapersRouter.get("/", (_req, res) => {
  res.json({
    success: true,
    data: listScrapers(),
    meta: { count: listScrapers().length },
  });
});

scrapersRouter.get("/stats", (_req, res) => {
  res.json({ success: true, data: getScraperStats() });
});

scrapersRouter.get("/health", async (_req, res) => {
  const checks = await healthCheckAll();
  res.json({ success: true, data: checks, meta: { count: checks.length } });
});

scrapersRouter.post("/run/:bookId", async (req, res) => {
  try {
    const result = await runScraper(req.params.bookId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(404).json({ success: false, error: error instanceof Error ? error.message : "not found" });
  }
});

scrapersRouter.post("/run-all", async (_req, res) => {
  const results = await runAllScrapers();
  res.json({ success: true, data: results, meta: { count: results.length } });
});
