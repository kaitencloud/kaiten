import {
  zEntitlementUsage,
  zProvenance,
  zProvenanceLicense,
  zProvenanceNumber,
} from '@/api-client/zod.gen';

/**
 * `EntitlementUsage` as the API serves it. The OpenAPI document declares the `license`
 * and the `number` of its `provenance` required and never null, while the handler sends
 * null for a license that grants nothing (the add-ons do) and for a number that no
 * add-on and no voucher changes (`api/internal/modules/instances/schema/provenance.go`).
 * The mocks answer as the API does, so what they check a seed against takes the null.
 */
export const zServedEntitlementUsage = zEntitlementUsage.extend({
  provenance: zProvenance
    .extend({
      license: zProvenanceLicense.nullable(),
      number: zProvenanceNumber.nullable(),
    })
    .optional(),
});
