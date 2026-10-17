// S03-088 (XC-06): usage report latency with the effective view in the gate.
//
// Drives POST /instances/{instanceSlug}/entitlements/{entitlementSlug}/usage at
// a constant arrival rate and checks:
//   - report p99 <= 1.10 x the baseline's (§6.1 rule 5, §22.2), when
//     BASELINE_P99_MS is given (the same run against a pre-billing build);
//   - no error other than 409 ReportEntitlementUsageMetric.ThresholdExceeded.
//
// Environment:
//   API_URL          the API base, e.g. http://localhost:6060/api
//   TOKEN            a ksh_ token with read:instances and write:instances
//   RATE             reports per second (1000)
//   DURATION         how long (10m)
//   PAIRS            how many (instance, NUMBER entitlement) pairs to spread over (2000)
//   BASELINE_P99_MS  the baseline run's p99, in ms; the threshold is 1.10 x it
//
// Run (see README.md for the baseline and the dataset):
//   k6 run -e API_URL=... -e TOKEN=... api/tests/load/report_usage_effective.js
import http from 'k6/http';
import { check, fail } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const API = __ENV.API_URL || 'http://localhost:6060/api';
const RATE = Number(__ENV.RATE || 1000);
const DURATION = __ENV.DURATION || '10m';
const PAIRS = Number(__ENV.PAIRS || 2000);
const BASELINE = Number(__ENV.BASELINE_P99_MS || 0);

const reportLatency = new Trend('report_latency', true);
const unexpected = new Rate('unexpected_errors');

const thresholds = { unexpected_errors: ['rate==0'] };
if (BASELINE > 0) {
  thresholds.report_latency = [`p(99)<=${(BASELINE * 1.1).toFixed(3)}`];
}

export const options = {
  scenarios: {
    reports: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(50, Math.ceil(RATE / 10)),
      maxVUs: Math.max(200, RATE),
    },
  },
  thresholds,
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

function headers() {
  if (!__ENV.TOKEN) fail('TOKEN is required');
  return { Authorization: `Bearer ${__ENV.TOKEN}`, 'Content-Type': 'application/json' };
}

function pages(path) {
  const items = [];
  let cursor = '';
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const res = http.get(`${API}${path}${sep}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: headers() });
    if (res.status !== 200) fail(`GET ${path}: ${res.status} ${res.body}`);
    const body = res.json();
    items.push(...(body.items || []));
    if (!body.hasMore || !body.nextCursor || items.length >= PAIRS) return items;
    cursor = body.nextCursor;
  }
}

// setup collects (instance, NUMBER entitlement) pairs the instances' licences
// grant: the reports the gate looks up the effective view for.
export function setup() {
  const pairs = [];
  for (const instance of pages('/instances')) {
    const res = http.get(`${API}/instances/${instance.slug}/entitlements/usage`, { headers: headers() });
    if (res.status !== 200) continue;
    for (const usage of res.json()) {
      if (usage.limit && usage.limit.type === 'number') pairs.push([instance.slug, usage.entitlementSlug]);
      if (pairs.length >= PAIRS) return { pairs };
    }
  }
  if (pairs.length === 0) fail('no (instance, NUMBER entitlement) pair to report on');
  return { pairs };
}

export default function (data) {
  const [instance, entitlement] = data.pairs[Math.floor(Math.random() * data.pairs.length)];
  const res = http.post(
    `${API}/instances/${instance}/entitlements/${entitlement}/usage`,
    JSON.stringify({ value: { type: 'number', value: 1 }, behavior: 'append' }),
    { headers: headers(), tags: { name: 'report' } },
  );
  reportLatency.add(res.timings.duration);
  const refused = res.status === 409 && String(res.body).includes('ThresholdExceeded');
  unexpected.add(res.status >= 300 && !refused);
  check(res, { 'accepted or over its threshold': (r) => r.status < 300 || refused });
}
