import type { AuditResponse, AuditResult, ParsedDocument } from "@web-content-audit/shared";
import { fetchRuleSets, runAudit } from "../api/client.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusEl = $("status");
const auditBtn = $<HTMLButtonElement>("audit-btn");
const docTypeSelect = $<HTMLSelectElement>("doc-type");
const summaryEl = $("summary");
const resultsEl = $("results");
const pageTitleEl = $("page-title");

// Load available rulesets into dropdown
async function loadRuleSets() {
  try {
    const rulesets = await fetchRuleSets();
    for (const rs of rulesets) {
      const opt = document.createElement("option");
      opt.value = rs.documentType;
      opt.textContent = rs.displayName;
      docTypeSelect.appendChild(opt);
    }
  } catch {
    setStatus("Cannot connect to server (localhost:3200)", "error");
  }
}

function setStatus(text: string, type: "" | "loading" | "error" | "success" = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function renderResults(response: AuditResponse) {
  // Summary
  $("stat-passed").textContent = String(response.summary.passed);
  $("stat-failed").textContent = String(response.summary.failed);
  $("stat-warnings").textContent = String(response.summary.warnings);
  summaryEl.classList.remove("hidden");

  // Results list
  resultsEl.innerHTML = "";
  for (const r of response.results) {
    resultsEl.appendChild(renderResultItem(r));
  }
}

function renderResultItem(r: AuditResult): HTMLElement {
  const div = document.createElement("div");
  const statusClass = r.status === "pass" ? "pass" : `fail-${r.severity}`;
  div.className = `result-item ${statusClass}`;

  const badgeClass = r.status === "pass" ? "badge-pass" : `badge-${r.severity}`;
  const badgeText = r.status === "pass" ? "PASS" : r.severity.toUpperCase();

  let html = `<div class="result-rule">${escapeHtml(r.ruleDescription)} <span class="badge ${badgeClass}">${badgeText}</span></div>`;

  if (r.targetSection) {
    html += `<div style="font-size:11px;color:#888;">Section: ${escapeHtml(r.targetSection)}</div>`;
  }

  if (r.issues.length > 0) {
    html += `<ul class="result-issues">${r.issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
  }

  if (r.suggestions.length > 0) {
    html += `<ul class="result-issues" style="color:#4f46e5;">${r.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
  }

  div.innerHTML = html;
  return div;
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// Main audit flow
auditBtn.addEventListener("click", async () => {
  auditBtn.disabled = true;
  setStatus("Parsing page...", "loading");

  try {
    // 1. Ask content script to parse the page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");

    const parseResponse = await chrome.tabs.sendMessage(tab.id, { type: "PARSE_PAGE" });
    if (!parseResponse?.success) {
      throw new Error(parseResponse?.error || "Failed to parse page");
    }

    const document: ParsedDocument = parseResponse.document;
    pageTitleEl.textContent = document.title || document.url;

    // 2. Run audit
    setStatus("Running audit...", "loading");
    const selectedType = docTypeSelect.value || undefined;
    const response = await runAudit({
      document,
      documentType: selectedType,
    });

    // 3. Show results
    setStatus(
      response.overallStatus === "pass"
        ? "All checks passed!"
        : `Audit complete — ${response.summary.failed} errors, ${response.summary.warnings} warnings`,
      response.overallStatus === "pass" ? "success" : "error"
    );
    renderResults(response);

    // 4. Send results to content script for highlighting
    chrome.tabs.sendMessage(tab.id, {
      type: "HIGHLIGHT_RESULTS",
      results: response.results,
    });
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    auditBtn.disabled = false;
  }
});

// Init
loadRuleSets();
