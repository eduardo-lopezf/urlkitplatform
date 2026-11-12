/**
 * Message and error codes emitted by the core: the single source of truth (Principio X).
 *
 * Codes are part of the public contract. A published code never changes meaning and is never
 * removed without an announced deprecation; texts for people live in packages/i18n.
 * Structure: `<tool>.<category>.<case>` (docs/arquitectura.md §8).
 *
 * Quota and authentication codes are not here: they belong to the adapter and are declared in
 * packages/contracts/src/errors.ts.
 */
export const CODES = [
  // Errors returned as ToolError.code
  'url.invalid',
  'url.too-long',
  'url.unsupported-scheme',
  // v2: host input of TLS and DNS (002/T016)
  'host.invalid',
  'dns.ip-literal',
  'dns.special-use',

  // Inspector hop errors (Hop.error). `inspect.blocked` is the generic block; the sub-codes say why.
  'inspect.blocked',
  'inspect.blocked.private-address',
  'inspect.blocked.scheme',
  'inspect.blocked.credentials',
  'inspect.blocked.port',
  'inspect.blocked.unresolvable',
  'inspect.timeout',
  'inspect.tls',
  'inspect.network',
  'inspect.invalid-location',

  // Input and parser warnings (ParsedUrl.warnings)
  'input.multiple-urls',
  'input.scheme-assumed',
  'parse.warning.backslash',
  'parse.warning.control-chars',
  'parse.warning.numeric-ipv4',
  'parse.warning.invalid-encoding',
  'parse.warning.non-special-scheme',

  // Reasons for removing something in Smart Cleaner (CleaningRule.reason)
  'clean.reason.campaign',
  'clean.reason.ad-click',
  'clean.reason.email',
  'clean.reason.analytics',
  'clean.reason.social',
  'clean.reason.affiliate',
  'clean.reason.wrapper',
  'clean.reason.canonical',

  // Explain URL: one code per explained part
  'explain.part.scheme.https',
  'explain.part.scheme.http',
  'explain.part.scheme.dangerous',
  'explain.part.scheme.other',
  'explain.part.userinfo',
  'explain.part.host',
  'explain.part.registrable-domain',
  'explain.part.subdomain',
  'explain.part.port',
  'explain.part.path',
  'explain.part.param.tracking',
  'explain.part.param.functional',
  'explain.part.fragment',

  // Explain URL: signals (informational notices, never a verdict)
  'explain.signal.userinfo-deception',
  'explain.signal.ip-host',
  'explain.signal.homograph',
  'explain.signal.mixed-scripts',
  'explain.signal.excessive-encoding',
  'explain.signal.double-encoding',
  'explain.signal.dangerous-scheme',
  'explain.signal.unusual-port',
  'explain.signal.nested-url',
  'explain.signal.abuse-tld',

  // HTTP Headers (002/T029): one code per finding about a security header or a cookie
  'headers.hsts.missing',
  'headers.hsts.short-max-age',
  'headers.hsts.invalid',
  'headers.csp.missing',
  'headers.csp.report-only',
  'headers.csp.unsafe-inline',
  'headers.csp.unsafe-eval',
  'headers.csp.unsafe-source',
  'headers.csp.no-script-restriction',
  'headers.framing.missing',
  'headers.framing.invalid',
  'headers.nosniff.missing',
  'headers.nosniff.invalid',
  'headers.referrer.missing',
  'headers.referrer.unsafe-url',
  'headers.referrer.invalid',
  'headers.permissions.missing',
  'headers.cookie.not-secure',
  'headers.cookie.not-httponly',
  'headers.cookie.samesite-none-insecure',

  // Metadata (002/T041): warnings about what a link preview would show
  'metadata.missing-title',
  'metadata.missing-description',
  'metadata.missing-image',
  'metadata.canonical-cross-domain',
  'metadata.image-relative',
  'metadata.truncated',
  'metadata.not-html',
  'metadata.unknown-encoding',

  // TLS (002/T054): certificate problems and connection failures
  'tls.expired',
  'tls.not-yet-valid',
  'tls.self-signed',
  'tls.name-mismatch',
  'tls.incomplete-chain',
  'tls.untrusted-root',
  'tls.expiring-soon',
  'tls.weak-signature',
  'tls.legacy-protocol',
  'tls.timeout',
  'tls.refused',
  'tls.no-tls',
  'tls.handshake-failed',

  // DNS (002/T067): outcome, DNSSEC state and configuration warnings
  'dns.unavailable',
  'dns.nxdomain',
  'dns.failed',
  'dns.bogus',
  'dns.unsigned',
  'dns.no-caa',
  'dns.no-spf',
  'dns.no-dmarc',

  // Security Analysis (002/T080): findings of its own and how the review is scoped
  'security.part-skipped',
  'security.hop.https-downgrade',
  'security.hop.domain-change',
  'security.not-checked.reputation',
  'security.not-checked.content',
] as const;

Object.freeze(CODES);

export type MessageCode = (typeof CODES)[number];

/** Codes the core may return as `ToolError.code`. */
export const ERROR_CODES = [
  'url.invalid',
  'url.too-long',
  'url.unsupported-scheme',
  'host.invalid',
  'dns.ip-literal',
  'dns.special-use',
  'dns.unavailable',
] as const;
export type CoreErrorCode = (typeof ERROR_CODES)[number];

/** Codes a rule may use as its `reason`. */
export const CLEAN_REASON_CODES = CODES.filter((c) => c.startsWith('clean.reason.'));

export function isMessageCode(value: string): value is MessageCode {
  return (CODES as readonly string[]).includes(value);
}
