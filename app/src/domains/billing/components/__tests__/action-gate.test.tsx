import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createRouterModule,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { testI18n } from '@/__tests__/test-i18n';
import { ActionGate } from '../action-gate';

const access = vi.hoisted(() => ({
  current: { allowed: false, isPending: false },
}));

vi.mock('../../hooks/use-can-perform', () => ({
  useActionAccess: () => access.current,
}));
vi.mock('@tanstack/react-router', () => createRouterModule(vi.fn()));

useBillingTexts();

describe('ActionGate', () => {
  beforeEach(() => {
    access.current = { allowed: false, isPending: false };
  });

  it('draws the form for a session whose scopes cover the action', () => {
    access.current = { allowed: true, isPending: false };

    render(
      <ActionGate action="license.create" restricted>
        <p>The form</p>
      </ActionGate>,
    );

    expect(screen.getByText('The form')).toBeInTheDocument();
  });

  it('draws nothing for a dialog over a page that is still there', () => {
    const { container } = render(
      <ActionGate action="license.create">
        <p>The form</p>
      </ActionGate>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('draws nothing while the token is read', () => {
    access.current = { allowed: false, isPending: true };

    const { container } = render(
      <ActionGate action="license.create" restricted>
        <p>The form</p>
      </ActionGate>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('says in the language of the interface which scope is missing, under a heading that stands for the page', async () => {
    const english = render(
      <ActionGate action="license.create" restricted>
        <p>The form</p>
      </ActionGate>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Restricted access' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Missing required scope: write:licenses'),
    ).toBeInTheDocument();

    english.unmount();
    await testI18n.changeLanguage('fr');
    try {
      render(
        <ActionGate action="license.create" restricted>
          <p>The form</p>
        </ActionGate>,
      );

      expect(
        screen.getByText('Scope requis manquant : write:licenses'),
      ).toBeInTheDocument();
    } finally {
      await testI18n.changeLanguage('en');
    }
  });
});
