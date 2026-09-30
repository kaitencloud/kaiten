import type { PropsWithChildren } from 'react';
import { createContext, use } from 'react';
import {
  type InstanceDetailViewModel,
  useInstanceDetailViewModel,
} from '../../hooks/use-instance-detail-view-model';

const InstanceDetailContext = createContext<InstanceDetailViewModel | null>(
  null,
);

export const InstanceDetailProvider = ({
  instanceId,
  children,
}: PropsWithChildren<{ instanceId: string }>) => {
  const value = useInstanceDetailViewModel(instanceId);

  return (
    <InstanceDetailContext.Provider value={value}>
      {children}
    </InstanceDetailContext.Provider>
  );
};

export const useInstanceDetail = () => {
  const context = use(InstanceDetailContext);

  if (!context) {
    throw new Error(
      'useInstanceDetail must be used within an InstanceDetailProvider',
    );
  }

  return context;
};
