// ── Test Suite ──

export interface TestSuite {
  ruleId: string;
  ruleSetId: string;
  description: string;
  cases: TestCase[];
}

export interface TestCase {
  id: string;
  description: string;
  input: string; // markdown section content
  expected: ExpectedResult;
}

export interface ExpectedResult {
  pass: boolean;
  issuesMustMention?: string[]; // optional substring checks on issues
}

// ── Test Run ──

export interface TestRun {
  id: string; // uuid
  timestamp: string; // ISO 8601
  gitCommit: string;
  gitBranch: string;
  ruleSetId: string;
  ruleId: string;
  promptSnapshot: string; // the evaluationPrompt text at run time
  promptHash: string; // sha256 of evaluationPrompt
  suiteHash: string; // sha256 of test suite content (versioning)
  model: string;
  results: TestCaseResult[];
  metrics: RuleMetrics;
}

export interface TestCaseResult {
  caseId: string;
  input: string; // original markdown input for display in compare
  expectedPass: boolean;
  actualPass: boolean;
  correct: boolean;
  issues: string[];
  suggestions: string[];
  rawOutput?: string; // full LLM response text (beyond just pass/fail)
  issuesMentionCheck?: { keyword: string; found: boolean }[];
  latencyMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

// ── Metrics ──

export interface RuleMetrics {
  accuracy: number;
  precision: number; // TP / (TP + FP), "pass" is positive
  recall: number; // TP / (TP + FN)
  f1: number;
  totalCases: number;
  passExpected: number;
  failExpected: number;
  consistency?: number; // agreement across repeated runs (0-1)
  avgLatencyMs: number;
}

// ── Version Comparison ──

export interface RunSummary {
  runId: string;
  gitCommit: string;
  timestamp: string;
  suiteHash: string;
  metrics: RuleMetrics;
  prompt: string;
  results: TestCaseResult[];
}

export interface MultiComparison {
  ruleId: string;
  runs: RunSummary[];
  caseDetails: CaseComparison[];
}

export interface CaseComparison {
  caseId: string;
  input: string; // the test case markdown input
  perRun: CaseRunDetail[];
}

export interface CaseRunDetail {
  runId: string;
  expectedPass: boolean;
  actualPass: boolean;
  correct: boolean;
  issues: string[];
  suggestions: string[];
  rawOutput?: string;
}

// Legacy 2-run comparison (kept for CLI)
export interface VersionComparison {
  ruleId: string;
  baseline: { runId: string; gitCommit: string; metrics: RuleMetrics; prompt: string };
  current: { runId: string; gitCommit: string; metrics: RuleMetrics; prompt: string };
  delta: { accuracy: number; precision: number; recall: number; f1: number };
  caseFlips: CaseFlip[];
}

export interface CaseFlip {
  caseId: string;
  baselineCorrect: boolean;
  currentCorrect: boolean;
}

// ── Optimization ──

export interface OptimizationJob {
  id: string;
  ruleSetId: string;
  ruleId: string;
  status: "running" | "completed" | "failed" | "stopped";
  targetAccuracy: number;
  maxIterations: number;
  guidance: string; // user-provided advice at start
  liveGuidance: string[]; // user advice injected mid-loop
  iterations: OptimizationIteration[];
  bestIteration: number; // index of best iteration
  startedAt: string;
  finishedAt?: string;
}

export interface OptimizationIteration {
  iteration: number;
  prompt: string;
  metrics: RuleMetrics;
  failureAnalysis: string;
  improvementRationale: string;
  guidanceUsed: string; // snapshot of guidance at this iteration
  tokenUsage?: { prompt: number; completion: number; total: number };
}

// ── Runner Options ──

export interface RunnerOptions {
  ruleSetId: string;
  ruleId?: string;
  concurrency?: number; // default 3
  repeatCount?: number; // for consistency, default 1
  promptOverride?: string; // for optimizer to test modified prompts
  onProgress?: (progress: RunProgress) => void;
}

export interface RunProgress {
  completed: number;
  total: number;
  currentCase: string;
}

// ── Async Job Tracking ──

export interface AsyncJob<T = unknown> {
  id: string;
  type: "run" | "optimize";
  status: "pending" | "running" | "completed" | "failed" | "stopped";
  progress?: RunProgress;
  result?: T;
  error?: string;
  createdAt: string;
}
