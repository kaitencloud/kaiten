import { useTranslation } from 'react-i18next';
import { withFieldGroup } from '@/hooks/form';
import {
  ruleVerdictValidator,
  useTargetingEditorSupport,
} from '../hooks/use-targeting-editor-support';
import { CelField } from './cel-field';

type TargetingBaseFields = {
  name: string;
  rule: string;
};

const defaultValues: TargetingBaseFields = {
  name: '',
  rule: '',
};

export const TargetingBaseFields = withFieldGroup({
  defaultValues,
  props: {
    translationKeyPrefix: '',
    disableCelValidation: false,
  },
  render: function Render({
    group,
    translationKeyPrefix,
    disableCelValidation,
  }) {
    const { t } = useTranslation();
    const { lint } = useTargetingEditorSupport();

    return (
      <>
        <group.AppField name="name">
          {(field) => (
            <field.TextField
              label={t(`${translationKeyPrefix}.name`)}
              required
              placeholder={t(`${translationKeyPrefix}.namePlaceholder`)}
            />
          )}
        </group.AppField>

        {/*
          The rule's real validation: the server lint, debounced, through the
          form's own async-validator channel — so the verdict that draws the
          editor's markers is the verdict that disables Save, with no second
          bookkeeping to drift. The submit-time run is what makes a save
          during the debounce window honest.
        */}
        <group.AppField
          name="rule"
          validators={
            disableCelValidation
              ? undefined
              : {
                  onChangeAsyncDebounceMs: 400,
                  onChangeAsync: ruleVerdictValidator(lint),
                  onSubmitAsync: ruleVerdictValidator(lint),
                }
          }
        >
          {() => (
            <CelField
              label={t(`${translationKeyPrefix}.rule`)}
              required
              placeholder={t(`${translationKeyPrefix}.rulePlaceholder`)}
              description={t(`${translationKeyPrefix}.ruleDescription`)}
              disableValidation={disableCelValidation}
            />
          )}
        </group.AppField>
      </>
    );
  },
});
