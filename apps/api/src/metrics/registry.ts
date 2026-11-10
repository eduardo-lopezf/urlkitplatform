/**
 * Aggregated product metrics (FR-005, research R8), exposed in Prometheus text format at
 * /internal/metrics. Labels are bounded enums (tool, outcome, code): nothing identifies a visitor.
 */
const BUCKETS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15];

export interface Metrics {
  toolRun(tool: string, outcome: string): void;
  error(tool: string, code: string): void;
  inspectDuration(seconds: number): void;
  render(): string;
}

export function createMetrics(): Metrics {
  const runs = new Map<string, number>();
  const errors = new Map<string, number>();
  const histogram = { counts: BUCKETS.map(() => 0), sum: 0, count: 0 };
  const inc = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  const label = (value: string) => value.replace(/[^a-z0-9._-]/gi, '_');

  return {
    toolRun: (tool, outcome) => inc(runs, `tool="${label(tool)}",outcome="${label(outcome)}"`),
    error: (tool, code) => inc(errors, `tool="${label(tool)}",code="${label(code)}"`),
    inspectDuration(seconds) {
      BUCKETS.forEach((le, i) => {
        if (seconds <= le) histogram.counts[i] = (histogram.counts[i] ?? 0) + 1;
      });
      histogram.sum += seconds;
      histogram.count += 1;
    },
    render() {
      const lines = [
        '# HELP tool_runs_total Tool runs by outcome.',
        '# TYPE tool_runs_total counter',
        ...[...runs].map(([labels, n]) => `tool_runs_total{${labels}} ${n}`),
        '# HELP errors_total Errors by tool and code.',
        '# TYPE errors_total counter',
        ...[...errors].map(([labels, n]) => `errors_total{${labels}} ${n}`),
        '# HELP inspect_duration_seconds Duration of a full redirect inspection.',
        '# TYPE inspect_duration_seconds histogram',
        ...BUCKETS.map(
          (le, i) => `inspect_duration_seconds_bucket{le="${le}"} ${histogram.counts[i]}`,
        ),
        `inspect_duration_seconds_bucket{le="+Inf"} ${histogram.count}`,
        `inspect_duration_seconds_sum ${histogram.sum}`,
        `inspect_duration_seconds_count ${histogram.count}`,
      ];
      return lines.join('\n') + '\n';
    },
  };
}
