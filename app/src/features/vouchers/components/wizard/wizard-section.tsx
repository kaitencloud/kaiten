import type { ReactNode } from 'react';

type WizardSectionProps = {
  children: ReactNode;
  /** What the section is for, under its title. */
  description?: string;
  title: string;
};

/** A titled group of fields inside a step, so that a long step reads as a few short ones. */
export function WizardSection({
  children,
  description,
  title,
}: WizardSectionProps) {
  return (
    <section className="space-y-4 border-t pt-5 first:border-t-0 first:pt-0">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="text-[0.8rem] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
