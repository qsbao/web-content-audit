import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root } from "mdast";

const parser = unified().use(remarkParse);

export function parseMarkdownToMdast(markdown: string): Root {
  return parser.parse(markdown);
}
