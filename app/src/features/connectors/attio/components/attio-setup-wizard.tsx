import { Button } from '@/components/ui/button';
import { useStore } from '@tanstack/react-store';
import { ArrowLeft, ArrowRight, Loader2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StepStack,
  StepStackContainer,
  StepStackPrevious,
  StepStackStep,
  useStepStack,
} from '@/functionals/step-stack';
import { ConnectorTile } from '../../components/connector-tile';
import { ATTIO_CONNECTOR } from '../../constants';
import { useAttioSettingsMutations } from '../hooks';
import type { AttioSetupStore } from '../store';
import type { EditableMappingRow } from '../types';
import { buildAttioSettings, validateAttioMappings } from '../utils';
import { AttioWizardStepConnect } from './attio-wizard-step-connect';
import { AttioWizardStepSchema } from './attio-wizard-step-schema';
import { WizardProgress } from './attio-wizard-steps';

type AttioSetupWizardProps = {
  flowStore: AttioSetupStore;
  onCancel: () => void;
  onFinish: () => void;
};

export function AttioSetupWizard({
  flowStore,
  onCancel,
  onFinish,
}: AttioSetupWizardProps) {
  const { store, actions } = flowStore;
  const apiToken = useStore(store, (state) => state.apiToken);
  const syncPolicy = useStore(store, (state) => state.syncPolicy);
  const mappingRows = useStore(store, (state) => state.mappingRows);

  return (
    <div className="flex min-h-[640px] flex-col">
      <WizardHeader onCancel={onCancel} />
      <StepStack
        clickable
        className="flex flex-1 flex-col gap-4 p-6"
        offset={0}
      >
        <WizardProgress />
        <StepStackContainer className="min-h-[420px] justify-start">
          <StepStackStep className="space-y-6">
            <AttioWizardStepConnect
              apiToken={apiToken}
              onApiTokenChange={actions.setApiToken}
              syncPolicy={syncPolicy}
              onSyncPolicyChange={actions.setSyncPolicy}
            />
            <WizardStepFooter>
              <WizardNextButton disabled={apiToken.trim().length === 0} />
            </WizardStepFooter>
          </StepStackStep>

          <StepStackStep className="space-y-6">
            <AttioWizardStepSchema
              editableRows={mappingRows}
              onAddRow={actions.addMappingRow}
              onRemoveRow={actions.removeMappingRow}
              onUpdateRow={actions.updateMappingRow}
            />
            <WizardStepFooter>
              <WizardBackButton />
              <WizardFinishButton
                apiToken={apiToken}
                syncPolicy={syncPolicy}
                mappingRows={mappingRows}
                onFinish={onFinish}
              />
            </WizardStepFooter>
          </StepStackStep>
        </StepStackContainer>
      </StepStack>
    </div>
  );
}

function WizardHeader({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-3">
        <ConnectorTile connector={ATTIO_CONNECTOR} />
        <div>
          <p className="text-sm font-semibold">
            {t('Pages.Integrations.Connectors.Wizard.headerTitle')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('Pages.Integrations.Connectors.Wizard.headerSubtitle')}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        <X />
        {t('Pages.Integrations.Connectors.Wizard.cancel')}
      </Button>
    </div>
  );
}

function WizardStepFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/60 pt-4">
      {children}
    </div>
  );
}

function WizardBackButton() {
  const { t } = useTranslation();
  return (
    <StepStackPrevious asChild>
      <Button variant="outline" size="sm">
        <ArrowLeft />
        {t('Pages.Integrations.Connectors.Wizard.back')}
      </Button>
    </StepStackPrevious>
  );
}

function WizardNextButton({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const { nextStep } = useStepStack();
  return (
    <Button variant="default" size="sm" onClick={nextStep} disabled={disabled}>
      {t('Pages.Integrations.Connectors.Wizard.continue')}
      <ArrowRight />
    </Button>
  );
}

function WizardFinishButton({
  apiToken,
  syncPolicy,
  mappingRows,
  onFinish,
}: {
  apiToken: string;
  syncPolicy: string;
  mappingRows: EditableMappingRow[];
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const { connect } = useAttioSettingsMutations();
  const mappingsValid = validateAttioMappings(mappingRows).isValid;

  const handleFinish = async () => {
    try {
      await connect.mutateAsync(
        buildAttioSettings(apiToken, syncPolicy, mappingRows),
      );
      onFinish();
    } catch {
      // Errors surface via the mutation's onError toast.
    }
  };

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleFinish}
      disabled={
        connect.isPending || apiToken.trim().length === 0 || !mappingsValid
      }
    >
      {t('Pages.Integrations.Connectors.Wizard.finish')}
      {connect.isPending && <Loader2 className="animate-spin" />}
    </Button>
  );
}
