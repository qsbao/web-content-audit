import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { runTestSuite } from "../../runner/runner.js";
import { saveTestRun, loadAllTestRuns, loadTestRunById, loadRunHistory } from "../../versioning/results-store.js";
import { compareRuns, compareMultipleRuns } from "../../versioning/compare.js";
import { createJob, updateJob, getJob, listJobs } from "../jobs.js";

export async function runsRoutes(app: FastifyInstance) {
  // Start a test run (async)
  app.post<{ Body: { ruleSetId: string; ruleId?: string; concurrency?: number; repeatCount?: number } }>(
    "/api/v1/runs",
    async (req) => {
      const jobId = crypto.randomUUID();
      const job = createJob(jobId, "run");
      updateJob(jobId, { status: "running" });

      // Run in background
      (async () => {
        try {
          const runs = await runTestSuite({
            ...req.body,
            onProgress: (p) => updateJob(jobId, { progress: p }),
          });
          for (const run of runs) saveTestRun(run);
          updateJob(jobId, { status: "completed", result: runs });
        } catch (err: any) {
          updateJob(jobId, { status: "failed", error: err.message });
        }
      })();

      return { jobId };
    }
  );

  // List recent runs
  app.get("/api/v1/runs", async () => {
    const jobs = listJobs("run");
    const stored = loadAllTestRuns().slice(0, 50);
    return { activeJobs: jobs.filter((j) => j.status === "running"), recentRuns: stored };
  });

  // Get run status or result
  app.get<{ Params: { runId: string } }>("/api/v1/runs/:runId", async (req, reply) => {
    // Check active jobs first
    const job = getJob(req.params.runId);
    if (job) return job;

    // Check stored results
    const run = loadTestRunById(req.params.runId);
    if (run) return run;

    return reply.status(404).send({ error: "Run not found" });
  });

  // Run history for a rule
  app.get<{ Params: { ruleId: string } }>("/api/v1/history/:ruleId", async (req) => {
    return loadRunHistory(req.params.ruleId);
  });

  // Compare two runs (legacy)
  app.get<{ Querystring: { baseline: string; current: string } }>("/api/v1/compare", async (req, reply) => {
    const baseline = loadTestRunById(req.query.baseline);
    const current = loadTestRunById(req.query.current);
    if (!baseline || !current) return reply.status(404).send({ error: "Run not found" });
    return compareRuns(baseline, current);
  });

  // Multi-run comparison (3+ runs side by side)
  app.get<{ Querystring: { ids: string } }>("/api/v1/compare-multi", async (req, reply) => {
    const runIds = (req.query.ids || "").split(",").filter(Boolean);
    if (runIds.length < 2) return reply.status(400).send({ error: "Provide at least 2 run IDs" });

    const runs = runIds.map((id) => loadTestRunById(id)).filter(Boolean);
    if (runs.length < 2) return reply.status(404).send({ error: "Some runs not found" });

    return compareMultipleRuns(runs as import("../../types.js").TestRun[]);
  });
}
