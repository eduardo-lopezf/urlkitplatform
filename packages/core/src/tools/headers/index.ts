/** HTTP Headers tool (002/T031). Server-side: the chain probe observes, the core evaluates. */
import type { Schema, ToolDefinition } from '../../registry.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';
import { analyzeHeaders, type HeadersAnalysis } from './analyze.ts';

export * from './analyze.ts';
export type * from './types.ts';

const input: Schema<{ url: string }> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.url === 'string'
      ? { success: true, data: { url: data.url } }
      : { success: false },
};

const output: Schema<HeadersAnalysis> = {
  safeParse: (data) =>
    isRecord(data) && Array.isArray(data.headers) && Array.isArray(data.security)
      ? { success: true, data: data as unknown as HeadersAnalysis }
      : { success: false },
};

export const headersTool: ToolDefinition<{ url: string }, HeadersAnalysis> = {
  id: 'headers',
  version: '1.0.0',
  runsOn: 'server',
  input,
  output,
  async run({ url }, ctx) {
    if (!ctx.fetchChain) throw new Error('headers needs a network adapter (ctx.fetchChain)');
    if (!ctx.catalog) throw new Error('headers needs the rules catalog (ctx.catalog)');
    const observed = await ctx.fetchChain(url, { body: 'none' });
    return observed.ok
      ? { ok: true, value: analyzeHeaders(observed.value, ctx.catalog) }
      : observed;
  },
  sendTo: ['tls', 'inspect', 'security', 'explain'],
  share: {
    // Opening a shared link fills the input; the analysis still needs an explicit click.
    encode: ({ url }) => encodeFragment([['u', url]]),
    decode(fragment) {
      const url = decodeFragment(fragment).get('u');
      return url ? { url } : null;
    },
  },
};
