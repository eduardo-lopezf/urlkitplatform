import { describe, expect, it } from 'vitest';
import { clientIpFrom } from '../../src/quota/client-ip.ts';

describe('client IP for the quota subject', () => {
  it('uses the connection address when the proxy is not trusted', () => {
    expect(
      clientIpFrom({ forwardedFor: '198.51.100.9', remote: '203.0.113.7', trustProxy: false }),
    ).toBe('203.0.113.7');
  });

  it('uses the address our proxy appended, not one the client wrote', () => {
    // The client sends a forged header; the proxy appends the real address at the end.
    expect(
      clientIpFrom({
        forwardedFor: '198.51.100.9, 192.0.2.44',
        remote: '172.30.0.5',
        trustProxy: true,
      }),
    ).toBe('192.0.2.44');
  });

  it('accepts a single entry and trims spaces', () => {
    expect(
      clientIpFrom({ forwardedFor: ' 192.0.2.44 ', remote: '172.30.0.5', trustProxy: true }),
    ).toBe('192.0.2.44');
  });

  it('falls back to the connection address when the header is missing or empty', () => {
    expect(clientIpFrom({ forwardedFor: undefined, remote: '172.30.0.5', trustProxy: true })).toBe(
      '172.30.0.5',
    );
    expect(clientIpFrom({ forwardedFor: ' , ', remote: '172.30.0.5', trustProxy: true })).toBe(
      '172.30.0.5',
    );
  });

  it('returns "unknown" when nothing identifies the connection', () => {
    expect(clientIpFrom({ forwardedFor: undefined, remote: undefined, trustProxy: false })).toBe(
      'unknown',
    );
  });
});
