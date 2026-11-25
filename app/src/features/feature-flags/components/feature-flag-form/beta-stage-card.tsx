import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  BETA_STAGES,
  betaCopyOf,
  betaStageOf,
  isListedBetaStage,
  withBetaCopy,
  withBetaStage,
  type BetaStage,
} from '../../utils/beta-stage';

/** The select has no empty value: a flag that is not a beta picks this option. */
const NOT_A_BETA = 'none';

type BetaStageCardProps = {
  metadata: Record<string, unknown>;
  onChange: (metadata: Record<string, unknown>) => void;
};

/**
 * Sets the flag's beta stage, and at a stage customers may see, the copy shown
 * to them. Each control writes its own metadata key and leaves the others as
 * they are.
 */
export function BetaStageCard({ metadata, onChange }: BetaStageCardProps) {
  const { t } = useTranslation();
  const id = useId();
  const stage = betaStageOf(metadata);
  // A stage of the organization's own, outside the convention: the card does
  // not offer it, says it is there, and leaves it until another is chosen.
  const ownStage =
    !stage && typeof metadata.stage === 'string' && metadata.stage !== ''
      ? metadata.stage
      : null;
  const options = [NOT_A_BETA, ...BETA_STAGES];
  const label = (option: string) =>
    t(`Pages.FeatureFlags.Mutation.Form.Step1.Beta.Stages.${option}`);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('Pages.FeatureFlags.Mutation.Form.Step1.Beta.title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.FeatureFlags.Mutation.Form.Step1.Beta.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-stage`}>
            {t('Pages.FeatureFlags.Mutation.Form.Step1.Beta.Labels.stage')}
          </Label>
          <Select
            items={options.map((option) => ({
              value: option,
              label: label(option),
            }))}
            value={stage ?? NOT_A_BETA}
            onValueChange={(value) =>
              onChange(
                withBetaStage(
                  metadata,
                  value === NOT_A_BETA ? null : (value as BetaStage),
                ),
              )
            }
          >
            <SelectTrigger id={`${id}-stage`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {label(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {ownStage
              ? t('Pages.FeatureFlags.Mutation.Form.Step1.Beta.ownStage', {
                  stage: ownStage,
                })
              : t(
                  `Pages.FeatureFlags.Mutation.Form.Step1.Beta.StageDescriptions.${stage ?? NOT_A_BETA}`,
                )}
          </p>
        </div>

        {isListedBetaStage(stage) ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${id}-title`}>
                {t('Pages.FeatureFlags.Mutation.Form.Step1.Beta.Labels.title')}
              </Label>
              <Input
                id={`${id}-title`}
                type="text"
                value={betaCopyOf(metadata, 'title')}
                onChange={(event) =>
                  onChange(withBetaCopy(metadata, 'title', event.target.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-description`}>
                {t(
                  'Pages.FeatureFlags.Mutation.Form.Step1.Beta.Labels.description',
                )}
              </Label>
              <Textarea
                id={`${id}-description`}
                value={betaCopyOf(metadata, 'description')}
                onChange={(event) =>
                  onChange(
                    withBetaCopy(metadata, 'description', event.target.value),
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                {t('Pages.FeatureFlags.Mutation.Form.Step1.Beta.copyHint')}
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
