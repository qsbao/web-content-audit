import type {
  ParsedDocument,
  RuleSet,
  AuditResponse,
  AuditResult,
} from "@web-content-audit/shared";
import { runStructuralChecks } from "./structural.js";
import { runContentChecks } from "./content.js";

export async function runAudit(
  document: ParsedDocument,
  ruleSet: RuleSet
): Promise<AuditResponse> {
  // Phase 1: Structural checks (instant, no LLM)
  const structuralResults = runStructuralChecks(document, ruleSet.rules);

  // Phase 2: Content checks (LLM-powered)
  const contentResults = await runContentChecks(document, ruleSet.rules);

  const allResults: AuditResult[] = [...structuralResults, ...contentResults];

  const summary = {
    passed: allResults.filter((r) => r.status === "pass").length,
    failed: allResults.filter((r) => r.status === "fail" && r.severity === "error").length,
    warnings: allResults.filter((r) => r.status === "fail" && r.severity === "warning").length,
  };

  const overallStatus: AuditResponse["overallStatus"] =
    summary.failed > 0 ? "fail" : summary.warnings > 0 ? "warning" : "pass";

  return {
    ruleSetId: ruleSet.id,
    documentType: ruleSet.documentType,
    overallStatus,
    results: allResults,
    summary,
  };
}
