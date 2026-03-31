import type { AuditResponse, AuditResult } from "@web-content-audit/shared";

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
    const res = await chrome.runtime.sendMessage({ type: "GET_RULESETS" });
    if (!res?.success) throw new Error(res?.error);
    for (const rs of res.rulesets) {
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
  if (type === "loading") {
    statusEl.innerHTML = `<span class="spinner"></span>${escapeHtml(text)}`;
  } else {
    statusEl.textContent = text;
  }
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

// Listen for state updates from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "AUDIT_STATE_UPDATE") {
    applyState(message);
  }
});

function applyState(state: {
  status: string;
  response?: AuditResponse;
  error?: string;
}) {
  switch (state.status) {
    case "running":
      auditBtn.disabled = true;
      auditBtn.classList.add("running");
      auditBtn.textContent = "Auditing…";
      setStatus("Running audit — you can close this popup, it will keep going", "loading");
      break;
    case "done":
      auditBtn.disabled = false;
      auditBtn.classList.remove("running");
      auditBtn.textContent = "Audit";
      if (state.response) {
        const r = state.response;
        setStatus(
          r.overallStatus === "pass"
            ? "All checks passed!"
            : `Audit complete — ${r.summary.failed} errors, ${r.summary.warnings} warnings`,
          r.overallStatus === "pass" ? "success" : "error"
        );
        renderResults(r);
      }
      break;
    case "error":
      auditBtn.disabled = false;
      auditBtn.classList.remove("running");
      auditBtn.textContent = "Audit";
      setStatus(state.error || "Audit failed", "error");
      break;
    default:
      auditBtn.disabled = false;
      auditBtn.classList.remove("running");
      auditBtn.textContent = "Audit";
  }
}

// Main audit flow — delegates to service worker
auditBtn.addEventListener("click", async () => {
  auditBtn.disabled = true;
  setStatus("Starting audit...", "loading");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");

    pageTitleEl.textContent = tab.title || tab.url || "";

    const selectedType = docTypeSelect.value || undefined;
    await chrome.runtime.sendMessage({
      type: "START_AUDIT",
      tabId: tab.id,
      documentType: selectedType,
    });
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
    auditBtn.disabled = false;
  }
});

// On popup open, restore last state
async function init() {
  await loadRuleSets();
  const state = await chrome.runtime.sendMessage({ type: "GET_AUDIT_STATE" });
  if (state && state.status !== "idle") {
    applyState(state);
  }
}

init();
