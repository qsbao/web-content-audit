import { parseFeishuPage } from "./parser.js";
import { highlightResults, clearHighlights } from "./highlighter.js";

// Listen for messages from popup / service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ pong: true });
    return false;
  }

  if (message.type === "PARSE_PAGE") {
    try {
      const document = parseFeishuPage();
      sendResponse({ success: true, document });
    } catch (err) {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (message.type === "HIGHLIGHT_RESULTS") {
    try {
      clearHighlights();
      highlightResults(message.results);
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }
});
