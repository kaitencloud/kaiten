# Load tests

## `report_usage_effective.js` — usage report latency with the effective view (S03-088)

The usage gate reads `instance_effective_entitlement` on every report. The
contract (§6.1 rule 5, §22.2) is that report p99 stays within 1.10 × the p99
of a build without billing, on the same dataset, and that no report fails
other than with `409 ReportEntitlementUsageMetric.ThresholdExceeded`.

The view's own plan and lookup latency are checked by
`tests/integrations/billing/effective_load_test.go` (S03-042,
`go test -tags load`). This script measures the whole report path over HTTP.

### Run

1. **Baseline.** Start the stack on a build without billing (the last
   `main` before #16), seed it (`stress-test` profile, scaled to the dataset
   below), and run:

   ```sh
   k6 run --summary-export baseline.json \
     -e API_URL=http://localhost:6060/api -e TOKEN=$TOKEN \
     api/tests/load/report_usage_effective.js
   ```

2. **Candidate.** Same dataset on this build, with add-ons attached and boost
   vouchers redeemed on 30 % of the (instance, entitlement) pairs, then:

   ```sh
   k6 run -e API_URL=... -e TOKEN=$TOKEN \
     -e BASELINE_P99_MS=$(jq '.metrics.report_latency["p(99)"]' baseline.json) \
     api/tests/load/report_usage_effective.js
   ```

   The run fails when p99 exceeds 1.10 × the baseline's, or when any report
   fails for another reason than its threshold.

Defaults: 1,000 reports/s for 10 minutes over 2,000 pairs (`RATE`,
`DURATION`, `PAIRS`). The dataset of S03-088 is 10,000 subscriptions, of
which 30 % of the pairs carry add-ons and boosts.

### Not wired yet

The nightly `billing-load` job of the test plan, which builds both images,
brings the two stacks up, scales the seed and compares the runs, is not in
`.github/workflows` yet.
