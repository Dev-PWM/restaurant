// The monorepo owns the analytics fixtures and regression suites. Keep the
// workspace test command connected to those suites instead of silently running
// zero tests against an empty local directory.
import "../../../tests/analytics.test.js";
import "../../../tests/analytics-api.test.js";
import "../../../tests/financial-presentations.test.js";
import "../../../tests/production-audit.test.js";
import "../../../tests/summary.test.js";
import "../../../tests/bank-config.test.js";
