import type { APIRequestContext } from '@playwright/test';
import { accepted, api, headers } from './stack-api';

// The setup the specs of billing against the real API share: a customer, and an
// instance of it on a published license that sells a flat fee.

export type Billable = {
  customerName: string;
  customerSlug: string;
  instanceName: string;
  instanceSlug: string;
  licenseSlug: string;
};

/**
 * A customer with no billing e-mail, and an instance of it on a published license
 * that sells a monthly flat fee of $29.00 and, when `meteredSlug` is given, grants
 * an entitlement that usage can be reported against.
 */
export async function setUpBillable(
  request: APIRequestContext,
  suffix: string,
  meteredSlug?: string,
): Promise<Billable> {
  const customerName = `Subscribed ${suffix}`;
  const customerSlug = `subscribed-${suffix}`;
  const licenseSlug = `subscribed-license-${suffix}`;
  const instanceName = `Subscribed instance ${suffix}`;
  const instanceSlug = `subscribed-instance-${suffix}`;

  const customer = await accepted<{ id: string }>(
    await request.post(`${api}/api/customers`, {
      data: { name: customerName, slug: customerSlug },
      headers,
    }),
  );
  const license = await accepted<{ id: string }>(
    await request.post(`${api}/api/licenses`, {
      data: {
        description:
          'The license of a customer that subscribes from the console',
        isDefault: false,
        lifecycleState: 'DRAFT',
        name: `Subscribed ${suffix}`,
        slug: licenseSlug,
        type: 'PAID',
      },
      headers,
    }),
  );
  await accepted(
    await request.post(`${api}/api/licenses/${licenseSlug}/prices`, {
      data: {
        billingModel: 'FLAT_FEE',
        billingPeriod: 'MONTHLY',
        currency: 'USD',
        displayLabel: 'Pro, monthly',
        unitAmountDecimal: '2900',
      },
      headers,
    }),
  );
  if (meteredSlug) {
    await accepted(
      await request.post(`${api}/api/entitlements`, {
        data: {
          aggregationMethod: 'SUM',
          description: 'What the customer calls',
          name: `Calls ${suffix}`,
          slug: meteredSlug,
          type: 'NUMBER',
          unitPlural: 'calls',
          unitSingular: 'call',
        },
        headers,
      }),
    );
    await accepted(
      await request.post(`${api}/api/licenses/${licenseSlug}/entitlements`, {
        data: {
          entitlementSlug: meteredSlug,
          limitCapExceededOveragePercent: 0,
          value: { type: 'number', value: 1000 },
        },
        headers,
      }),
      204,
    );
  }
  await accepted(
    await request.post(`${api}/api/licenses/${licenseSlug}/publish`, {
      headers,
    }),
    200,
  );
  const now = new Date();
  await accepted(
    await request.post(`${api}/api/instances`, {
      data: {
        customerId: customer.id,
        description: 'The instance of a customer that subscribes',
        endLicenseDate: new Date(
          now.getTime() + 365 * 86_400_000,
        ).toISOString(),
        licenseId: license.id,
        name: instanceName,
        slug: instanceSlug,
        startLicenseDate: now.toISOString(),
      },
      headers,
    }),
  );

  return {
    customerName,
    customerSlug,
    instanceName,
    instanceSlug,
    licenseSlug,
  };
}
