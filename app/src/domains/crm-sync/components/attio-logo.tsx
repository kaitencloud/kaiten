import { cn } from '@/lib/utils';
import { ATTIO_LOGO_ASSETS } from '../constants';

type AttioLogoProps = {
  className?: string;
};

/** Decorative Attio mark that follows the app light/dark theme. */
export function AttioLogo({ className }: AttioLogoProps) {
  return (
    <>
      <img
        src={ATTIO_LOGO_ASSETS.light}
        alt=""
        aria-hidden
        className={cn('block dark:hidden', className)}
      />
      <img
        src={ATTIO_LOGO_ASSETS.dark}
        alt=""
        aria-hidden
        className={cn('hidden dark:block', className)}
      />
    </>
  );
}
