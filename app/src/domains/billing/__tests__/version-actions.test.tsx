import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import {
  VersionDraftDeleteAction,
  VersionLifecycleAction,
  VersionLifecycleBadge,
  type VersionDeleteKeys,
  type VersionLifecycleKeys,
} from '../components';

useBillingTexts();

// Keys that do not exist come back as they are, which is what these tests read.
const word = (transition: string) => ({
  confirm: `${transition}.confirm`,
  description: `${transition}.description`,
  label: `${transition}.label`,
  title: `${transition}.title`,
});
const KEYS: VersionLifecycleKeys = {
  archive: word('archive'),
  publish: word('publish'),
  unarchive: word('unarchive'),
};
const DELETE_KEYS: VersionDeleteKeys = word('delete');

const renderLifecycle = (
  props: Partial<Parameters<typeof VersionLifecycleAction>[0]> = {},
) => {
  const onConfirm = vi.fn();
  render(
    <TooltipProvider>
      <VersionLifecycleAction
        appearance="card"
        blocked={false}
        blockedKey="blocked.reason"
        isPending={false}
        keys={KEYS}
        name="Extra seats"
        onConfirm={onConfirm}
        publishNote={<p>the note</p>}
        slug="extra-seats-v1"
        transition="publish"
        version={1}
        {...props}
      />
    </TooltipProvider>,
  );

  return { onConfirm };
};

describe('the lifecycle action of a version', () => {
  it('asks first, then runs the transition it was opened for on the version it was opened on', async () => {
    const { onConfirm } = renderLifecycle();

    await userEvent.click(screen.getByRole('button', { name: 'publish.label' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText('publish.title')).toBeInTheDocument();
    expect(screen.getByText('the note')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'publish.confirm' }));

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
      slug: 'extra-seats-v1',
      transition: 'publish',
    });
  });

  it('says the note of a publication only for a publication', async () => {
    renderLifecycle({ transition: 'archive' });

    await userEvent.click(screen.getByRole('button', { name: 'archive.label' }));

    expect(await screen.findByText('archive.title')).toBeInTheDocument();
    expect(screen.queryByText('the note')).toBeNull();
  });

  it('stays, disabled, when the default cannot be archived', () => {
    const { onConfirm } = renderLifecycle({ blocked: true, transition: 'archive' });

    expect(screen.getByRole('button', { name: 'archive.label' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is not there for a session that may not do it', () => {
    renderLifecycle({ available: false });

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('cannot be started without a version to act on', () => {
    renderLifecycle({ slug: undefined });
    expect(screen.getByRole('button', { name: 'publish.label' })).toBeDisabled();
  });
});

describe('the lifecycle action of a thing that is never put back on sale', () => {
  // A voucher is published and archived: it says two transitions, and nothing blocks either.
  it('says only the transitions it goes through, and is never blocked', async () => {
    const onConfirm = vi.fn();
    const keys: VersionLifecycleKeys<'archive' | 'publish'> = {
      archive: word('archive'),
      publish: word('publish'),
    };
    render(
      <TooltipProvider>
        <VersionLifecycleAction
          appearance="card"
          isPending={false}
          keys={keys}
          name="Launch discount"
          onConfirm={onConfirm}
          slug="voucher-launch"
          transition="archive"
          version={undefined}
        />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'archive.label' }));
    expect(await screen.findByText('archive.title')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'archive.confirm' }));

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
      slug: 'voucher-launch',
      transition: 'archive',
    });
  });
});

describe('the deletion of a draft', () => {
  const renderDelete = (offered = true) => {
    const onDelete = vi.fn();
    render(
      <VersionDraftDeleteAction
        appearance="card"
        isPending={false}
        keys={DELETE_KEYS}
        name="Extra seats"
        offered={offered}
        onDelete={onDelete}
        slug="extra-seats-v2"
        version={2}
      />,
    );

    return { onDelete };
  };

  it('asks first, then deletes the version it was opened on', async () => {
    const { onDelete } = renderDelete();

    await userEvent.click(screen.getByRole('button', { name: 'delete.label' }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'delete.confirm' }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith('extra-seats-v2');
  });

  it('is not offered for what is not a draft', () => {
    renderDelete(false);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('the badge of the state of a version', () => {
  it('says the state in the words it is given', () => {
    render(<VersionLifecycleBadge label="On sale" state="PUBLISHED" />);

    expect(screen.getByText('On sale')).toBeInTheDocument();
  });
});
