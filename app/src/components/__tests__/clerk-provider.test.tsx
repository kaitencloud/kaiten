import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ClerkProvider } from '../clerk-provider';
import { SIGNED_OUT_PATH } from '../signed-out-gate';

const clerk = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => {
    clerk.props = props;

    return <div data-testid="clerk">{children}</div>;
  },
}));
vi.mock('@clerk/ui/themes', () => ({ shadcn: 'shadcn-theme' }));

beforeEach(() => {
  clerk.props = null;
});

describe('ClerkProvider', () => {
  // The purge of a sign-out lives on the page this URL names: Clerk navigates to it
  // before it renders the signed-out state, so the two must not drift apart.
  it('sends an explicit sign-out to the sign-out page of the app', () => {
    render(
      <ClerkProvider>
        <p>app</p>
      </ClerkProvider>,
    );

    expect(clerk.props?.afterSignOutUrl).toBe(SIGNED_OUT_PATH);
    expect(SIGNED_OUT_PATH).toBe('/signed-out');
  });
});
