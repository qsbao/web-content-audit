import type { AuditResult } from "@web-content-audit/shared";

const HIGHLIGHT_CLASS = "wca-highlight";
const TOOLTIP_CLASS = "wca-tooltip";

export function highlightResults(results: AuditResult[]): void {
  injectStyles();

  for (const result of results) {
    if (!result.domSelector) continue;

    const el = document.querySelector(result.domSelector);
    if (!el || !(el instanceof HTMLElement)) continue;

    el.classList.add(HIGHLIGHT_CLASS);

    if (result.status === "pass") {
      el.classList.add("wca-pass");
    } else if (result.severity === "error") {
      el.classList.add("wca-fail");
    } else if (result.severity === "warning") {
      el.classList.add("wca-warn");
    } else {
      el.classList.add("wca-info");
    }

    // Add tooltip with issues/suggestions
    if (result.issues.length > 0 || result.suggestions.length > 0) {
      const tooltip = document.createElement("div");
      tooltip.className = TOOLTIP_CLASS;

      let html = "";
      if (result.issues.length > 0) {
        html += `<div class="wca-tip-title">Issues</div>`;
        html += result.issues.map((i) => `<div class="wca-tip-item wca-tip-issue">${escapeHtml(i)}</div>`).join("");
      }
      if (result.suggestions.length > 0) {
        html += `<div class="wca-tip-title">Suggestions</div>`;
        html += result.suggestions.map((s) => `<div class="wca-tip-item wca-tip-suggestion">${escapeHtml(s)}</div>`).join("");
      }
      tooltip.innerHTML = html;

      el.style.position = "relative";
      el.appendChild(tooltip);

      el.addEventListener("mouseenter", () => {
        tooltip.style.display = "block";
      });
      el.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
    }
  }
}

export function clearHighlights(): void {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS, "wca-pass", "wca-fail", "wca-warn", "wca-info");
  });
  document.querySelectorAll(`.${TOOLTIP_CLASS}`).forEach((el) => el.remove());
}

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      transition: border-left 0.2s, background 0.2s;
    }
    .wca-pass {
      border-left: 4px solid #16a34a !important;
    }
    .wca-fail {
      border-left: 4px solid #dc2626 !important;
      background: rgba(220, 38, 38, 0.04) !important;
    }
    .wca-warn {
      border-left: 4px solid #d97706 !important;
      background: rgba(217, 119, 6, 0.04) !important;
    }
    .wca-info {
      border-left: 4px solid #3b82f6 !important;
      background: rgba(59, 130, 246, 0.03) !important;
    }
    .${TOOLTIP_CLASS} {
      display: none;
      position: absolute;
      right: -8px;
      top: 100%;
      z-index: 10000;
      min-width: 240px;
      max-width: 360px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #1a1a2e;
      color: #f0f0f0;
      font-size: 12px;
      line-height: 1.5;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    }
    .wca-tip-title {
      font-weight: 600;
      margin-bottom: 4px;
      color: #a5b4fc;
    }
    .wca-tip-item {
      padding: 2px 0;
    }
    .wca-tip-issue::before {
      content: "\\2716 ";
      color: #f87171;
    }
    .wca-tip-suggestion::before {
      content: "\\2794 ";
      color: #60a5fa;
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
