/** TLS tool (002/T058). Server-side: the connector observes the handshake, the core evaluates. */
import type { Schema, ToolDefinition } from '../../registry.ts';
import { analyzeHost } from '../../url/host.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';
import { analyzeTls, type TlsAnalysis } from './analyze.ts';

export * from './analyze.ts';
export type * from './types.ts';

const DEFAULT_PORT = 443;

const input: Schema<{ target: string }> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.target === 'string'
      ? { success: true, data: { target: data.target } }
      : { success: false },
};

const output: Schema<TlsAnalysis> = {
  safeParse: (data) =>
    isRecord(data) && Array.isArray(data.chain) && Array.isArray(data.problems)
      ? { success: true, data: data as unknown as TlsAnalysis }
      : { success: false },
};

export const tlsTool: ToolDefinition<{ target: string }, TlsAnalysis> = {
  id: 'tls',
  version: '1.0.0',
  runsOn: 'server',
  input,
  output,
  async run({ target }, ctx) {
    const host = analyzeHost(target);
    if (!host.ok) return host;
    if (!ctx.probeTls) throw new Error('tls needs a network adapter (ctx.probeTls)');
    if (!ctx.catalog) throw new Error('tls needs the rules catalog (ctx.catalog)');
    // The explicit port of the input, or 443: TLS is checked where https would connect.
    const port = host.value.port ?? DEFAULT_PORT;
    const observed = await ctx.probeTls({
      host: host.value.ascii,
      port,
      sni: host.value.kind === 'name',
    });
    return {
      ok: true,
      value: analyzeTls({ input: target, host: host.value, port }, observed, ctx.catalog),
    };
  },
  sendTo: ['headers', 'dns', 'security'],
  share: {
    encode: ({ target }) => encodeFragment([['u', target]]),
    decode(fragment) {
      const target = decodeFragment(fragment).get('u');
      return target ? { target } : null;
    },
  },
};
