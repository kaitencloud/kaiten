import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import fr from '@/lib/i18n/locales/fr';
import {
  FormRecoveryAlert,
  FormRecoveryAnnouncer,
  FormRecoveryNotes,
  FormRecoverySubmitWarning,
  type FormRecovery,
  type FormRecoveryNotice,
  type FormRecoveryOffer,
} from '..';
import { defineFormRecovery } from '../define-form-recovery';
import { installRecoveryTranslations } from './recovery-test-utils';

const NOW = new Date('2026-10-23T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

beforeEach(() => {
  installRecoveryTranslations();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(async () => {
  vi.useRealTimers();
  await testI18n.changeLanguage('en');
});

const descriptor = defineFormRecovery<{ code: string }>({
  formId: 'demo.create',
  version: 1,
  omit: ['code'],
  steps: ['type', 'offer', 'eligibility', 'review'],
  fieldLabels: { code: { text: 'Code' } },
});

function fakeRecovery(
  overrides: Partial<FormRecovery<any, any>> = {},
): FormRecovery<any, any> {
  const noop = vi.fn();
  return {
    writer: { status: 'idle' },
    persistent: true,
    offer: null,
    notices: [],
    notes: [],
    sessionKey: '0',
    pristine: {},
    restored: null,
    focusOffer: () => true,
    resume: vi.fn(),
    startOver: vi.fn(),
    showOther: vi.fn(),
    restoreSetAside: vi.fn(),
    keepHere: vi.fn(),
    dismiss: vi.fn(),
    send: vi.fn(),
    begin: vi.fn(),
    complete: noop,
    discard: vi.fn(),
    restart: vi.fn(),
    internals: {
      descriptor,
      steps: descriptor.steps ?? [],
      epoch: () => 0,
      sendStarted: () => true,
      focusToken: 0,
      track: vi.fn(),
      flushOnUnmount: vi.fn(),
      addNotes: vi.fn(),
      clearOmitted: vi.fn(),
    },
    ...overrides,
  } as FormRecovery<any, any>;
}

const STEP_LABELS = ['Type', 'Offer', 'Eligibility', 'Review'];
const FIELD_LABELS = { code: 'Code' };

function offerAlert(offer: FormRecoveryOffer, props = {}) {
  const recovery = fakeRecovery({ offer });
  render(
    <FormRecoveryAlert
      recovery={recovery}
      stepLabels={STEP_LABELS}
      fieldLabels={FIELD_LABELS}
      {...props}
    />,
  );
  return recovery;
}

describe('FormRecoveryAlert, the offer', () => {
  it('says the step, the field never kept and offers the two actions', async () => {
    const recovery = offerAlert({
      kind: 'resumable',
      savedAt: ago(2 * 3_600_000),
      stepIndex: 2,
      stepCount: 4,
      omittedFilled: ['code'],
      formChanged: false,
      others: 0,
    });

    expect(screen.getByText('Pick up where you left off?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Unsent entries for this form were kept (2 hours ago), at step 3 of 4 (Eligibility).',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('For security, one field is never kept and must be entered again: Code.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(recovery.resume).toHaveBeenCalledTimes(1);
    expect(recovery.startOver).toHaveBeenCalledTimes(1);
  });

  it('says nothing of the step on a single page, and "just now" under a minute', () => {
    offerAlert({
      kind: 'resumable',
      savedAt: ago(20_000),
      omittedFilled: [],
      formChanged: false,
      others: 0,
    });

    expect(
      screen.getByText('Unsent entries for this form were kept (just now).'),
    ).toBeInTheDocument();
  });

  it('says "yesterday" and joins several fields with the list format of the language', async () => {
    offerAlert({
      kind: 'resumable',
      savedAt: ago(26 * 3_600_000),
      omittedFilled: ['code', 'token'],
      formChanged: false,
      others: 0,
    });

    expect(screen.getByText(/kept \(yesterday\)/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'For security, some fields are never kept and must be entered again: Code and token.',
      ),
    ).toBeInTheDocument();
  });

  it('warns that the form changed, and offers the other entries', async () => {
    const recovery = offerAlert({
      kind: 'resumable',
      savedAt: ago(3_600_000),
      omittedFilled: [],
      formChanged: true,
      others: 2,
    });

    expect(
      screen.getByText('The form has changed since: check each step before sending.'),
    ).toBeInTheDocument();
    expect(screen.getByText('2 other unsent entries are kept.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show the next entry' }));
    expect(recovery.showOther).toHaveBeenCalledTimes(1);
    // With several entries, "Start over" would read as discarding them all.
    expect(screen.queryByRole('button', { name: 'Start over' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard this one' }));
    expect(recovery.startOver).toHaveBeenCalledTimes(1);
  });

  it('says "may have gone through", with the actions of the feature, and names the buttons for a duplicate', async () => {
    const recovery = offerAlert(
      {
        kind: 'uncertain',
        attemptedAt: '2026-10-22T14:32:00.000Z',
        savedAt: ago(3_600_000),
        omittedFilled: [],
        others: 0,
      },
      { children: <a href="#list">View the list</a> },
    );

    expect(screen.getByText('Your last submission may have gone through')).toBeInTheDocument();
    expect(screen.getByText(/A submission started on .* at .* and the page got no answer/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View the list' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Resume anyway' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard these entries' }));
    expect(recovery.resume).toHaveBeenCalledTimes(1);
    expect(recovery.startOver).toHaveBeenCalledTimes(1);
  });

  it('reduces to a line with "bring them back" and "hide"', async () => {
    const recovery = offerAlert({ kind: 'condensed', savedAt: ago(2 * 3_600_000) });

    expect(screen.getByText('Earlier entries (2 hours ago) are still kept.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bring them back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(recovery.restoreSetAside).toHaveBeenCalledTimes(1);
    expect(recovery.dismiss).toHaveBeenCalledWith('condensed');
  });

  it('marks the resume button for the initial focus of a dialog', () => {
    offerAlert({
      kind: 'resumable',
      savedAt: ago(1_000),
      omittedFilled: [],
      formChanged: false,
      others: 0,
    });

    const button = screen.getByRole('button', { name: 'Resume' });
    expect(button).toHaveAttribute('data-form-recovery-resume');
    expect(button).toHaveAttribute('type', 'button');
    const description = document.getElementById(button.getAttribute('aria-describedby')!);
    expect(description).toHaveTextContent('Unsent entries');
  });

  it('makes every alert a status, and every button a plain button', () => {
    offerAlert({
      kind: 'resumable',
      savedAt: ago(1_000),
      omittedFilled: [],
      formChanged: true,
      others: 1,
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
    }
  });
});

function noticeAlert(notices: FormRecoveryNotice[], props = {}) {
  const recovery = fakeRecovery({ notices });
  render(<FormRecoveryAlert recovery={recovery} {...props} />);
  return recovery;
}

describe('FormRecoveryAlert, the notices', () => {
  it.each([
    ['otherTab', 'These entries are also open in another tab, which keeps them.'],
    ['discarded', 'These entries were discarded from another tab.'],
    ['unknown', 'These entries are no longer kept on this device.'],
  ] as const)('says why an input is no longer kept here (%s) and offers to keep it', async (reason, text) => {
    const recovery = noticeAlert([{ kind: 'notKept', reason }]);

    expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep them here' }));
    expect(recovery.keepHere).toHaveBeenCalledTimes(1);
  });

  it('says a form is open in another tab, and can be dismissed', async () => {
    const recovery = noticeAlert([{ kind: 'openElsewhere' }]);

    expect(screen.getByText(/also open in another tab, with entries in progress/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(recovery.dismiss).toHaveBeenCalledWith('openElsewhere');
  });

  it('says the entries were sent from another tab, with the action of the feature', () => {
    noticeAlert([{ kind: 'sentElsewhere' }], { children: <a href="#list">View the list</a> });

    expect(screen.getByText(/sent from another tab: sending them here would create a duplicate/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View the list' })).toBeInTheDocument();
  });

  it('says an input was dropped because the form changed, once', async () => {
    const recovery = noticeAlert([{ kind: 'lost', savedAt: '2026-10-18T10:00:00.000Z' }]);

    expect(screen.getByText(/could not be restored: the form has changed since/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(recovery.dismiss).toHaveBeenCalledWith('lost');
  });

  it('names an object created whose next step failed, with a link to finish it', () => {
    noticeAlert([{ kind: 'followUp', created: { id: 'v1', label: 'Black Friday' } }], {
      finishLink: (created: { id: string }) => <a href={`#${created.id}`}>Finish it</a>,
    });

    expect(screen.getByText('Sending “Black Friday” did not finish.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finish it' })).toHaveAttribute('href', '#v1');
  });

  it('renders nothing when there is nothing to say, or when the recovery is off', () => {
    const { container, rerender } = render(<FormRecoveryAlert recovery={fakeRecovery()} />);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <FormRecoveryAlert
        recovery={fakeRecovery({ persistent: false, notices: [{ kind: 'openElsewhere' }] })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves the notices that belong to the step and to the button to their own components', () => {
    noticeAlert([{ kind: 'unknownOutcome' }, { kind: 'omitted', paths: ['code'] }, { kind: 'followUpPending' }]);

    expect(screen.queryByText(/got no answer/)).not.toBeInTheDocument();
  });
});

describe('FormRecoveryNotes', () => {
  it('lists what was removed, by name or without one', async () => {
    const recovery = fakeRecovery({
      notes: [
        { kind: 'unavailable', entity: { text: 'license' }, name: 'Gold' },
        { kind: 'unavailable', entity: { text: 'customer' }, name: null },
        { kind: 'reset', field: { text: 'Discount type' } },
        { kind: 'itemRemoved', field: { text: 'Grants' } },
        { kind: 'sourceChanged', source: { text: 'The base license' } },
      ],
    });
    render(<FormRecoveryNotes recovery={recovery} />);

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual([
      '“Gold” (license) is no longer available.',
      'A selected item is no longer available (customer).',
      'Discount type was reset: the form changed since.',
      'An item of Grants was removed: the form changed since.',
      'The base license has changed since: its values were loaded again.',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Entries restored');

    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(recovery.dismiss).toHaveBeenCalledWith('notes');
  });

  it('reminds of the fields never kept until they are entered or set aside', async () => {
    const recovery = fakeRecovery({ notices: [{ kind: 'omitted', paths: ['code'] }] });
    render(<FormRecoveryNotes recovery={recovery} fieldLabels={FIELD_LABELS} />);

    expect(screen.getByText('For security, this field is never kept: Code. Enter it again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue without it' }));
    expect(recovery.dismiss).toHaveBeenCalledWith('omitted');
  });

  it('names a field with the label of the descriptor when the feature passes none, never with its key', () => {
    const recovery = fakeRecovery({ notices: [{ kind: 'omitted', paths: ['code', 'config.token'] }] });
    render(<FormRecoveryNotes recovery={recovery} />);

    expect(screen.getByText(/these fields are never kept: Code and config\.token/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue without them' })).toBeInTheDocument();
  });

  it('says a chain is unfinished, in the words of the feature when it has some', () => {
    testI18n.addResourceBundle('en', 'translation', { Custom: { pending: 'Saved as a draft, not published.' } }, true, true);
    const custom = defineFormRecovery<{ code: string }>({
      ...descriptor,
      followUpMessageKeys: { pending: 'Custom.pending', later: 'Custom.later' },
    });
    const recovery = fakeRecovery({
      notices: [{ kind: 'followUpPending' }],
      internals: { ...fakeRecovery().internals, descriptor: custom },
    });
    render(<FormRecoveryNotes recovery={recovery} />);

    expect(screen.getByText('Saved as a draft, not published.')).toBeInTheDocument();
  });

  it('renders nothing without notes', () => {
    const { container } = render(<FormRecoveryNotes recovery={fakeRecovery()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FormRecoverySubmitWarning', () => {
  it('repeats that the entries were sent elsewhere, above the button', () => {
    render(
      <FormRecoverySubmitWarning recovery={fakeRecovery({ notices: [{ kind: 'sentElsewhere' }] })}>
        <a href="#list">View the list</a>
      </FormRecoverySubmitWarning>,
    );

    expect(screen.getByText(/sent from another tab/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View the list' })).toBeInTheDocument();
  });

  it('warns after a send that got no answer', () => {
    render(<FormRecoverySubmitWarning recovery={fakeRecovery({ notices: [{ kind: 'unknownOutcome' }] })} />);

    expect(
      screen.getByText('The last submission got no answer and may have gone through. Check the list before trying again.'),
    ).toBeInTheDocument();
  });

  it('renders nothing otherwise', () => {
    const { container } = render(<FormRecoverySubmitWarning recovery={fakeRecovery()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

const polite = () => document.querySelector('[aria-live="polite"]')!;
const assertive = () => document.querySelector('[aria-live="assertive"]')!;

describe('FormRecoveryAnnouncer', () => {
  it('announces the restore with the step it landed on', () => {
    render(
      <FormRecoveryAnnouncer
        stepLabels={STEP_LABELS}
        recovery={fakeRecovery({ restored: { values: {}, stepIndex: 2, furthestIndex: 3 } })}
      />,
    );

    expect(polite()).toHaveTextContent('Entries restored, step 3 of 4 (Eligibility).');
  });

  it('announces a restore of a single page', () => {
    const single = defineFormRecovery<{ code: string }>({
      formId: 'demo.create',
      version: 1,
      omit: [],
      fieldLabels: { code: { text: 'Code' } },
    });
    render(
      <FormRecoveryAnnouncer
        recovery={fakeRecovery({
          restored: { values: {}, stepIndex: 0, furthestIndex: 0 },
          internals: { ...fakeRecovery().internals, descriptor: single, steps: [] },
        })}
      />,
    );

    expect(polite()).toHaveTextContent('Entries restored.');
  });

  it('is an empty live region before anything is restored', () => {
    render(<FormRecoveryAnnouncer recovery={fakeRecovery()} />);

    expect(polite()).toBeEmptyDOMElement();
  });

  it('speaks a send that may have gone through from a region that was there before', () => {
    const { rerender } = render(<FormRecoveryAnnouncer recovery={fakeRecovery()} />);
    const region = assertive();
    expect(region).toBeEmptyDOMElement();

    rerender(<FormRecoveryAnnouncer recovery={fakeRecovery({ notices: [{ kind: 'unknownOutcome' }] })} />);

    // The very same node: a region mounted with its text is not announced reliably.
    expect(assertive()).toBe(region);
    expect(region).toHaveTextContent('the last submission may have gone through');

    rerender(<FormRecoveryAnnouncer recovery={fakeRecovery()} />);
    expect(region).toBeEmptyDOMElement();
  });

  it('speaks entries that were sent from another tab', () => {
    render(<FormRecoveryAnnouncer recovery={fakeRecovery({ notices: [{ kind: 'sentElsewhere' }] })} />);

    expect(assertive()).toHaveTextContent('sent from another tab');
    expect(assertive()).toHaveTextContent('Warning');
  });
});

describe('in French', () => {
  it('speaks French, with the list format and the plurals of the language', async () => {
    testI18n.addResourceBundle(
      'fr',
      'translation',
      { Functionals: { FormRecovery: fr.Functionals.FormRecovery } },
      true,
      true,
    );
    await testI18n.changeLanguage('fr');
    offerAlert({
      kind: 'resumable',
      savedAt: ago(2 * 3_600_000),
      stepIndex: 2,
      stepCount: 4,
      omittedFilled: ['code', 'token'],
      formChanged: false,
      others: 2,
    });

    expect(screen.getByText('Reprendre votre saisie ?')).toBeInTheDocument();
    expect(
      screen.getByText(/à l'étape 3 sur 4 \(Eligibility\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Code et token/)).toBeInTheDocument();
    expect(screen.getByText('2 autres saisies non envoyées sont conservées.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reprendre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Effacer celle-ci' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir la saisie suivante' })).toBeInTheDocument();
  });
});
