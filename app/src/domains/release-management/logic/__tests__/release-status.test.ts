import { describe, expect, it } from 'vite-plus/test';
import {
  formatReleaseStatus,
  getReleaseStatusBadgeVariant,
  RELEASE_STATUSES,
} from '../release-status';

describe('RELEASE_STATUSES', () => {
  it('lists the four statuses a release can read', () => {
    expect([...RELEASE_STATUSES]).toEqual([
      'Deployed',
      'Staging',
      'Superseded',
      'Planned',
    ]);
  });
});

describe('getReleaseStatusBadgeVariant', () => {
  it('returns "success" for Deployed', () => {
    expect(getReleaseStatusBadgeVariant('Deployed')).toBe('success');
  });

  it('returns "secondary" for Staging', () => {
    expect(getReleaseStatusBadgeVariant('Staging')).toBe('secondary');
  });

  it('returns "outline" for Superseded and Planned', () => {
    expect(getReleaseStatusBadgeVariant('Superseded')).toBe('outline');
    expect(getReleaseStatusBadgeVariant('Planned')).toBe('outline');
  });
});

describe('formatReleaseStatus', () => {
  it('has a label for every status', () => {
    const labels = RELEASE_STATUSES.map((status) =>
      formatReleaseStatus(status, (key) => key),
    );

    expect(labels).toEqual([
      'Features.Releases.Status.deployed',
      'Features.Releases.Status.staging',
      'Features.Releases.Status.superseded',
      'Features.Releases.Status.planned',
    ]);
  });
});
