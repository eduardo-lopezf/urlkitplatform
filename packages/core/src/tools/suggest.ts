/**
 * Home input routing (T097): one URL → Smart Cleaner, two URLs → URL Diff, a known link
 * shortener → Redirect Inspector, because only following it reveals the destination.
 */
import type { ToolId } from '../registry.ts';
import { parseUrl } from '../url/parse.ts';

export const SHORTENER_HOSTS = new Set([
  'bit.ly',
  'bitly.com',
  't.co',
  'tinyurl.com',
  'goo.gl',
  'ow.ly',
  'buff.ly',
  'is.gd',
  'v.gd',
  'rebrand.ly',
  'cutt.ly',
  's.id',
  'lnkd.in',
  't.ly',
  'rb.gy',
  'shorturl.at',
  'tiny.cc',
  'bl.ink',
  'short.io',
  'trib.al',
  'dlvr.it',
  'amzn.to',
  'a.co',
  'youtu.be',
  'spoti.fi',
  'fb.me',
  'wa.me',
]);

export function suggestTool(text: string): { tool: ToolId; urls: string[] } | null {
  const urls = text.split(/\s+/).filter(Boolean);
  if (urls.length === 0) return null;
  if (urls.length >= 2) return { tool: 'diff', urls: urls.slice(0, 2) };
  const parsed = parseUrl(urls[0] ?? '');
  const host = parsed.ok ? parsed.value.host.ascii.replace(/^www\./, '') : '';
  return { tool: SHORTENER_HOSTS.has(host) ? 'inspect' : 'clean', urls };
}
