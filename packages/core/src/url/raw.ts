/**
 * Splits a URL string into its components exactly as written, before any normalisation.
 * The WHATWG parser normalises while parsing (host case, default port, encodings); URL Diff and
 * the parser warnings need the original spelling to tell cosmetic differences from real ones.
 */
export interface RawParts {
  scheme: string | null;
  userinfo: string | null;
  host: string | null;
  port: string | null;
  path: string;
  query: string | null;
  fragment: string | null;
}

export const SPECIAL_SCHEMES = new Set(['http', 'https', 'ws', 'wss', 'ftp', 'file']);

export function splitRaw(input: string): RawParts {
  let rest = input.replace(/[\t\n\r]/g, '');
  const parts: RawParts = {
    scheme: null,
    userinfo: null,
    host: null,
    port: null,
    path: '',
    query: null,
    fragment: null,
  };

  const hashAt = rest.indexOf('#');
  if (hashAt >= 0) {
    parts.fragment = rest.slice(hashAt + 1);
    rest = rest.slice(0, hashAt);
  }
  const queryAt = rest.indexOf('?');
  if (queryAt >= 0) {
    parts.query = rest.slice(queryAt + 1);
    rest = rest.slice(0, queryAt);
  }

  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(rest);
  if (scheme?.[1]) {
    parts.scheme = scheme[1];
    rest = rest.slice(scheme[0].length);
  }
  const special = parts.scheme === null || SPECIAL_SCHEMES.has(parts.scheme.toLowerCase());
  if (special) rest = rest.replace(/\\/g, '/');

  if (rest.startsWith('//')) {
    rest = rest.slice(2);
    const end = rest.search(/\//);
    const authority = end >= 0 ? rest.slice(0, end) : rest;
    parts.path = end >= 0 ? rest.slice(end) : '';
    const at = authority.lastIndexOf('@');
    if (at >= 0) parts.userinfo = authority.slice(0, at);
    const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
    const portMatch = hostPort.startsWith('[')
      ? /^(\[[^\]]*\])(?::(.*))?$/.exec(hostPort)
      : /^([^:]*)(?::(.*))?$/.exec(hostPort);
    parts.host = portMatch?.[1] ?? hostPort;
    parts.port = portMatch?.[2] ?? null;
  } else {
    parts.path = rest;
  }
  return parts;
}
