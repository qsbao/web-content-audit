import type { ParsedDocument, ParsedSection } from "@web-content-audit/shared";

/**
 * Parse the current Feishu wiki page into a structured ParsedDocument.
 * Extracts headings and their associated content sections.
 */
export function parseFeishuPage(): ParsedDocument {
  const title = extractTitle();
  const url = window.location.href;
  const sections = extractSections();
  const wordCount = sections.reduce((sum, s) => sum + s.content.length, 0);

  return {
    title,
    url,
    sections,
    metadata: {
      author: extractAuthor(),
      wordCount,
    },
  };
}

function extractTitle(): string {
  // Feishu wiki page title
  const titleEl =
    document.querySelector('[data-testid="doc-title"]') ||
    document.querySelector(".doc-title") ||
    document.querySelector("h1") ||
    document.querySelector("title");

  return titleEl?.textContent?.trim() || document.title || "";
}

function extractAuthor(): string | undefined {
  const authorEl =
    document.querySelector('[data-testid="doc-author"]') ||
    document.querySelector(".doc-meta-author");
  return authorEl?.textContent?.trim() || undefined;
}

/**
 * Extract sections by splitting on heading elements.
 * Works for Feishu wiki and generic HTML pages.
 */
function extractSections(): ParsedSection[] {
  // Try Feishu-specific content container first, then fall back to body
  const container =
    document.querySelector('[data-page-id]') ||
    document.querySelector(".doc-content") ||
    document.querySelector('[class*="docx-content"]') ||
    document.querySelector("article") ||
    document.body;

  if (!container) return [];

  const sections: ParsedSection[] = [];
  const headingSelector = "h1, h2, h3, h4, h5, h6";
  const headings = container.querySelectorAll(headingSelector);

  if (headings.length === 0) {
    // No headings found — treat entire content as one section
    sections.push({
      heading: "(no heading)",
      headingLevel: 0,
      content: container.textContent?.trim() || "",
      contentHtml: container.innerHTML,
      items: extractListItems(container),
      domSelector: buildSelector(container),
    });
    return sections;
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const headingText = heading.textContent?.trim() || "";
    const headingLevel = parseInt(heading.tagName.substring(1), 10);

    // Collect all sibling nodes between this heading and the next
    const contentNodes: Node[] = [];
    let sibling = heading.nextElementSibling;
    const nextHeading = headings[i + 1] || null;

    while (sibling && sibling !== nextHeading) {
      contentNodes.push(sibling);
      sibling = sibling.nextElementSibling;
    }

    const contentEl = document.createElement("div");
    contentNodes.forEach((n) => contentEl.appendChild(n.cloneNode(true)));

    sections.push({
      heading: headingText,
      headingLevel,
      content: contentEl.textContent?.trim() || "",
      contentHtml: contentEl.innerHTML,
      items: extractListItems(contentEl),
      domSelector: buildSelector(heading),
    });
  }

  return sections;
}

function extractListItems(container: Element | Node): string[] {
  if (!(container instanceof Element)) return [];
  const items: string[] = [];
  container.querySelectorAll("li").forEach((li) => {
    const text = li.textContent?.trim();
    if (text) items.push(text);
  });
  return items;
}

/**
 * Build a CSS selector to re-locate this element later for highlighting.
 * Prefers data-block-id (Feishu) > id > nth-child path.
 */
function buildSelector(el: Element): string {
  const blockId = el.getAttribute("data-block-id");
  if (blockId) return `[data-block-id="${blockId}"]`;

  if (el.id) return `#${el.id}`;

  // Build a path via nth-child
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }
  return parts.join(" > ");
}
