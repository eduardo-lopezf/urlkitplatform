import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/privacy/logger.ts';
import { quotaSubjectInput, subjectHash } from '../../src/privacy/subject-hash.ts';
import { post, SECRET, T0, testApp } from '../helpers.ts';

const SENSITIVE = ['https://', 'utm_source', 'secret-path', '203.0.113.7', '2001:db8'];

describe('structured logger', () => {
  it('never outputs URL, query or IP fields', () => {
    const lines: string[] = [];
    const log = createLogger((line) => lines.push(line));
    log.info('inspect.done', {
      url: 'https://ejemplo.com/secret-path?utm_source=x',
      query: 'utm_source=x',
      input: 'https://ejemplo.com/',
      ip: '203.0.113.7',
      href: 'https://ejemplo.com/',
      location: 'https://ejemplo.com/',
      tool: 'inspect',
      status: 200,
      domain: 'ejemplo.com',
    });
    const out = lines.join('\n');
    for (const needle of SENSITIVE) expect(out).not.toContain(needle);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      event: 'inspect.done',
      tool: 'inspect',
      status: 200,
      domain: 'ejemplo.com',
    });
  });

  it('redacts URLs and IPs even inside allowed fields', () => {
    const lines: string[] = [];
    createLogger((line) => lines.push(line)).error('oops', {
      code: 'see https://ejemplo.com/secret-path',
      domain: '203.0.113.7',
    });
    const out = lines.join('\n');
    for (const needle of SENSITIVE) expect(out).not.toContain(needle);
  });

  it('logs nothing sensitive while serving the API', async () => {
    const { app, lines } = testApp();
    await post(app, '/v1/clean', { url: 'https://ejemplo.com/secret-path?utm_source=x&id=1' });
    await post(
      app,
      '/v1/inspect',
      { url: 'https://ejemplo.com/secret-path' },
      { 'x-test-ip': '2001:db8::1' },
    );
    await post(app, '/v1/parse', '{not json');
    expect(lines.length).toBeGreaterThan(0);
    const out = lines.join('\n');
    for (const needle of SENSITIVE) expect(out).not.toContain(needle);
  });
});

describe('subjectHash', () => {
  const day1 = new Date(T0);
  const day2 = new Date(T0 + 24 * 3600 * 1000);

  it('is an HMAC-SHA256 hex digest that never contains the IP', () => {
    const hash = subjectHash('203.0.113.7', SECRET, day1);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('203');
  });

  it('is stable within a UTC day and changes when the day changes', () => {
    const late = new Date(Date.UTC(2026, 10, 6, 23, 59, 59));
    expect(subjectHash('203.0.113.7', SECRET, day1)).toBe(subjectHash('203.0.113.7', SECRET, late));
    expect(subjectHash('203.0.113.7', SECRET, day1)).not.toBe(
      subjectHash('203.0.113.7', SECRET, day2),
    );
  });

  it('depends on the server secret', () => {
    expect(subjectHash('203.0.113.7', SECRET, day1)).not.toBe(
      subjectHash('203.0.113.7', 'another-secret-value-0123456789', day1),
    );
  });

  it('reduces IPv6 to its /64 prefix and unwraps IPv4-mapped addresses', () => {
    expect(quotaSubjectInput('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(quotaSubjectInput('2001:0db8:0001:0002:ffff:0:0:9')).toBe('2001:db8:1:2::/64');
    expect(quotaSubjectInput('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(subjectHash('2001:db8:1:2::1', SECRET, day1)).toBe(
      subjectHash('2001:db8:1:2:ffff::9', SECRET, day1),
    );
    expect(subjectHash('2001:db8:1:2::1', SECRET, day1)).not.toBe(
      subjectHash('2001:db8:1:3::1', SECRET, day1),
    );
  });
});
