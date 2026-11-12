/**
 * Minimal shape of an HTML tree the core walks (002/T043). It is the subset of parse5's default
 * tree adapter the extraction needs, so the core depends on a structure, not on the parser.
 */
export interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  /** Text nodes. */
  value?: string;
  /** `<template>` contents. Never searched for metadata. */
  content?: HtmlNode;
}

export type ParseHtml = (html: string) => HtmlNode;
