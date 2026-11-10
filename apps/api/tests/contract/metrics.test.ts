import { describe, expect, it } from 'vitest';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

describe('POST /v1/metrics/events and GET /v1/openapi.json', () => {
  it('204 for a valid event and counts it', async () => {
    const { app, deps } = testApp();
    const res = await post(app, '/v1/metrics/events', { tool: 'clean', outcome: 'copied' });
    expect(res.status).toBe(204);
    await expectContract(res, 'post', '/metrics/events');
    expect(deps.metrics.render()).toContain('tool_runs_total{tool="clean",outcome="copied"} 1');
  });

  it('400 for extra properties (no identifiers can sneak in)', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/metrics/events', {
      tool: 'clean',
      outcome: 'success',
      url: 'https://x.example/',
    });
    expect(res.status).toBe(400);
    await expectContract(res, 'post', '/metrics/events');
  });

  it('serves the published OpenAPI document', async () => {
    const { app } = testApp();
    const res = await app.request('/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      openapi: '3.1.0',
      components: { securitySchemes: { apiKey: { scheme: 'bearer' } } },
    });
  });

  it('exposes aggregated metrics in Prometheus format', async () => {
    const { app } = testApp();
    await post(app, '/v1/clean', { url: 'https://a.example/' });
    const text = await (await app.request('/internal/metrics')).text();
    expect(text).toContain('# TYPE tool_runs_total counter');
    expect(text).toContain('tool_runs_total{tool="clean",outcome="success"} 1');
    expect(text).toContain('inspect_duration_seconds_count');
  });
});
