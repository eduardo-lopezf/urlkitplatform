/** DNS tool (002/T070). Server-side: the DoH client observes, the core interprets. */
import type { Schema, ToolDefinition } from '../../registry.ts';
import { toolError } from '../../types.ts';
import { analyzeHost } from '../../url/host.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';
import { analyzeDns, dnsNames, type DnsLookup, type DnsScope } from './analyze.ts';

export * from './analyze.ts';
export * from './types.ts';

interface DnsInput {
  target: string;
  scope: DnsScope;
}

const input: Schema<DnsInput> = {
  safeParse: (data) =>
    isRecord(data) &&
    typeof data.target === 'string' &&
    (data.scope === undefined || data.scope === 'host' || data.scope === 'registrable')
      ? { success: true, data: { target: data.target, scope: data.scope ?? 'host' } }
      : { success: false },
};

const output: Schema<DnsLookup> = {
  safeParse: (data) =>
    isRecord(data) && isRecord(data.records) && typeof data.outcome === 'string'
      ? { success: true, data: data as unknown as DnsLookup }
      : { success: false },
};

export const dnsTool: ToolDefinition<DnsInput, DnsLookup> = {
  id: 'dns',
  version: '1.0.0',
  runsOn: 'server',
  input,
  output,
  async run({ target, scope }, ctx) {
    const host = analyzeHost(target);
    if (!host.ok) return host;
    // Nothing is queried for an IP or a name that public DNS never answers (research R6).
    if (host.value.kind === 'ip') return { ok: false, error: toolError('dns.ip-literal', 'host') };
    if (host.value.specialUse) return { ok: false, error: toolError('dns.special-use', 'host') };
    if (!ctx.queryDns) throw new Error('dns needs a network adapter (ctx.queryDns)');
    const { name } = dnsNames(host.value, scope);
    const observed = await ctx.queryDns(name.ascii, {
      dmarcOf: host.value.registrable ?? name.ascii,
    });
    if ('kind' in observed) return { ok: false, error: toolError('dns.unavailable') };
    return { ok: true, value: analyzeDns({ input: target, host: host.value, scope }, observed) };
  },
  sendTo: ['tls', 'headers', 'security'],
  share: {
    encode: ({ target, scope }) =>
      encodeFragment([
        ['u', target],
        ['t', scope],
      ]),
    decode(fragment) {
      const values = decodeFragment(fragment);
      const target = values.get('u');
      if (!target) return null;
      return { target, scope: values.get('t') === 'registrable' ? 'registrable' : 'host' };
    },
  },
};
