import { useCallback, useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { flushSync } from 'react-dom';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

interface AnimatedThemeTogglerProps
  extends React.ComponentPropsWithoutRef<'button'> {
  duration?: number;
}

export const AnimatedThemeToggler = ({
  className,
  duration = 400,
  ...props
}: AnimatedThemeTogglerProps) => {
  const { setTheme, theme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDark = theme === 'dark';

  const handleToggle = useCallback(async () => {
    const nextTheme = isDark ? 'light' : 'dark';
    const viewTransitionDocument = document as ViewTransitionDocument;

    if (
      !buttonRef.current ||
      !viewTransitionDocument.startViewTransition ||
      window.innerWidth === 0 ||
      window.innerHeight === 0
    ) {
      setTheme(nextTheme);
      return;
    }

    // Measure at click time: async siblings (Clerk widgets, the notification
    // bell badge) can reflow the header during the transition setup, and a
    // rect taken after `ready` would center the circle on a moved button.
    const { top, left, width, height } =
      buttonRef.current.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    // Percentage-based keyframes: Chrome 150 rasterizes px clip-path values
    // on view-transition pseudos in device-pixel space on HiDPI screens
    // (visually halving them at dpr 2). Percentages are ratios of the
    // reference box, immune to that bug, and identical on Safari and fixed
    // Chrome. circle()'s % radius resolves against hypot(w, h) / √2.
    const xPercent = (x / window.innerWidth) * 100;
    const yPercent = (y / window.innerHeight) * 100;
    const radiusPercent =
      (maxRadius /
        (Math.hypot(window.innerWidth, window.innerHeight) / Math.SQRT2)) *
      100;

    try {
      await viewTransitionDocument.startViewTransition(() => {
        // Apply the class synchronously: the provider's useEffect runs too
        // late for the transition's "new" snapshot capture.
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(nextTheme);
        flushSync(() => {
          setTheme(nextTheme);
        });
      }).ready;
    } catch {
      // Transition skipped (hidden tab, concurrent transition…): the theme
      // is applied, only the reveal animation is dropped.
      return;
    }

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0% at ${xPercent}% ${yPercent}%)`,
          `circle(${radiusPercent}% at ${xPercent}% ${yPercent}%)`,
        ],
      },
      {
        duration,
        easing: 'ease-in-out',
        pseudoElement: '::view-transition-new(root)',
      },
    );
  }, [duration, isDark, setTheme]);

  return (
    <button
      ref={buttonRef}
      onClick={handleToggle}
      className={cn(className)}
      {...props}
    >
      {isDark ? <Sun /> : <Moon />}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
};
