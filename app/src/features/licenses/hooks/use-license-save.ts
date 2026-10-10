import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { Entitlement, License, LicenseWritable } from '@/api-client';
import {
  associateEntitlementWithLicenseMutation,
  createLicenseMutation,
  publishLicenseMutation,
} from '@/api-client/@tanstack/react-query.gen';
import type { EditableLicenseEntitlement } from '../utils/license-entitlements.utils';
import { buildAssociateLicenseEntitlementBody } from '../utils/license-entitlement-write.utils';
import { getEntitlementSlug } from '../utils/license-entitlements.utils';

type CreateLicenseWithGrantsOptions = {
  // Runs once the grants are attached and before the version is published, with
  // what the version has been given so far. What a version also sells (its
  // prices) is added here, so that it is never served half made. A failure
  // leaves the draft it was created as, like a grant that fails.
  afterGrants?: (license: License & { slug: string }) => Promise<void>;
  // body.lifecycleState is the state the version ends in: DRAFT keeps it a
  // draft, anything else publishes it once its grants are attached.
  body: LicenseWritable;
  draftEntitlements: EditableLicenseEntitlement[];
};

// The license exists once the create succeeded. `error` is what failed after
// that -- a grant or the publish -- in which case the license is still the
// DRAFT it was created as.
export type CreateLicenseWithGrantsResult = {
  error?: unknown;
  license: License;
};

// Attaches the grants a new version was given in its form, once it exists.
function useAttachDraftEntitlements(entitlements: Entitlement[]) {
  const attachEntitlementMutation = useMutation({
    ...associateEntitlementWithLicenseMutation(),
  });

  const entitlementSlugById = useMemo(
    () =>
      new Map(
        entitlements.map((entitlement) => [
          entitlement.id,
          getEntitlementSlug(entitlement),
        ]),
      ),
    [entitlements],
  );

  const attachDraftEntitlements = useCallback(
    async (
      licenseSlug: string,
      draftEntitlements: EditableLicenseEntitlement[],
    ) => {
      const validEntitlements = draftEntitlements.filter(
        (
          entitlement,
        ): entitlement is EditableLicenseEntitlement & {
          entitlementId: string;
        } => Boolean(entitlement.entitlementId),
      );

      if (validEntitlements.length === 0) {
        return;
      }

      const entitlementPayloads = validEntitlements
        .map((entitlement) => ({
          entitlement,
          entitlementSlug: entitlementSlugById.get(entitlement.entitlementId),
        }))
        .filter(
          (
            item,
          ): item is {
            entitlement: EditableLicenseEntitlement & { entitlementId: string };
            entitlementSlug: string;
          } => Boolean(item.entitlementSlug),
        );

      if (entitlementPayloads.length === 0) {
        return;
      }

      await Promise.all(
        entitlementPayloads.map(({ entitlement, entitlementSlug }) =>
          attachEntitlementMutation.mutateAsync({
            body: buildAssociateLicenseEntitlementBody(
              entitlementSlug,
              entitlement,
            ),
            path: { licenseSlug },
          }),
        ),
      );
    },
    [attachEntitlementMutation, entitlementSlugById],
  );

  return attachDraftEntitlements;
}

export const useLicenseSave = (entitlements: Entitlement[]) => {
  const attachDraftEntitlements = useAttachDraftEntitlements(entitlements);
  const { mutateAsync: createLicense } = useMutation({
    ...createLicenseMutation(),
  });
  const { mutateAsync: publishLicense } = useMutation({
    ...publishLicenseMutation(),
  });

  // A new version is created as a DRAFT, given its grants, and only then
  // published. Published first, it would be served with some of its grants or
  // none until the last one landed: a family with no default serves its newest
  // published version. A create that fails throws, and nothing was saved; a
  // grant, a price or a publish that fails afterwards leaves a draft nothing
  // serves.
  const createLicenseWithGrants = useCallback(
    async ({
      afterGrants,
      body,
      draftEntitlements,
    }: CreateLicenseWithGrantsOptions): Promise<CreateLicenseWithGrantsResult> => {
      const license = await createLicense({
        body: { ...body, lifecycleState: 'DRAFT' },
      });
      const licenseSlug = license.slug;
      if (!licenseSlug) {
        return { license };
      }

      try {
        await attachDraftEntitlements(licenseSlug, draftEntitlements);
        await afterGrants?.({ ...license, slug: licenseSlug });
        if (body.lifecycleState === 'DRAFT') {
          return { license };
        }
        return { license: await publishLicense({ path: { licenseSlug } }) };
      } catch (error) {
        return { error, license };
      }
    },
    [attachDraftEntitlements, createLicense, publishLicense],
  );

  return {
    attachDraftEntitlements,
    createLicenseWithGrants,
  };
};
