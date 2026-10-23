import { render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import {
  defineFormRecovery,
  useFormRecovery,
  useFormRecoveryForm,
  type FormRecoveryDescriptor,
  type FormRecoveryNote,
} from '..';
import {
  elapse,
  input,
  installRecoveryTranslations,
  mountDemo,
  setupUser,
} from './recovery-test-utils';
import { storedRecords } from './session-helpers';

vi.mock('sonner', () => ({ toast: vi.fn() }));

beforeEach(() => {
  installRecoveryTranslations();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-23T10:00:00.000Z'));
  vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'true');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const only = () => Object.values(storedRecords());

describe('the adapter and a value the feature fills in itself', () => {
  it('writes nothing for what the feature set up after the mount, and everything the person types afterwards', async () => {
    const user = setupUser();
    const view = mountDemo({ initializeAfterMount: true });
    await elapse(3_000);
    expect(only()).toEqual([]);

    view.unmount();
    await elapse();
    expect(only()).toEqual([]);

    mountDemo({ initializeAfterMount: true });
    await user.type(input('Name'), 'Gold');
    await elapse();
    const [record] = only();
    expect(record!.payload).toBe('[["name","Gold"]]');
    expect(record!.payload).not.toContain('filled by the feature');
  });
});

describe('the adapter and the lists of references', () => {
  type Values = { licenseId: string; addonIds: string[]; name: string };
  type Refs = { licenses: { id: string; name: string }[]; addons: { id: string }[] };

  const recoveryOfLicenses: FormRecoveryDescriptor<Values, Refs> = defineFormRecovery<
    Values,
    Refs
  >({
    formId: 'refs.create',
    version: 1,
    omit: [],
    fieldLabels: {
      licenseId: { text: 'License' },
      addonIds: { text: 'Add-ons' },
      name: { text: 'Name' },
    },
    schema: z.object({
      licenseId: z.string(),
      addonIds: z.array(z.string()),
      name: z.string(),
    }),
    reconcile: (values, references) => {
      const notes: FormRecoveryNote[] = [];
      let next = values;
      const license = references.licenses?.find((item) => item.id === values.licenseId);
      if (references.licenses && values.licenseId && !license) {
        next = { ...next, licenseId: '' };
        notes.push({
          kind: 'unavailable',
          entity: { text: 'license' },
          name: 'Gold',
        });
      }
      if (references.addons) {
        const known = new Set(references.addons.map((item) => item.id));
        const kept = next.addonIds.filter((id) => known.has(id));
        if (kept.length !== next.addonIds.length) {
          next = { ...next, addonIds: kept };
          notes.push({ kind: 'unavailable', entity: { text: 'add-on' }, name: null });
        }
      }
      return { values: next, notes };
    },
    labels: (values, references) =>
      Object.fromEntries(
        (references.licenses ?? [])
          .filter((item) => item.id === values.licenseId)
          .map((item) => [item.id, item.name]),
      ),
  });

  function RefsForm({ references }: { references: Partial<Refs> }) {
    const recovery = useFormRecovery(recoveryOfLicenses, {
      enabled: true,
      pristine: { licenseId: '', addonIds: [], name: '' },
    });
    return <RefsBody key={recovery.sessionKey} recovery={recovery} references={references} />;
  }

  function RefsBody({
    recovery,
    references,
  }: {
    recovery: ReturnType<typeof useFormRecovery<Values, Refs>>;
    references: Partial<Refs>;
  }) {
    const form = useAppForm({
      defaultValues: recovery.pristine,
      onSubmit: async () => {},
    });
    useFormRecoveryForm(recovery, form, { references });

    return (
      <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <button type="button" onClick={recovery.resume}>
          resume
        </button>
        <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
        <output data-testid="notes">
          {recovery.notes.map((note) => JSON.stringify(note)).join('\n')}
        </output>
        <output data-testid="values">{JSON.stringify(form.state.values)}</output>
        <form.Subscribe selector={(state) => state.values}>
          {(values) => <output data-testid="live">{JSON.stringify(values)}</output>}
        </form.Subscribe>
      </form>
    );
  }

  it('replays reconcile as each list arrives, and names what disappeared', async () => {
    const user = setupUser();
    const first = render(
      <RefsForm references={{ licenses: [{ id: 'l1', name: 'Gold' }], addons: [{ id: 'a1' }] }} />,
    );
    await user.type(input('Name'), 'Plan');
    await elapse();
    first.unmount();

    // Store an input that points at a license and an add-on that are gone.
    const [record] = only();
    const patch = JSON.parse(record!.payload) as [string, unknown][];
    patch.push(['licenseId', 'l-gone'], ['addonIds', ['a-gone', 'a1']]);
    const blob = JSON.parse(window.localStorage.getItem('kaiten:form-recovery')!);
    const key = Object.keys(blob)[0]!;
    blob[key].data.payload = JSON.stringify(patch);
    blob[key].versionKey = 'tampered-1';
    window.localStorage.setItem('kaiten:form-recovery', JSON.stringify(blob));

    // The loader does not wait for its lists: the licenses arrive first, the add-ons later.
    const view = render(<RefsForm references={{}} />);
    await user.click(await screen.findByRole('button', { name: 'resume' }));
    await waitFor(() => expect(screen.getByTestId('live').textContent).toContain('l-gone'));

    view.rerender(<RefsForm references={{ licenses: [{ id: 'l1', name: 'Gold' }] }} />);
    await waitFor(() => expect(screen.getByTestId('live').textContent).toContain('"licenseId":""'));
    expect(screen.getByTestId('notes').textContent).toContain('license');
    expect(screen.getByTestId('live').textContent).toContain('a-gone');

    view.rerender(
      <RefsForm references={{ licenses: [{ id: 'l1', name: 'Gold' }], addons: [{ id: 'a1' }] }} />,
    );
    await waitFor(() => expect(screen.getByTestId('live').textContent).not.toContain('a-gone'));
    expect(screen.getByTestId('live').textContent).toContain('"addonIds":["a1"]');
    expect(screen.getByTestId('notes').textContent).toContain('add-on');
  });

  it('keeps an id whose list was refused: the server will say', async () => {
    const user = setupUser();
    const first = render(<RefsForm references={{}} />);
    await user.type(input('Name'), 'Plan');
    await elapse();
    first.unmount();
    const blob = JSON.parse(window.localStorage.getItem('kaiten:form-recovery')!);
    const key = Object.keys(blob)[0]!;
    blob[key].data.payload = JSON.stringify([['name', 'Plan'], ['licenseId', 'l1']]);
    blob[key].versionKey = 'tampered-2';
    window.localStorage.setItem('kaiten:form-recovery', JSON.stringify(blob));

    render(<RefsForm references={{}} />);
    await user.click(await screen.findByRole('button', { name: 'resume' }));
    await elapse(300);

    expect(screen.getByTestId('live').textContent).toContain('"licenseId":"l1"');
  });
});

describe('the adapter and the state outside the form', () => {
  type Values = { name: string };
  type Extra = { rows: string[] };
  type Refs = { base: { updatedAt: string } };

  const recoveryWithRows: FormRecoveryDescriptor<Values, Refs, Extra> =
    defineFormRecovery<Values, Refs, Extra>({
      formId: 'rows.create',
      version: 1,
      omit: [],
      fieldLabels: { name: { text: 'Name' } },
      extraSchema: z.object({ rows: z.array(z.string()) }),
      extraSource: (references) => references.base?.updatedAt ?? null,
      extraSourceLabel: { text: 'The base license' },
    });

  const BASE_ROWS = ['copied from the base'];
  const discarded = vi.fn();

  function RowsForm({ source }: { source: string }) {
    const recovery = useFormRecovery(recoveryWithRows, {
      enabled: true,
      pristine: { name: '' },
    });
    return <RowsBody key={recovery.sessionKey} recovery={recovery} source={source} />;
  }

  function RowsBody({
    recovery,
    source,
  }: {
    recovery: ReturnType<typeof useFormRecovery<Values, Refs, Extra>>;
    source: string;
  }) {
    const [rows, setRows] = useState(recovery.restored?.extra?.rows ?? BASE_ROWS);
    const form = useAppForm({ defaultValues: recovery.pristine, onSubmit: async () => {} });
    useFormRecoveryForm(recovery, form, {
      extra: () => ({ rows }),
      references: { base: { updatedAt: source } },
      onExtraDiscarded: () => {
        discarded();
        setRows(BASE_ROWS);
      },
    });

    return (
      <div>
        <button type="button" onClick={() => setRows([...rows, 'added'])}>
          add row
        </button>
        <button type="button" onClick={recovery.resume}>
          resume
        </button>
        <output data-testid="rows">{rows.join(',')}</output>
        <output data-testid="notes">{recovery.notes.map((n) => JSON.stringify(n)).join('')}</output>
      </div>
    );
  }

  async function leave(source: string) {
    const user = setupUser();
    const view = render(<RowsForm source={source} />);
    await user.click(screen.getByRole('button', { name: 'add row' }));
    await elapse();
    view.unmount();
  }

  it('stores the state outside the form only when it changed, with the fingerprint of its source', async () => {
    const user = setupUser();
    const view = render(<RowsForm source="v1" />);
    await elapse(3_000);
    expect(only()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'add row' }));
    await elapse();

    const [record] = only();
    expect(record).toMatchObject({ extraSource: 'v1' });
    expect(JSON.parse(record!.extra as string)).toMatchObject({ rows: ['copied from the base', 'added'] });
    view.unmount();
  });

  it('gives it back when its source has not changed', async () => {
    const user = setupUser();
    await leave('v1');

    render(<RowsForm source="v1" />);
    await user.click(await screen.findByRole('button', { name: 'resume' }));
    await elapse(300);

    expect(screen.getByTestId('rows')).toHaveTextContent('copied from the base,added');
    expect(screen.getByTestId('notes').textContent).toBe('');
  });

  it('drops it, says so and lets the feature start it afresh when its source has changed', async () => {
    const user = setupUser();
    discarded.mockClear();
    await leave('v1');

    render(<RowsForm source="v2" />);
    await user.click(await screen.findByRole('button', { name: 'resume' }));

    await waitFor(() => expect(discarded).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('rows')).toHaveTextContent(/^copied from the base$/);
    expect(screen.getByTestId('notes').textContent).toContain('The base license');
    expect(screen.getByTestId('notes').textContent).toContain('sourceChanged');
  });
});
