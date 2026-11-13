import { render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import type { CardRule } from '../../rate-card-model';
import { RuleAuthors } from '../rule-authors';

beforeEach(async () => {
  i18n.addResourceBundle('en', 'translation', en, true, true);
  await i18n.changeLanguage('en');
});

const rule = (overrides: Partial<CardRule>): CardRule => ({
  chargeOnError: 'NEVER',
  createdAt: '2026-09-15T10:00:00.000Z',
  createdBy: { id: 'grace', name: 'Grace Hopper' },
  id: 'rule',
  maximumCreditsPerRequest: null,
  minimumCreditsPerRequest: '0',
  modelSlug: null,
  rates: { perRequest: '1' },
  requestType: null,
  status: 'ACTIVE',
  updatedAt: '2026-09-15T10:00:00.000Z',
  updatedBy: { id: 'grace', name: 'Grace Hopper' },
  ...overrides,
});

describe('RuleAuthors', () => {
  it('says who created a rule that was never edited, on one line', () => {
    render(<RuleAuthors rule={rule({})} />);

    expect(screen.getByText(/^Created by Grace Hopper · Sep 15, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Last edited/)).toBeNull();
  });

  it('says who last edited it and when, above who created it', () => {
    render(
      <RuleAuthors
        rule={rule({ updatedAt: '2026-11-11T09:31:00.000Z', updatedBy: { id: 'ada', name: 'Ada Lovelace' } })}
      />,
    );

    expect(screen.getByText(/^Last edited by Ada Lovelace · Nov 11, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/^Created by Grace Hopper/)).toBeInTheDocument();
  });

  it('does not invent a name the API did not give', () => {
    render(<RuleAuthors rule={rule({ createdBy: { id: 'svc', name: '' }, updatedBy: { id: 'svc', name: '' } })} />);

    expect(screen.getByText(/^Created by an unnamed user/)).toBeInTheDocument();
  });

  it('shows nothing for a rule that carries no author', () => {
    const { container } = render(<RuleAuthors rule={rule({ createdBy: undefined, updatedBy: undefined })} />);

    expect(container).toBeEmptyDOMElement();
  });
});
