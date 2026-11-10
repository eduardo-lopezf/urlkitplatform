/**
 * Explain URL (FR-050–FR-054): fixed, deterministic rules, no AI. Every part and signal is a
 * message code; texts live in packages/i18n. Signals are informational notices, never a verdict.
 */
import type { Schema, ToolDefinition } from '../../registry.ts';
import type { MessageRef, ParsedUrl, Result } from '../../types.ts';
import { hostToUnicode, parseUrl } from '../../url/parse.ts';
import { splitRaw } from '../../url/raw.ts';
import type { RuleCatalog } from '../clean/catalog.ts';
import { matchParamRule } from '../clean/match.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';
import { isMixedScript, isWholeScriptConfusable } from './scripts.ts';

export const SIGNAL_IDS = [
  'userinfo-deception',
  'ip-host',
  'homograph',
  'mixed-scripts',
  'excessive-encoding',
  'double-encoding',
  'dangerous-scheme',
  'unusual-port',
  'nested-url',
  'abuse-tld',
] as const;
export type SignalId = (typeof SIGNAL_IDS)[number];

export interface Signal {
  id: SignalId;
  severity: 'info' | 'caution';
  message: MessageRef;
  evidence: string;
}

export interface ExplainedPart {
  component: string;
  value: string;
  message: MessageRef;
  platform?: string;
}

export interface Explanation {
  url: ParsedUrl;
  parts: ExplainedPart[];
  signals: Signal[];
  catalogVersion: string;
}

const DANGEROUS = new Set(['javascript', 'data', 'vbscript', 'file']);
const COMMON_PORTS = new Set([80, 443, 8080, 8443]);
const ENCODED_ALNUM = /%(?:3[0-9]|4[1-9A-Fa-f]|5[0-9Aa]|6[1-9A-Fa-f]|7[0-9Aa])/;
const DOUBLE = /%25[0-9A-Fa-f]{2}/;
const NESTED = /\bhttps?:\/\/[^\s"'<>]+|\bwww\.[^\s"'<>/]+\.[a-z]{2,}[^\s"'<>]*/i;

function parts(url: ParsedUrl, catalog: RuleCatalog): ExplainedPart[] {
  const out: ExplainedPart[] = [];
  const add = (component: string, value: string, message: MessageRef, platform?: string) =>
    out.push({ component, value, message, ...(platform ? { platform } : {}) });

  const scheme = url.scheme;
  if (scheme === 'https' || scheme === 'http')
    add('scheme', scheme, { code: `explain.part.scheme.${scheme}` });
  else
    add('scheme', scheme, {
      code: DANGEROUS.has(scheme) ? 'explain.part.scheme.dangerous' : 'explain.part.scheme.other',
      params: { scheme },
    });

  if (url.username || url.password) {
    add('userinfo', url.username + (url.password ? `:${url.password}` : ''), {
      code: 'explain.part.userinfo',
    });
  }
  if (url.host.kind !== 'none') add('host', url.host.unicode, { code: 'explain.part.host' });
  const domain = url.registrableDomain ? hostToUnicode(url.registrableDomain) : null;
  if (domain) add('registrable-domain', domain, { code: 'explain.part.registrable-domain' });
  if (url.subdomain && domain)
    add('subdomain', hostToUnicode(url.subdomain), {
      code: 'explain.part.subdomain',
      params: { domain },
    });
  if (!url.port.isDefault && url.port.value !== null) {
    add('port', String(url.port.value), {
      code: 'explain.part.port',
      params: { port: url.port.value },
    });
  }
  if (url.path.raw !== '' && url.path.raw !== '/')
    add('path', url.path.decoded, { code: 'explain.part.path' });
  for (const p of url.query) {
    const value = p.value === null ? p.name : `${p.name}=${p.value}`;
    const rule = matchParamRule(p.name, url.registrableDomain, catalog);
    if (rule)
      add(
        'param',
        value,
        { code: 'explain.part.param.tracking', params: { name: p.name, platform: rule.platform } },
        rule.platform,
      );
    else add('param', value, { code: 'explain.part.param.functional', params: { name: p.name } });
  }
  if (url.fragment !== null) add('fragment', url.fragment, { code: 'explain.part.fragment' });
  return out;
}

