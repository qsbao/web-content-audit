import { execSync } from "child_process";
import crypto from "crypto";
import { findRule } from "../runner/rule-loader.js";

export interface PromptSnapshot {
  gitCommit: string;
  gitBranch: string;
  timestamp: string;
  ruleSetId: string;
  ruleId: string;
  evaluationPrompt: string;
  promptHash: string;
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "unknown";
  }
}

export async function captureSnapshot(ruleSetId: string, ruleId: string): Promise<PromptSnapshot> {
  const gitCommit = git("rev-parse HEAD");
  const gitBranch = git("branch --show-current");
  const rule = findRule(ruleSetId, ruleId);
  const evaluationPrompt = rule?.check.evaluationPrompt ?? "";
  const promptHash = crypto.createHash("sha256").update(evaluationPrompt).digest("hex").slice(0, 16);

  return {
    gitCommit,
    gitBranch,
    timestamp: new Date().toISOString(),
    ruleSetId,
    ruleId,
    evaluationPrompt,
    promptHash,
  };
}
