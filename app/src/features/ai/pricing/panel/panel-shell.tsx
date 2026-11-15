import { X } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

type PanelShellProps = {
  children: ReactNode;
  /** What follows the body and stays in view: the actions of a form. */
  footer?: ReactNode;
  /** Under the title: the pool, the request type, the states. */
  meta: ReactNode;
  onClose: () => void;
  title: string;
};

/**
 * The panel of a cell, docked beside the grid on a wide screen and laid over
 * its right edge on a narrow one. It is not a modal: the grid stays in reach,
 * and another cell can be opened from it. Focus moves to its title when it
 * opens; Escape closes it.
 */
export function PanelShell({
  children,
  footer,
  meta,
  onClose,
  title,
}: PanelShellProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
    // A list opened from the panel lives in a portal: its Escape is its own.
    if (
      event.key === 'Escape' &&
      !event.defaultPrevented &&
      event.currentTarget.contains(event.target as Node)
    ) {
      onClose();
    }
  }

  return (
    <aside
      aria-labelledby={titleId}
      data-cell-panel=""
      className="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-lg max-xl:fixed max-xl:inset-y-3 max-xl:right-3 max-xl:z-40 max-xl:w-[min(26.25rem,calc(100vw-1.5rem))] xl:sticky xl:top-3"
      onKeyDown={closeOnEscape}
    >
      <header className="flex items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2
            className="text-base font-semibold outline-none"
            id={titleId}
            ref={heading}
            tabIndex={-1}
          >
            {title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {meta}
          </div>
        </div>
        <Button
          aria-label={t('AI.Panel.close')}
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {children}
      </div>
      {footer ? (
        <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          {footer}
        </footer>
      ) : null}
    </aside>
  );
}

export function PanelSection({
  aside,
  children,
  title,
}: {
  aside?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
          {title}
        </h3>
        {aside ? (
          <span className="text-[0.6875rem] text-muted-foreground">
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
