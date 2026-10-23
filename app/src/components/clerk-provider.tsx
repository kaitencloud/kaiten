import { ClerkProvider as ClerkProviderComponent } from '@clerk/react';
import { shadcn } from '@clerk/ui/themes';
import env from '@/env';
import { SIGNED_OUT_PATH } from './signed-out-gate';

export const ClerkProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ClerkProviderComponent
      publishableKey={env.CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl={SIGNED_OUT_PATH}
      appearance={{
        theme: shadcn,
      }}
    >
      {children}
    </ClerkProviderComponent>
  );
};
