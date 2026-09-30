import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { sideNavAssets } from './side-nav.constants';

type SideNavLogoImageProps = {
  alt: string;
  className?: string;
  height: number;
  src: string;
  width: number;
};

function SideNavLogoImage({
  alt,
  className,
  height,
  src,
  width,
}: SideNavLogoImageProps) {
  return (
    <img
      src={src}
      width={width}
      height={height}
      alt={alt}
      className={className}
    />
  );
}

type SideNavLogoProps = {
  isCollapsed: boolean;
};

export function SideNavLogo({ isCollapsed }: SideNavLogoProps) {
  const alt = 'Kaiten Logo';

  return (
    <Link to="/" className={cn('flex items-center', !isCollapsed && 'pl-2')}>
      {isCollapsed ? (
        <SideNavLogoImage
          alt={alt}
          height={28}
          src={sideNavAssets.logoIconDark}
          width={24}
        />
      ) : (
        <>
          <SideNavLogoImage
            alt={alt}
            className="block dark:hidden"
            height={28}
            src={sideNavAssets.logoLight}
            width={100}
          />
          <SideNavLogoImage
            alt={alt}
            className="hidden dark:block"
            height={28}
            src={sideNavAssets.logoDark}
            width={100}
          />
        </>
      )}
    </Link>
  );
}
