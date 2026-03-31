import type {
  AuditRequest,
  AuditResponse,
  ParsedDocument,
  RuleSet,
} from "@web-content-audit/shared";

const SERVER = "http://127.0.0.1:3200";

// --- State ---
interface AuditState {
  status: "idle" | "running" | "done" | "error";
  response?: AuditResponse;
  error?: string;
  tabId?: number;
}

let auditState: AuditState = { status: "idle" };

// --- Server calls ---

async function fetchRuleSets(): Promise<RuleSet[]> {
  const res = await fetch(`${SERVER}/api/v1/rulesets`);
  if (!res.ok) throw new Error(`Failed to fetch rulesets: ${res.statusText}`);
  return res.json();
}

async function runAuditRequest(request: AuditRequest): Promise<AuditResponse> {
  const res = await fetch(`${SERVER}/api/v1/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || `Audit failed: ${res.statusText}`
    );
  }
  return res.json();
}

// --- Message handler ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_RULESETS") {
    fetchRuleSets().then(
      (rulesets) => sendResponse({ success: true, rulesets }),
      (err) => sendResponse({ success: false, error: String(err) })
    );
    return true;
  }

  if (message.type === "START_AUDIT") {
    const { tabId, documentType } = message as {
      tabId: number;
      documentType?: string;
    };
    startAudit(tabId, documentType);
    sendResponse({ success: true });
    return false;
  }

  if (message.type === "GET_AUDIT_STATE") {
    sendResponse({ ...auditState });
    return false;
  }
});

// --- Audit orchestration (runs in service worker, survives popup close) ---

async function ensureContentScript(tabId: number) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (response?.pong) return;
  } catch {
    // Content script not injected — inject it now
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

async function startAudit(tabId: number, documentType?: string) {
  auditState = { status: "running", tabId };
  broadcastState();

  try {
    // 0. Ensure content script is available
    await ensureContentScript(tabId);

    // 1. Parse the page via content script
    const parseResponse = await chrome.tabs.sendMessage(tabId, {
      type: "PARSE_PAGE",
    });
    if (!parseResponse?.success) {
      throw new Error(parseResponse?.error || "Failed to parse page");
    }

    const document: ParsedDocument = parseResponse.document;

    // 2. Call server for audit
    const response = await runAuditRequest({ document, documentType });

    // 3. Send highlights to content script
    chrome.tabs.sendMessage(tabId, {
      type: "HIGHLIGHT_RESULTS",
      results: response.results,
    }).catch(() => { /* tab may have navigated away */ });

    auditState = { status: "done", response, tabId };
  } catch (err) {
    auditState = {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      tabId,
    };
  }

  broadcastState();
}

function broadcastState() {
  // Notify any open popup
  chrome.runtime.sendMessage({ type: "AUDIT_STATE_UPDATE", ...auditState }).catch(() => {
    // Popup not open — that's fine
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Web Content Audit extension installed");
});
