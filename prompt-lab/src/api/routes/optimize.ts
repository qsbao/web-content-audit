import crypto from "crypto";
import fs from "fs";
import type { FastifyInstance } from "fastify";
import yaml from "js-yaml";
import { optimizePrompt } from "../../optimizer/optimizer.js";
import { getRuleSetFilePath, loadRuleSet } from "../../runner/rule-loader.js";
import { createJob, updateJob, getJob, listJobs } from "../jobs.js";
import type { OptimizationJob } from "../../types.js";

// In-memory store for optimization jobs with full detail
const optimizationJobs = new Map<string, OptimizationJob>();
const stopSignals = new Map<string, boolean>();
const liveGuidance = new Map<string, string>();

export async function optimizeRoutes(app: FastifyInstance) {
  // Start optimization
  app.post<{
    Body: { ruleSetId: string; ruleId: string; targetAccuracy?: number; maxIterations?: number; guidance?: string };
  }>("/api/v1/optimize", async (req) => {
    const jobId = crypto.randomUUID();
    createJob(jobId, "optimize");
    updateJob(jobId, { status: "running" });
    stopSignals.set(jobId, false);

    (async () => {
      try {
        const result = await optimizePrompt({
          ...req.body,
          onIteration: (iter) => {
            const current = optimizationJobs.get(jobId);
            if (current) {
              current.iterations.push(iter);
            }
          },
          shouldStop: () => stopSignals.get(jobId) === true,
          getGuidance: () => liveGuidance.get(jobId) ?? "",
        });
        optimizationJobs.set(jobId, result);
        updateJob(jobId, { status: result.status, result });
      } catch (err: any) {
        updateJob(jobId, { status: "failed", error: err.message });
      }
    })();

    // Initialize the in-memory optimization job for progress tracking
    optimizationJobs.set(jobId, {
      id: jobId,
      ruleSetId: req.body.ruleSetId,
      ruleId: req.body.ruleId,
      status: "running",
      targetAccuracy: req.body.targetAccuracy ?? 0.95,
      maxIterations: req.body.maxIterations ?? 10,
      guidance: req.body.guidance ?? "",
      liveGuidance: [],
      iterations: [],
      bestIteration: 0,
      startedAt: new Date().toISOString(),
    });

    return { jobId };
  });

  // Get optimization status
  app.get<{ Params: { jobId: string } }>("/api/v1/optimize/:jobId", async (req, reply) => {
    const optJob = optimizationJobs.get(req.params.jobId);
    if (optJob) return optJob;

    const job = getJob(req.params.jobId);
    if (job) return job;

    return reply.status(404).send({ error: "Job not found" });
  });

  // Stop optimization
  app.post<{ Params: { jobId: string } }>("/api/v1/optimize/:jobId/stop", async (req, reply) => {
    if (!optimizationJobs.has(req.params.jobId)) {
      return reply.status(404).send({ error: "Job not found" });
    }
    stopSignals.set(req.params.jobId, true);
    return { ok: true };
  });

  // Inject user guidance mid-loop
  app.post<{ Params: { jobId: string }; Body: { guidance: string } }>(
    "/api/v1/optimize/:jobId/guide",
    async (req, reply) => {
      const optJob = optimizationJobs.get(req.params.jobId);
      if (!optJob) return reply.status(404).send({ error: "Job not found" });
      liveGuidance.set(req.params.jobId, req.body.guidance);
      optJob.liveGuidance.push(req.body.guidance);
      return { ok: true };
    }
  );

  // Apply best prompt to YAML file
  app.post<{ Params: { jobId: string } }>("/api/v1/optimize/:jobId/apply", async (req, reply) => {
    const optJob = optimizationJobs.get(req.params.jobId);
    if (!optJob) return reply.status(404).send({ error: "Job not found" });

    const best = optJob.iterations[optJob.bestIteration];
    if (!best) return reply.status(400).send({ error: "No iterations completed" });

    const filePath = getRuleSetFilePath(optJob.ruleSetId);
    if (!filePath) return reply.status(404).send({ error: "RuleSet file not found" });

    // Load, modify, and save the YAML
    const ruleSet = loadRuleSet(filePath);
    const rule = ruleSet.rules.find((r: any) => r.id === optJob.ruleId);
    if (!rule || rule.check.type !== "content") {
      return reply.status(400).send({ error: "Rule not found or not a content rule" });
    }
    (rule.check as any).evaluationPrompt = best.prompt;
    fs.writeFileSync(filePath, yaml.dump(ruleSet, { lineWidth: -1, noRefs: true }), "utf-8");

    return { ok: true, prompt: best.prompt };
  });

  // List optimization jobs
  app.get("/api/v1/optimize", async () => {
    return Array.from(optimizationJobs.values());
  });
}
