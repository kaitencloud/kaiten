import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Link } from '@tanstack/react-router';
import { Home, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RestrictedAccessProps {
  // Why the API refused, in its own words: `missing required scope:
  // read:customers`. Left out when it gave none.
  reason?: string;
}

// Shown for a route whose data the API refuses to this session. Nothing went
// wrong and asking again gets the same answer, so this is neither the error
// card nor its "Try Again".
export function RestrictedAccess({ reason }: RestrictedAccessProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[400px] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-muted-foreground" />
            <CardTitle>{t('Errors.restricted')}</CardTitle>
          </div>
          <CardDescription>{t('Errors.restrictedDescription')}</CardDescription>
        </CardHeader>
        {reason && (
          <CardContent>
            <p className="rounded-md bg-muted p-3 text-sm">{reason}</p>
          </CardContent>
        )}
        <CardFooter>
          <Button
            nativeButton={false}
            role="link"
            variant="outline"
            render={
              <Link to="/">
                <Home className="size-4" />
                {t('Errors.goHome')}
              </Link>
            }
          />
        </CardFooter>
      </Card>
    </div>
  );
}
