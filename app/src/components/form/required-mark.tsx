/**
 * The visual "required" mark. Rendered beside the label rather than inside it,
 * so the label's text (what `getByLabel` and screen readers use) stays the
 * field's name; the control itself carries `aria-required`.
 *
 * Same line box as `Label` (`text-sm leading-none`): otherwise the mark takes
 * the body line-height and a required label row ends up taller than an
 * optional one, misaligning inputs placed side by side.
 */
function RequiredMark() {
  return (
    <span
      aria-hidden="true"
      className="text-sm leading-none text-destructive-subtle-foreground"
    >
      *
    </span>
  );
}

export default RequiredMark;
