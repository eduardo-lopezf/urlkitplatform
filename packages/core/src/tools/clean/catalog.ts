/**
 * Shape of the compiled rules catalog. The core defines the type and receives an instance; it
 * never imports packages/rules (Principio X, research R18). Whoever injects it knows its version
 * and the result echoes it as `catalogVersion`.
 *
 * Every lookup structure is a plain record so the compiled module is serialisable data.
 */
import type { MessageCode } from '../../codes.ts';

export type RuleMode = 'safe' | 'max';

interface RuleBase {
  /** Stable, never reused (e.g. `tracking.utm`). */
  id: string;
  mode: RuleMode;
  platform: string;
  reason: MessageCode;
}

export interface ParamRule extends RuleBase {
  kind: 'tracking-param';
  /** Registrable domains where the rule applies; `null` = global. */
  domains: string[] | null;
  /** Registrable domains where the param is functional and must be kept. */
  exceptions: string[];
}

export interface WrapperRule extends RuleBase {
  kind: 'wrapper';
  /** The indexed host also matches its subdomains (`*.example.com` in the source rule). */
  subdomains: boolean;
  /** Exact path or path prefix ending in `*`. */
  path: string;
  /** Query params that may carry the destination, in priority order. */
  params: string[];
}

export interface DomainRule extends RuleBase {
  kind: 'domain-rule';
  /** Regular expression source, matched against the decoded path. */
  pathPattern: string;
  /** Replacement path, with `$1`… for capture groups. */
  canonicalPath: string;
  /** `drop` removes every query param, `keep` leaves them to the param rules. */
  query: 'drop' | 'keep';
}

export interface RuleCatalog {
  /** Semantic version of the catalog, independent of the code. */
  version: string;
  /** Lower-cased param name → rules. */
  exact: Record<string, ParamRule[]>;
  /** Lower-cased prefixes such as `utm_`. */
  prefixes: Array<{ prefix: string; rule: ParamRule }>;
  /** Lower-cased host → wrapper rules. */
  wrappers: Record<string, WrapperRule[]>;
  /** Registrable domain → domain rules. */
  domains: Record<string, DomainRule[]>;
  /** TLDs frequently used for abuse, without the dot (Explain URL). */
  abuseTlds: string[];
  /** v2 criteria (002 research R8). Optional so MVP-only catalogs stay valid. */
  security?: SecurityCriteria;
  metadata?: MetadataCriteria;
}

export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface HeaderCriteria {
  hsts: { minMaxAge: number };
  /** Lower-cased CSP sources that make `script-src` unsafe. */
  csp: { unsafeScriptSources: string[] };
  frameOptions: { valid: string[] };
  referrerPolicy: { valid: string[]; unsafe: string[] };
}

export interface TlsCriteria {
  expiringSoonDays: number;
  /** Hash names matched inside the signature algorithm (e.g. `sha1`). */
  weakSignatures: string[];
  legacyProtocols: string[];
}

export interface SecurityCriteria {
  headers: HeaderCriteria;
  tls: TlsCriteria;
  /** Message code → severity of the finding it produces. */
  severities: Record<string, Severity>;
}

export type MetadataSource = 'openGraph' | 'twitter' | 'basic';
export type MetadataField = 'title' | 'description' | 'image' | 'url' | 'siteName' | 'type';

export interface MetadataCriteria {
  precedence: Record<MetadataField, MetadataSource[]>;
}
