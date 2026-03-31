import type { AuditRequest, AuditResponse, RuleSet } from "@web-content-audit/shared";

const DEFAULT_SERVER = "http://127.0.0.1:3200";

function getServerUrl(): string {
  // Could be configurable via extension storage in the future
  return DEFAULT_SERVER;
}

export async function fetchRuleSets(): Promise<RuleSet[]> {
  const res = await fetch(`${getServerUrl()}/api/v1/rulesets`);
  if (!res.ok) throw new Error(`Failed to fetch rulesets: ${res.statusText}`);
  return res.json();
}

export async function runAudit(request: AuditRequest): Promise<AuditResponse> {
  const res = await fetch(`${getServerUrl()}/api/v1/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Audit failed: ${res.statusText}`);
  }
  return res.json();
}
