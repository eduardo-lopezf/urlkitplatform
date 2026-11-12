/**
 * Security Analysis tool (002/T083, research R7). It runs Explain URL, follows the chain with its
 * headers, then checks TLS and DNS of the destination in parallel, calling the network adapters
 * directly: never other tools through the registry, so only its own quota is used (FR-065).
 */
import type { Schema, ToolDefinition } from '../../registry.ts';
import { toolError } from '../../types.ts';
import { analyzeHost } from '../../url/host.ts';
import { dnsTool } from '../dns/index.ts';
import type { DnsLookup } from '../dns/analyze.ts';
import { explain } from '../explain/index.ts';
import { analyzeHeaders, type HeadersAnalysis } from '../headers/analyze.ts';
import type { RedirectChain } from '../inspect/types.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';
import { analyzeTls, type TlsAnalysis } from '../tls/analyze.ts';
import { review, type Part, type SecurityReview } from './review.ts';
import { reviewTargets } from './targets.ts';

export * from './review.ts';
export * from './targets.ts';

const input: Schema<{ url: string }> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.url === 'string'
      ? { success: true, data: { url: data.url } }
      : { success: false },
};

const output: Schema<SecurityReview> = {
  safeParse: (data) =>
    isRecord(data) && Array.isArray(data.findings) && isRecord(data.parts)
      ? { success: true, data: data as unknown as SecurityReview }
      : { success: false },
};

export const securityTool: ToolDefinition<{ url: string }, SecurityReview> = {
  id: 'security',
  version: '1.0.0',
  runsOn: 'server',
  input,
  output,
  async run({ url }, ctx) {
    const { catalog, fetchChain, probeTls, queryDns } = ctx;
    if (!catalog) throw new Error('security needs the rules catalog (ctx.catalog)');
    if (!fetchChain || !probeTls || !queryDns)
      throw new Error('security needs fetchChain, probeTls and queryDns');

    const explained = explain({ url, catalog });
    if (!explained.ok) return explained;
    // Only web links are reviewed; Explain URL alone accepts any scheme.
    const scheme = explained.value.url.scheme;
    if (scheme !== 'http' && scheme !== 'https')
      return { ok: false, error: toolError('url.unsupported-scheme', 'scheme') };
    const observed = await fetchChain(url, { body: 'none' });
    if (!observed.ok) return observed;

    const { chain, finalResponse } = observed.value;
    const stop = chain.hops.at(-1)?.error;
    const redirects: Part<RedirectChain> =
      chain.stopReason === 'blocked'
        ? { state: 'skipped', reason: stop ?? { code: 'inspect.blocked' } }
        : chain.stopReason === 'timeout' || chain.stopReason === 'error'
          ? { state: 'incomplete', reason: stop ?? { code: 'inspect.network' }, value: chain }
          : { state: 'complete', value: chain };
    const headers: Part<HeadersAnalysis> =
      chain.stopReason === 'final' && finalResponse
        ? { state: 'complete', value: analyzeHeaders(observed.value, catalog) }
        : redirects.state === 'complete'
          ? {
              state: 'incomplete',
              reason: { code: 'security.part-skipped', params: { part: 'headers' } },
            }
          : { state: redirects.state, reason: redirects.reason };

    const targets = reviewTargets(chain);
    const tlsPart = async (): Promise<Part<TlsAnalysis>> => {
      if ('skipped' in targets.tls) return { state: 'skipped', reason: targets.tls.skipped };
      const host = analyzeHost(targets.tls.host);
      if (!host.ok)
        return {
          state: 'skipped',
          reason: { code: 'security.part-skipped', params: { part: 'tls' } },
        };
      const value = analyzeTls(
        { input: targets.tls.host, host: host.value, port: targets.tls.port },
        await probeTls(targets.tls),
        catalog,
      );
      if (value.blocked) return { state: 'skipped', reason: value.blocked };
      if (value.error) return { state: 'incomplete', reason: value.error };
      return { state: 'complete', value };
    };
    const dnsPart = async (): Promise<Part<DnsLookup>> => {
      if ('skipped' in targets.dns) return { state: 'skipped', reason: targets.dns.skipped };
      const result = await dnsTool.run(targets.dns, { queryDns });
      if (result.ok) return { state: 'complete', value: result.value };
      return result.error.code === 'dns.unavailable'
        ? { state: 'incomplete', reason: result.error.message }
        : { state: 'skipped', reason: result.error.message };
    };
    const [tls, dns] = await Promise.all([tlsPart(), dnsPart()]);

    return {
      ok: true,
      value: review(
        {
          input: url,
          explain: { state: 'complete', value: explained.value },
          redirects,
          headers,
          tls,
          dns,
        },
        catalog,
      ),
    };
  },
  sendTo: ['explain', 'inspect', 'headers', 'tls', 'dns'],
  share: {
    encode: ({ url }) => encodeFragment([['u', url]]),
    decode(fragment) {
      const url = decodeFragment(fragment).get('u');
      return url ? { url } : null;
    },
  },
};
