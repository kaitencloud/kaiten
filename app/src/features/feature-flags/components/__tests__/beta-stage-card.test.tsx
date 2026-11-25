import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { BetaStageCard } from '../feature-flag-form/beta-stage-card';

const KEY = 'Pages.FeatureFlags.Mutation.Form.Step1.Beta';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { stage?: string }) =>
      values?.stage ? `${key} ${values.stage}` : key,
  }),
}));

/** The card over a metadata it writes back, as the form holds it. */
function renderCard(initial: Record<string, unknown>) {
  const onChange = vi.fn();

  function Harness() {
    const [metadata, setMetadata] = useState(initial);
    return (
      <BetaStageCard
        metadata={metadata}
        onChange={(next) => {
          onChange(next);
          setMetadata(next);
        }}
      />
    );
  }

  render(<Harness />);
  return onChange;
}

async function chooseStage(stage: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: `${KEY}.Labels.stage` }));
  await user.click(await screen.findByRole('option', { name: `${KEY}.Stages.${stage}` }));
}

describe('BetaStageCard', () => {
  it('shows a flag with no stage as not a beta, without the customer copy', () => {
    renderCard({ fallback_value: false });

    expect(
      screen.getByRole('combobox', { name: `${KEY}.Labels.stage` }),
    ).toHaveTextContent(`${KEY}.Stages.none`);
    expect(screen.queryByLabelText(`${KEY}.Labels.title`)).toBeNull();
  });

  it('writes the stage and keeps the other metadata', async () => {
    const onChange = renderCard({ fallback_value: false });

    await chooseStage('private_beta');

    expect(onChange).toHaveBeenLastCalledWith({
      fallback_value: false,
      stage: 'private_beta',
    });
    expect(screen.queryByLabelText(`${KEY}.Labels.title`)).toBeNull();
  });

  it('asks for the customer copy at a stage customers may see', async () => {
    const user = userEvent.setup();
    const onChange = renderCard({ stage: 'private_beta' });

    await chooseStage('public_beta');
    await user.type(screen.getByLabelText(`${KEY}.Labels.title`), 'Forecast');

    expect(onChange).toHaveBeenLastCalledWith({
      stage: 'public_beta',
      title: 'Forecast',
    });
  });

  it('removes the stage at general availability and keeps the copy', async () => {
    const onChange = renderCard({ stage: 'open_beta', title: 'Forecast' });

    await chooseStage('none');

    expect(onChange).toHaveBeenLastCalledWith({ title: 'Forecast' });
  });

  it('names a stage of the organization own and leaves it in place', () => {
    const onChange = renderCard({ stage: 'internal' });

    expect(screen.getByText(`${KEY}.ownStage internal`)).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: `${KEY}.Labels.stage` }),
    ).toHaveTextContent(`${KEY}.Stages.none`);
    expect(onChange).not.toHaveBeenCalled();
  });
});
