import type {
  ParsedDocument,
  Rule,
  StructuralCheck,
  AuditResult,
} from "@web-content-audit/shared";

/**
 * Run structural checks: verify required sections exist in the document.
 * Uses fuzzy matching with aliases for zh/en support.
 */
export function runStructuralChecks(
  document: ParsedDocument,
  rules: Rule[]
): AuditResult[] {
  const structuralRules = rules.filter(
    (r): r is Rule & { check: StructuralCheck } => r.check.type === "structural"
  );

  const results: AuditResult[] = [];

  for (const rule of structuralRules) {
    const { requiredSections, sectionAliases } = rule.check;
    const issues: string[] = [];
    const suggestions: string[] = [];

    for (const required of requiredSections) {
      const found = findSection(document, required, sectionAliases);
      if (!found) {
        issues.push(`Missing required section: "${required}"`);
        const aliases = sectionAliases?.[required];
        if (aliases?.length) {
          suggestions.push(
            `Add a section titled "${required}" (also accepted: ${aliases.map((a) => `"${a}"`).join(", ")})`
          );
        } else {
          suggestions.push(`Add a section titled "${required}"`);
        }
      }
    }

    results.push({
      ruleId: rule.id,
      ruleDescription: rule.description,
      severity: rule.severity,
      status: issues.length === 0 ? "pass" : "fail",
      issues,
      suggestions,
    });
  }

  return results;
}

/**
 * Find a section by heading text, checking exact match and aliases.
 * Case-insensitive, trims whitespace.
 */
function findSection(
  document: ParsedDocument,
  sectionName: string,
  aliases?: Record<string, string[]>
): string | undefined {
  const candidates = [sectionName, ...(aliases?.[sectionName] ?? [])];
  const normalizedCandidates = candidates.map(normalize);

  for (const section of document.sections) {
    const heading = normalize(section.heading);
    if (normalizedCandidates.some((c) => heading.includes(c) || c.includes(heading))) {
      return section.domSelector;
    }
  }

  return undefined;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
