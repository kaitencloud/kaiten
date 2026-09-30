import { ClerkProvider as ClerkProviderComponent } from '@clerk/react';
import { shadcn } from '@clerk/ui/themes';
import env from '@/env';

export const ClerkProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ClerkProviderComponent
      publishableKey={env.CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={{
        theme: shadcn,
      }}
    >
      {children}
    </ClerkProviderComponent>
  );
};
