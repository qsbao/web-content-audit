// Service worker for the extension.
// Currently minimal — can be extended for badge updates, context menu, etc.

chrome.runtime.onInstalled.addListener(() => {
  console.log("Web Content Audit extension installed");
});
