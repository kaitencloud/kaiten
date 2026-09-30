import { expect, test } from '../_support/app-test';
import { AuditTrailDriver } from '../_support/drivers/audit-trail.driver';
import { installAuditTrailAppMocks } from '../_support/mocks/install-audit-trail-app-mocks';
import { createUsageEventsAuditTrailModel } from './audit-trail.scenarios';

// The three events that say an entitlement's usage is approaching, at or past
// its limit, while the API still accepts the usage.
const WARNING_LABELS = [
  'Entitlement near limit',
  'Entitlement fully used',
  'Entitlement limit exceeded',
];

test.describe('audit trail read', () => {
  test('counts the usage warnings and badges their rows', async ({ page }) => {
    const auditTrail = new AuditTrailDriver(page);

    await installAuditTrailAppMocks(page, createUsageEventsAuditTrailModel());
    await auditTrail.goto();

    await auditTrail.expectStatCount('Warnings', 3);
    for (const label of WARNING_LABELS) {
      await auditTrail.expectEventStatus(label, 'Warning');
    }
    // A refusal is rejected and a taken report accepted, never a warning.
    await auditTrail.expectStatCount('Rejected', 1);
    await auditTrail.expectEventStatus('Usage rejected', 'Rejected');
    await auditTrail.expectStatCount('Accepted', 1);
    await auditTrail.expectEventStatus('Usage reported', 'Accepted');
  });

  test('the Warning status keeps the warnings and nothing else', async ({
    page,
  }) => {
    const auditTrail = new AuditTrailDriver(page);

    await installAuditTrailAppMocks(page, createUsageEventsAuditTrailModel());
    await auditTrail.goto();
    await auditTrail.filterByStatus('Warning');

    for (const label of WARNING_LABELS) {
      await expect(auditTrail.eventRow(label)).toBeVisible();
    }
    for (const label of [
      'Usage rejected',
      'Usage reported',
      'Feature flag updated',
      'License version published',
    ]) {
      await expect(auditTrail.eventRow(label)).toHaveCount(0);
    }
  });
});
