// ── Parsed Document (from Chrome extension) ──

export interface ParsedDocument {
  title: string;
  url: string;
  sections: ParsedSection[];
  metadata: DocumentMetadata;
}

export interface ParsedSection {
  heading: string;
  headingLevel: number;
  content: string;
  contentHtml: string;
  items: string[];
  domSelector: string;
}

export interface DocumentMetadata {
  author?: string;
  lastModified?: string;
  wordCount: number;
}

// ── Rule Definitions ──

export interface RuleSet {
  id: string;
  documentType: string;
  displayName: string;
  matchPattern: MatchPattern;
  rules: Rule[];
}

export interface MatchPattern {
  titlePattern?: string;
  urlPattern?: string;
}

export interface Rule {
  id: string;
  category: "structure" | "content";
  severity: Severity;
  description: string;
  check: StructuralCheck | ContentCheck;
}

export type Severity = "error" | "warning" | "info";

export interface StructuralCheck {
  type: "structural";
  requiredSections: string[];
  sectionAliases?: Record<string, string[]>;
}

export interface ContentCheck {
  type: "content";
  targetSection: string;
  evaluationPrompt: string;
  expectedFields?: string[];
}

// ── Audit Results ──

export interface AuditRequest {
  documentType?: string;
  document: ParsedDocument;
  ruleSetId?: string;
}

export interface AuditResponse {
  ruleSetId: string;
  documentType: string;
  overallStatus: "pass" | "fail" | "warning";
  results: AuditResult[];
  summary: AuditSummary;
}

export interface AuditResult {
  ruleId: string;
  ruleDescription: string;
  severity: Severity;
  status: "pass" | "fail";
  targetSection?: string;
  domSelector?: string;
  issues: string[];
  suggestions: string[];
}

export interface AuditSummary {
  passed: number;
  failed: number;
  warnings: number;
}