function signals(url: ParsedUrl, catalog: RuleCatalog): Signal[] {
  const found: Signal[] = [];
  const caution = (id: SignalId, evidence: string, params?: MessageRef['params']) =>
    found.push({
      id,
      severity: 'caution',
      message: { code: `explain.signal.${id}`, ...(params ? { params } : {}) },
      evidence,
    });
  const info = (id: SignalId, evidence: string, params?: MessageRef['params']) =>
    found.push({
      id,
      severity: 'info',
      message: { code: `explain.signal.${id}`, ...(params ? { params } : {}) },
      evidence,
    });

  const real = url.registrableDomain ? hostToUnicode(url.registrableDomain) : url.host.unicode;
  if (url.username || url.password) {
    const shown = decodeURIComponentSafe(url.username + (url.password ? `:${url.password}` : ''));
    caution('userinfo-deception', shown, { shown, real });
  }

  if (url.host.kind === 'ipv4' || url.host.kind === 'ipv6') {
    const text = url.schemeAssumed ? `https://${url.input}` : url.input;
    caution('ip-host', splitRaw(text).host || url.host.ascii);
  }

  if (url.host.kind === 'domain') {
    const labels = url.host.unicode.split('.');
    if (labels.some(isWholeScriptConfusable))
      caution('homograph', url.host.ascii, { ascii: url.host.ascii });
    if (labels.some(isMixedScript))
      caution('mixed-scripts', url.host.ascii, { ascii: url.host.ascii });
  }

  const rawPieces = [url.path.raw, ...url.query.flatMap((p) => [p.rawName, p.rawValue ?? ''])];
  const encoded = rawPieces.find(
    (piece) => ENCODED_ALNUM.test(piece) || (piece.match(/%[0-9A-Fa-f]{2}/g)?.length ?? 0) >= 10,
  );
  if (encoded) caution('excessive-encoding', encoded);
  const double = rawPieces.map((piece) => DOUBLE.exec(piece)?.[0]).find(Boolean);
  if (double) caution('double-encoding', double);

  if (DANGEROUS.has(url.scheme))
    caution('dangerous-scheme', `${url.scheme}:`, { scheme: url.scheme });

  if (!url.port.isDefault && url.port.value !== null && !COMMON_PORTS.has(url.port.value)) {
    info('unusual-port', String(url.port.value), { port: url.port.value });
  }

  const nested = [url.path.decoded, ...url.query.map((p) => p.value ?? '')]
    .map((v) => NESTED.exec(v)?.[0])
    .find(Boolean);
  if (nested) info('nested-url', nested, { nested });

  const tld = url.host.kind === 'domain' ? (url.host.ascii.split('.').pop() ?? '') : '';
  if (tld && catalog.abuseTlds.includes(tld)) info('abuse-tld', tld, { tld });

  return found.sort((a, b) => SIGNAL_IDS.indexOf(a.id) - SIGNAL_IDS.indexOf(b.id));
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function explain(input: { url: string; catalog: RuleCatalog }): Result<Explanation> {
  const parsed = parseUrl(input.url);
  if (!parsed.ok) return parsed;
  const url = parsed.value;
  return {
    ok: true,
    value: {
      url,
      parts: parts(url, input.catalog),
      signals: signals(url, input.catalog),
      catalogVersion: input.catalog.version,
    },
  };
}

const schemaIn: Schema<{ url: string }> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.url === 'string'
      ? { success: true, data: { url: data.url } }
      : { success: false },
};

const schemaOut: Schema<Explanation> = {
  safeParse: (data) =>
    isRecord(data) && Array.isArray(data.signals)
      ? { success: true, data: data as unknown as Explanation }
      : { success: false },
};

export const explainTool: ToolDefinition<{ url: string }, Explanation> = {
  id: 'explain',
  version: '1.0.0',
  runsOn: 'client',
  input: schemaIn,
  output: schemaOut,
  run({ url }, ctx) {
    if (!ctx.catalog) throw new Error('explain needs the rules catalog in its context');
    return explain({ url, catalog: ctx.catalog });
  },
  sendTo: ['clean', 'parse', 'diff', 'inspect'],
  share: {
    encode: ({ url }) => encodeFragment([['u', url]]),
    decode(fragment) {
      const url = decodeFragment(fragment).get('u');
      return url ? { url } : null;
    },
  },
};
