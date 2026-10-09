import { useStore } from '@tanstack/react-store';
import { AttioSetupWizard } from '../attio/components';
import { useAttioSetupStore } from '../attio/hooks/use-attio-setup-store';
import type { ConnectorSettings } from '../attio/types';
import { ConnectorsIndex } from './connectors-index';

type ConnectorsPageContentProps = {
  attioSettings: ConnectorSettings | null;
  /** Navigates to the connector detail route (wizard finish, Manage tile). */
  onOpenDetail: () => void;
  /** Navigates to the page of the Stripe connector, which connects it as well as manages it. */
  onOpenStripe: () => void;
};

export function ConnectorsPageContent({
  attioSettings,
  onOpenDetail,
  onOpenStripe,
}: ConnectorsPageContentProps) {
  const isAttioConnected = attioSettings != null;
  const flowStore = useAttioSetupStore();
  const { store, actions } = flowStore;
  const view = useStore(store, (state) => state.view);

  if (view === 'wizard') {
    return (
      <AttioSetupWizard
        flowStore={flowStore}
        onCancel={actions.backToIndex}
        onFinish={onOpenDetail}
      />
    );
  }

  return (
    <ConnectorsIndex
      isAttioConnected={isAttioConnected}
      onConnectAttio={actions.openWizard}
      onOpenAttio={onOpenDetail}
      onOpenStripe={onOpenStripe}
    />
  );
}
