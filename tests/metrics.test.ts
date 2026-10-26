import assert from "node:assert/strict";
import test from "node:test";
import {
  computePercentile,
  evaluateMetric,
  METRICS,
} from "../src/data/metrics";

const metric = (key: string) => {
  const result = METRICS.find((item) => item.key === key);
  assert.ok(result, `Expected metric ${key}`);
  return result;
};

test("strength percentiles preserve orientation and share the midpoint for ties", () => {
  const league = [2, 4, 4, 8];
  assert.equal(computePercentile(2, league), 0);
  assert.equal(computePercentile(8, league), 100);
  assert.equal(computePercentile(4, league), 50);
  assert.equal(computePercentile(2, league, false), 100);
  assert.equal(computePercentile(8, league, false), 0);
  assert.equal(computePercentile(4, league, false), 50);
  assert.equal(computePercentile(4, [4 - 1e-12, 4]), 50);
  assert.equal(computePercentile(4 - 1e-12, [4 - 1e-12, 4]), 50);
});

test("missing or invalid observations do not become an average-looking rank", () => {
  assert.equal(computePercentile(null, [1, 2, 3]), null);
  assert.equal(computePercentile(Number.NaN, [1, 2, 3]), null);
  assert.equal(computePercentile(1, []), null);
  assert.equal(computePercentile(1, [null, Number.NaN]), null);
  assert.equal(computePercentile(2, [null, 1, 2, Number.NaN]), 100);
  assert.equal(computePercentile(2, [2]), 50);
});

test("metric rates preserve units and do not silently divide by unavailable exposure", () => {
  assert.equal(
    evaluateMetric(metric("completionRate"), { completions: 21, attempts: 30 }),
    70,
  );
  assert.equal(
    evaluateMetric(metric("yardsPerAttempt"), {
      passingYards: 240,
      attempts: 30,
    }),
    8,
  );
  assert.equal(
    evaluateMetric(metric("qbEpa"), { passEpa: -5, passEpaPlays: 25 }),
    -0.2,
  );
  assert.equal(
    evaluateMetric(metric("completionRate"), { completions: 0, attempts: 5 }),
    0,
  );
  assert.equal(
    evaluateMetric(metric("completionRate"), { completions: 0, attempts: 0 }),
    null,
  );
  assert.equal(evaluateMetric(metric("completionRate"), {}), null);
  assert.equal(
    evaluateMetric(metric("completionRate"), {
      completions: 2,
      attempts: Number.NaN,
    }),
    null,
  );
});

test("turnovers, sacks and stuffs use the opposite strength orientation to yardage", () => {
  for (const key of ["sackRate", "interceptionRate", "rbStuffRate"]) {
    assert.equal(
      metric(key).higherIsBetter,
      false,
      `${key} should reward lower offensive rates`,
    );
  }
  assert.equal(metric("yardsPerAttempt").higherIsBetter, true);
  assert.equal(metric("rbYardsPerCarry").higherIsBetter, true);
});

test("catalog definitions have unique identifiers and usable sample thresholds", () => {
  assert.equal(new Set(METRICS.map((item) => item.key)).size, METRICS.length);
  for (const item of METRICS) {
    assert.ok(item.minimumSample > 0, `${item.key}: minimum sample`);
    assert.ok(
      item.highSample >= item.minimumSample,
      `${item.key}: high sample`,
    );
    assert.equal(
      item.multiplier,
      item.unit === "percent" ? 100 : 1,
      `${item.key}: unit multiplier`,
    );
  }
});
