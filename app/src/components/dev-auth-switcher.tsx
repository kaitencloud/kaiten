import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon } from 'lucide-react';
import tokens from 'virtual:dev-tokens';
import {
  getStoredDevToken,
  hasStoredDevToken,
  setDevToken,
} from '@/lib/local-auth';
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Identity tints, not status: a hash over the id only needs six chips you can tell
// apart at a glance. Reusing the subtle pairs from `tokens.css` makes them follow the
// theme and stay readable — the raw `bg-*-500` shades these replace all carried
// white text below AA, from 4.40:1 down to 2.13:1 on amber. At subtle intensity the
// hues read as identity rather than as success or error.
const AVATAR_TINTS = [
  'bg-primary-subtle text-primary-subtle-foreground',
  'bg-info-subtle text-info-subtle-foreground',
  'bg-success-subtle text-success-subtle-foreground',
  'bg-warning-subtle text-warning-subtle-foreground',
  'bg-destructive-subtle text-destructive-subtle-foreground',
  'bg-accent text-accent-foreground',
];

function avatarTint(id: string) {
  const hash = Array.from(id).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function tokenKey(t: (typeof tokens)[number]) {
  return `${t.user_id}:${t.org_id}`;
}

type OrgGroup = {
  org_id: string;
  org_name: string;
  members: (typeof tokens)[number][];
};

function groupByOrg(ts: typeof tokens): OrgGroup[] {
  const map = new Map<string, OrgGroup>();
  for (const t of ts) {
    const g = map.get(t.org_id) ?? {
      org_id: t.org_id,
      org_name: t.org_name,
      members: [],
    };
    g.members.push(t);
    map.set(t.org_id, g);
  }
  return [...map.values()];
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function UserAvatar({
  name,
  userId,
  size = 'md',
}: {
  name: string;
  userId: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = {
    sm: 'size-7 text-xs',
    md: 'size-9 text-sm',
    lg: 'size-11 text-base',
  }[size];
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold shrink-0',
        sizeClass,
        avatarTint(userId),
      )}
    >
      {initials(name)}
    </div>
  );
}

function UserRow({
  t,
  active,
  onSelect,
}: {
  t: (typeof tokens)[number];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent cursor-pointer',
        active && 'bg-primary-subtle',
      )}
    >
      <UserAvatar name={t.user_name} userId={t.user_id} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{t.user_name}</div>
        <div className="text-xs text-muted-foreground truncate">{t.email}</div>
      </div>
      {active && (
        <CheckIcon className="size-3.5 text-primary-subtle-foreground shrink-0" />
      )}
    </button>
  );
}

function DevBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-subtle px-3 py-1 text-xs font-medium text-warning-subtle-foreground">
      <span className="size-1.5 rounded-full bg-warning" />
      Local development
    </span>
  );
}

// ── Two-step org picker used in both gate and switcher ────────────────────────

function OrgPicker({
  stored,
  onSelect,
}: {
  stored: string | null;
  onSelect: (t: (typeof tokens)[number]) => void;
}) {
  const groups = groupByOrg(tokens);
  const [selectedOrg, setSelectedOrg] = useState<OrgGroup | null>(null);

  if (selectedOrg) {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setSelectedOrg(null)}
          className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronLeftIcon className="size-3.5" />
          {selectedOrg.org_name}
        </button>
        <div className="overflow-y-auto max-h-64 flex flex-col gap-0.5">
          {selectedOrg.members.map((t) => (
            <UserRow
              key={tokenKey(t)}
              t={t}
              active={t.token === stored}
              onSelect={() => onSelect(t)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-64 flex flex-col gap-1">
      {groups.map((group) => {
        const activeInOrg = group.members.some((m) => m.token === stored);
        const activeUser = group.members.find((m) => m.token === stored);
        return (
          <button
            key={group.org_id}
            type="button"
            onClick={() => setSelectedOrg(group)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent cursor-pointer',
              activeInOrg && 'bg-primary-subtle',
            )}
          >
            <div
              className={cn(
                'size-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                avatarTint(group.org_id),
              )}
            >
              {group.org_name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {group.org_name}
              </div>
              {activeInOrg && activeUser ? (
                <div className="text-xs text-muted-foreground truncate">
                  {activeUser.user_name}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {group.members.length} members
                </div>
              )}
            </div>
            {activeInOrg && (
              <CheckIcon className="size-3.5 text-primary-subtle-foreground shrink-0" />
            )}
            <ChevronDownIcon className="size-3.5 text-muted-foreground shrink-0 -rotate-90" />
          </button>
        );
      })}
    </div>
  );
}

// ── LocalAuthGate — shown before the app on first run ────────────────────────

export function LocalAuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(hasStoredDevToken);

  if (!tokens.length) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
        <div className="rounded-xl border p-8 text-center max-w-sm">
          <DevBadge />
          <p className="mt-4 text-sm font-medium">No dev tokens found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start the stack with{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              task up
            </code>{' '}
            to create them, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    const stored = getStoredDevToken();
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <DevBadge />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">
              Choose a dev account
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Select an organization, then a user
            </p>
          </div>
          <div className="rounded-xl border bg-popover p-2">
            <OrgPicker
              stored={stored}
              onSelect={(t) => {
                setDevToken(t);
                setReady(true);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ── DevAuthSwitcher — compact header switcher ─────────────────────────────────

export function DevAuthSwitcher() {
  const stored = getStoredDevToken();
  const active = tokens.find((t) => t.token === stored);

  if (!tokens.length) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="relative flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent transition-colors cursor-pointer"
          >
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-warning ring-1 ring-background" />
            {active ? (
              <>
                <UserAvatar
                  name={active.user_name}
                  userId={active.user_id}
                  size="sm"
                />
                <div className="hidden sm:block text-left leading-tight">
                  <div className="font-medium">{active.user_name}</div>
                  <div className="text-muted-foreground text-[10px]">
                    {active.org_name}
                  </div>
                </div>
              </>
            ) : (
              <span className="text-muted-foreground">Select account…</span>
            )}
            <ChevronDownIcon className="size-3 text-muted-foreground hidden sm:block" />
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 rounded-xl p-2 shadow-lg"
      >
        <div className="mb-2 px-1 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-warning" />
          <span className="text-xs font-medium text-muted-foreground">
            Dev accounts
          </span>
        </div>
        <OrgPicker
          stored={stored}
          onSelect={(t) => {
            if (t.token !== stored) {
              setDevToken(t);
              // Full navigation, not reload(): the current URL can carry a
              // resource id scoped to the org being switched away from (e.g.
              // /customers/instances/{id}), which 404s under the new token.
              // Landing on the dashboard is always valid for whichever
              // account was just selected.
              window.location.href = '/dashboard';
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
