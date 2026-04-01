import type {
  ParsedDocument,
  Rule,
  ContentCheck,
  AuditResult,
} from "@web-content-audit/shared";
import { evaluateContent } from "../llm/client.js";

/**
 * Run content checks using LLM evaluation.
 * Groups rules by target section to batch evaluations.
 */
export async function runContentChecks(
  document: ParsedDocument,
  rules: Rule[]
): Promise<AuditResult[]> {
  const contentRules = rules.filter(
    (r): r is Rule & { check: ContentCheck } => r.check.type === "content"
  );

  if (contentRules.length === 0) return [];

  const results: AuditResult[] = [];

  // Group rules by target section for potential batching
  const rulesBySection = new Map<string, (Rule & { check: ContentCheck })[]>();
  for (const rule of contentRules) {
    const key = rule.check.targetSection;
    const group = rulesBySection.get(key) ?? [];
    group.push(rule);
    rulesBySection.set(key, group);
  }

  for (const [sectionName, sectionRules] of rulesBySection) {
    // Find the matching section in the document
    const section = document.sections.find(
      (s) => normalize(s.heading).includes(normalize(sectionName)) ||
             normalize(sectionName).includes(normalize(s.heading))
    );

    if (!section) {
      // Section doesn't exist — skip content checks (structural check already flags this)
      for (const rule of sectionRules) {
        results.push({
          ruleId: rule.id,
          ruleDescription: rule.description,
          severity: rule.severity,
          status: "fail",
          targetSection: sectionName,
          issues: [`Section "${sectionName}" not found — cannot evaluate content`],
          suggestions: [],
        });
      }
      continue;
    }

    // Evaluate each rule against the section content
    for (const rule of sectionRules) {
      console.log(`[Audit] Evaluating rule "${rule.id}" on section "${sectionName}"`);
      try {
        const evaluation = await evaluateContent(
          section.contentMarkdown!,
          rule.check.evaluationPrompt
        );

        results.push({
          ruleId: rule.id,
          ruleDescription: rule.description,
          severity: rule.severity,
          status: evaluation.pass ? "pass" : "fail",
          targetSection: sectionName,
          domSelector: section.domSelector,
          issues: evaluation.issues,
          suggestions: evaluation.suggestions,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          ruleId: rule.id,
          ruleDescription: rule.description,
          severity: rule.severity,
          status: "fail",
          targetSection: sectionName,
          domSelector: section.domSelector,
          issues: [`LLM evaluation failed: ${message}`],
          suggestions: ["Check LLM configuration in .env"],
        });
      }
    }
  }

  return results;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
