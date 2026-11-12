/**
 * Metadata tool (002/T044). Server-side: the chain probe reads the document, the injected parser
 * builds its tree and the core decides what a preview would show. This module never imports the
 * parser itself (see ./html.ts), so the web bundles that load the registry stay without it.
 */
import type { Schema, ToolDefinition } from '../../registry.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';
import { extractMetadata, type PageMetadata } from './extract.ts';

export * from './encoding.ts';
export * from './extract.ts';
export type * from './types.ts';

const input: Schema<{ url: string }> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.url === 'string'
      ? { success: true, data: { url: data.url } }
      : { success: false },
};

const output: Schema<PageMetadata> = {
  safeParse: (data) =>
    isRecord(data) && isRecord(data.sources) && isRecord(data.effective)
      ? { success: true, data: data as unknown as PageMetadata }
      : { success: false },
};

export const metadataTool: ToolDefinition<{ url: string }, PageMetadata> = {
  id: 'metadata',
  version: '1.0.0',
  runsOn: 'server',
  input,
  output,
  async run({ url }, ctx) {
    if (!ctx.fetchChain) throw new Error('metadata needs a network adapter (ctx.fetchChain)');
    if (!ctx.parseHtml) throw new Error('metadata needs an HTML parser (ctx.parseHtml)');
    if (!ctx.catalog) throw new Error('metadata needs the rules catalog (ctx.catalog)');
    const observed = await ctx.fetchChain(url, { body: 'html' });
    return observed.ok
      ? { ok: true, value: extractMetadata(observed.value, ctx.catalog, ctx.parseHtml) }
      : observed;
  },
  sendTo: ['headers', 'inspect', 'clean', 'security'],
  share: {
    encode: ({ url }) => encodeFragment([['u', url]]),
    decode(fragment) {
      const url = decodeFragment(fragment).get('u');
      return url ? { url } : null;
    },
  },
};
