/**
 * The statuses a release can read, in the order the console lists them.
 * `Superseded` is a release that was deployed to at least one zone and is no
 * longer what any zone runs -- it shipped, then something replaced it. Neither
 * `Deployed` (it runs nowhere) nor `Planned` (it already shipped) describes it.
 *
 * getReleaseOverviewStatus is the only rule that picks one: it needs the zones
 * a release ever reached, which only the release-management overview carries.
 */
export const RELEASE_STATUSES = [
  'Deployed',
  'Staging',
  'Superseded',
  'Planned',
] as const;

export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const getReleaseStatusBadgeVariant = (status: ReleaseStatus) => {
  switch (status) {
    case 'Deployed':
      return 'success' as const;
    case 'Staging':
      return 'secondary' as const;
    case 'Superseded':
    case 'Planned':
      return 'outline' as const;
  }
};

const RELEASE_STATUS_LABEL_KEYS = {
  Deployed: 'Features.Releases.Status.deployed',
  Staging: 'Features.Releases.Status.staging',
  Superseded: 'Features.Releases.Status.superseded',
  Planned: 'Features.Releases.Status.planned',
} as const satisfies Record<ReleaseStatus, string>;

export const formatReleaseStatus = (
  status: ReleaseStatus,
  t: (key: string) => string,
) => t(RELEASE_STATUS_LABEL_KEYS[status]);
