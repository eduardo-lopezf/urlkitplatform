/**
 * The HTML parser of Metadata (002 research R4): `parse5`, conformant with the HTML standard.
 *
 * It lives in its own entry point, `@urlkit/core/html`, and is injected into the tool through
 * `ToolContext.parseHtml`, like the rules catalog. The tool registry is loaded by the web too;
 * importing `parse5` from the tool definition would ship it on every page. Only the API (and the
 * core tests) import this module. `parse5` builds a tree and never runs scripts (FR-033).
 */
import { parse } from 'parse5';
import type { HtmlNode } from './types.ts';

export function parseHtml(html: string): HtmlNode {
  return parse(html) as unknown as HtmlNode;
}
