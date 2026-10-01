import { Input } from '@/components/ui/input';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ATTIO_SYNC_POLICIES, type AttioSyncPolicy } from '../constants';

const SYNC_POLICY_LABEL_KEYS: Record<AttioSyncPolicy, string> = {
  'create-and-bind':
    'Pages.Integrations.Connectors.Wizard.Connect.SyncPolicy.createAndBind',
  'fail-and-retry':
    'Pages.Integrations.Connectors.Wizard.Connect.SyncPolicy.failAndRetry',
};

type AttioWizardStepConnectProps = {
  apiToken: string;
  onApiTokenChange: (value: string) => void;
  syncPolicy: AttioSyncPolicy;
  onSyncPolicyChange: (value: AttioSyncPolicy) => void;
};

export function AttioWizardStepConnect({
  apiToken,
  onApiTokenChange,
  syncPolicy,
  onSyncPolicyChange,
}: AttioWizardStepConnectProps) {
  const { t } = useTranslation();
  const tokenId = useId();
  const syncPolicyId = useId();

  function renderPolicyItem(policy: AttioSyncPolicy) {
    return (
      <SelectItem key={policy} value={policy}>
        {t(SYNC_POLICY_LABEL_KEYS[policy])}
      </SelectItem>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">
          {t('Pages.Integrations.Connectors.Wizard.Connect.title')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Pages.Integrations.Connectors.Wizard.Connect.description')}
        </p>
      </div>
      <label
        htmlFor={tokenId}
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        {t('Pages.Integrations.Connectors.Wizard.Connect.tokenLabel')}
        <Input
          id={tokenId}
          type="password"
          placeholder={t(
            'Pages.Integrations.Connectors.Wizard.Connect.tokenPlaceholder',
          )}
          value={apiToken}
          onChange={(event) => onApiTokenChange(event.target.value)}
        />
        <span className="text-xs font-normal text-muted-foreground">
          {t('Pages.Integrations.Connectors.Wizard.Connect.tokenHint')}
        </span>
      </label>
      <label
        htmlFor={syncPolicyId}
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        {t('Pages.Integrations.Connectors.Wizard.Connect.syncPolicyLabel')}
        <Select
          items={ATTIO_SYNC_POLICIES.map((policy) => ({
            value: policy,
            label: t(SYNC_POLICY_LABEL_KEYS[policy]),
          }))}
          value={syncPolicy}
          onValueChange={(value) =>
            onSyncPolicyChange(value as AttioSyncPolicy)
          }
        >
          <SelectTrigger id={syncPolicyId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ATTIO_SYNC_POLICIES.map(renderPolicyItem)}
          </SelectContent>
        </Select>
        <span className="text-xs font-normal text-muted-foreground">
          {t('Pages.Integrations.Connectors.Wizard.Connect.syncPolicyHint')}
        </span>
      </label>
    </div>
  );
}
