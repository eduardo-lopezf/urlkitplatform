/**
 * Security Analysis review (002/T082, research R7). Pure: it turns the results of the other
 * tools into findings, graded with the catalog and ordered by severity, then by tool. It adds no
 * network rule of its own, and it never computes a score, a grade or a verdict (FR-064).
 */
import type { MessageCode } from '../../codes.ts';
import type { MessageRef } from '../../types.ts';
import { analyzeHost } from '../../url/host.ts';
import type { RuleCatalog, Severity } from '../clean/catalog.ts';
import type { DnsLookup } from '../dns/analyze.ts';
import type { Explanation } from '../explain/index.ts';
import type { HeadersAnalysis } from '../headers/analyze.ts';
import type { RedirectChain } from '../inspect/types.ts';
import type { TlsAnalysis } from '../tls/analyze.ts';

export type FindingTool = 'explain' | 'inspect' | 'headers' | 'tls' | 'dns';

export interface Finding {
  code: MessageCode;
  severity: Severity;
  tool: FindingTool;
  params?: Record<string, string | number>;
}

/**
 * A part of the review. An incomplete part may carry what was observed before it stopped (e.g.
 * the hops of a chain that timed out), so its findings are not lost (FR-062).
 */
export type Part<T> =
  | { state: 'complete'; value: T }
  | { state: 'incomplete'; reason: MessageRef; value?: T }
  | { state: 'skipped'; reason: MessageRef };

export interface ReviewParts {
  input: string;
  explain: Part<Explanation>;
  redirects: Part<RedirectChain>;
  headers: Part<HeadersAnalysis>;
  tls: Part<TlsAnalysis>;
  dns: Part<DnsLookup>;
}

export type PartName = 'explain' | 'redirects' | 'headers' | 'tls' | 'dns';

export interface SecurityReview {
  input: string;
  finalUrl: string | null;
  findings: Finding[];
  parts: Record<PartName, { state: 'complete' | 'incomplete' | 'skipped'; reason?: MessageRef }>;
  scope: { checked: FindingTool[]; notChecked: Array<'reputation' | 'content'> };
  catalogVersion: string;
}

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low', 'info'];
const TOOL_ORDER: FindingTool[] = ['explain', 'inspect', 'headers', 'tls', 'dns'];
const PART_TOOL: Record<PartName, FindingTool> = {
  explain: 'explain',
  redirects: 'inspect',
  headers: 'headers',
  tls: 'tls',
  dns: 'dns',
};

const hostOf = (url: string) => {
  const h = analyzeHost(url);
  return h.ok ? h.value.unicode : url;
};

function refs(
  parts: ReviewParts,
): Array<{ tool: FindingTool; ref: MessageRef; fallback?: Severity }> {
  const out: Array<{ tool: FindingTool; ref: MessageRef; fallback?: Severity }> = [];
  if (parts.explain.state === 'complete')
    for (const s of parts.explain.value.signals)
      out.push({
        tool: 'explain',
        ref: s.message,
        fallback: s.severity === 'caution' ? 'medium' : 'info',
      });

  const chain = parts.redirects.state === 'skipped' ? undefined : parts.redirects.value;
  if (chain) {
    const seen = new Set<string>();
    for (const hop of chain.hops)
      for (const flag of hop.flags) {
        const code =
          flag === 'https-downgrade'
            ? 'security.hop.https-downgrade'
            : 'security.hop.domain-change';
        const host = hostOf(hop.url);
        if (seen.has(`${code}|${host}`)) continue;
        seen.add(`${code}|${host}`);
        out.push({ tool: 'inspect', ref: { code, params: { host } } });
      }
  } else if (
    parts.redirects.state === 'skipped' &&
    parts.redirects.reason.code.startsWith('inspect.blocked')
  )
    out.push({ tool: 'inspect', ref: parts.redirects.reason });

  if (parts.headers.state === 'complete') {
    for (const check of parts.headers.value.security)
      for (const f of check.findings) out.push({ tool: 'headers', ref: f });
    for (const cookie of parts.headers.value.cookies)
      for (const f of cookie.findings) out.push({ tool: 'headers', ref: f });
  }
  if (parts.tls.state === 'complete')
    for (const p of parts.tls.value.problems) out.push({ tool: 'tls', ref: p });
  if (parts.dns.state === 'complete')
    for (const w of parts.dns.value.warnings) out.push({ tool: 'dns', ref: w });
  return out;
}

export function review(parts: ReviewParts, catalog: RuleCatalog): SecurityReview {
  const severities = catalog.security?.severities ?? {};
  const findings = refs(parts)
    .map(({ tool, ref, fallback }, i) => ({
      i,
      finding: {
        code: ref.code,
        severity: severities[ref.code] ?? fallback ?? 'info',
        tool,
        ...(ref.params ? { params: ref.params } : {}),
      } satisfies Finding,
    }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.finding.severity) - SEVERITY_ORDER.indexOf(b.finding.severity) ||
        TOOL_ORDER.indexOf(a.finding.tool) - TOOL_ORDER.indexOf(b.finding.tool) ||
        a.i - b.i,
    )
    .map((x) => x.finding);

  const names: PartName[] = ['explain', 'redirects', 'headers', 'tls', 'dns'];
  const state = (name: PartName) => {
    const part = parts[name];
    return part.state === 'complete'
      ? { state: part.state }
      : { state: part.state, reason: part.reason };
  };

  return {
    input: parts.input,
    finalUrl: parts.redirects.state === 'complete' ? parts.redirects.value.final : null,
    findings,
    parts: Object.fromEntries(names.map((n) => [n, state(n)])) as SecurityReview['parts'],
    scope: {
      checked: names.filter((n) => parts[n].state === 'complete').map((n) => PART_TOOL[n]),
      notChecked: ['reputation', 'content'],
    },
    catalogVersion: catalog.version,
  };
}
