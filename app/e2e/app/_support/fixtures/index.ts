/**
 * Shared fixture builders for E2E scenario factories.
 *
 * These functions create minimal, type-safe test data objects with sensible defaults.
 * Import from this barrel instead of duplicating builders across scenario files.
 *
 * Usage:
 * ```ts
 * import { buildCustomer, buildLicense, TEST_USER } from '../_support/fixtures';
 * ```
 */
export { buildCustomer, TEST_USER } from './build-customer';
export { buildDeploymentZone } from './build-deployment-zone';
export { buildLicense } from './build-license';
