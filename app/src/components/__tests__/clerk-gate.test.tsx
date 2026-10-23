import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ClerkGate } from '../clerk-gate';

const session = vi.hoisted(() => ({ state: 'signed-in' as 'signed-in' | 'signed-out' }));
vi.mock('@clerk/react', () => ({
  // Like Clerk's: draws its children for the state it is asked for, and for no other.
  Show: ({ children, when }: { children: ReactNode; when: string }) =>
    when === session.state ? <>{children}</> : null,
}));
vi.mock('../clerk-provider', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../signed-out-gate', () => ({
  SignedOutGate: () => <p data-testid="signed-out-gate" />,
}));

beforeEach(() => {
  session.state = 'signed-in';
});

describe('ClerkGate', () => {
  it('shows the app to a signed-in session, and not the sign-out gate', () => {
    render(
      <ClerkGate>
        <p data-testid="app" />
      </ClerkGate>,
    );

    expect(screen.getByTestId('app')).toBeInTheDocument();
    expect(screen.queryByTestId('signed-out-gate')).not.toBeInTheDocument();
  });

  it('shows the sign-out gate, and not the app, to a signed-out session', () => {
    session.state = 'signed-out';

    render(
      <ClerkGate>
        <p data-testid="app" />
      </ClerkGate>,
    );

    expect(screen.getByTestId('signed-out-gate')).toBeInTheDocument();
    expect(screen.queryByTestId('app')).not.toBeInTheDocument();
  });
});
