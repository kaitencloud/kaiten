import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Native disclosure; hidden invalid fields remain reachable and keep their form values. */
export function FormDetails({
  form,
  names,
  title,
  children,
  initialOpen = false,
}: {
  form: any;
  names: readonly string[];
  title: ReactNode;
  children: ReactNode;
  initialOpen?: boolean;
}) {
  return (
    <form.Subscribe
      selector={(state: any) =>
        Object.entries(state.fieldMeta ?? {})
          .filter(
            ([name, meta]: [string, any]) =>
              names.some(
                (prefix) => name === prefix || name.startsWith(prefix + '.'),
              ) && meta?.errors?.length,
          )
          .map(([name]: [string, any]) => name)
          .join(',')
      }
    >
      {(invalid: string) => (
        <Details invalid={invalid} title={title} initialOpen={initialOpen}>
          {children}
        </Details>
      )}
    </form.Subscribe>
  );
}
function Details({
  invalid,
  title,
  children,
  initialOpen,
}: {
  invalid: string;
  title: ReactNode;
  children: ReactNode;
  initialOpen: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    if (!invalid) return;
    const frame = requestAnimationFrame(() =>
      ref.current
        ?.querySelector<HTMLElement>(
          'input[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"], select[aria-invalid="true"]',
        )
        ?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [invalid]);
  return (
    <details
      ref={ref}
      open={open || Boolean(invalid)}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="border-t pt-4"
    >
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline focus-visible:outline-ring">
        {title}
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
