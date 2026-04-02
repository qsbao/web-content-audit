import type { AsyncJob } from "../types.js";

const jobs = new Map<string, AsyncJob>();

export function createJob(id: string, type: "run" | "optimize"): AsyncJob {
  const job: AsyncJob = { id, type, status: "pending", createdAt: new Date().toISOString() };
  jobs.set(id, job);
  return job;
}

export function updateJob(id: string, update: Partial<AsyncJob>): void {
  const job = jobs.get(id);
  if (job) Object.assign(job, update);
}

export function getJob(id: string): AsyncJob | undefined {
  return jobs.get(id);
}

export function listJobs(type?: "run" | "optimize"): AsyncJob[] {
  const all = Array.from(jobs.values());
  return type ? all.filter((j) => j.type === type) : all;
}
