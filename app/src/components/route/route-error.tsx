import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useRouter } from '@tanstack/react-router';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  getErrorMessage,
  isApiError,
  isForbiddenError,
  isNotFoundError,
  isProblem,
  mapApiError,
} from '@/lib/errors';
import { NotFound } from './not-found';
import { RestrictedAccess } from './restricted-access';

interface RouteErrorProps {
  // Whatever a loader or component threw. `throw` is not restricted to `Error`
  // and the router types it as `unknown` accordingly, so narrow before reading
  // `message` or `stack`.
  error: unknown;
  reset?: () => void;
}

// The text to print for whatever was thrown. The `message` of an `ApiError`
// only names the status (`Request failed with status 409`): what the API said
// is in the problem it answered. `mapApiError` and `getErrorMessage` read it
// without logging, unlike `getApiErrorMessage`, so they can run on every
// render.
function getRouteErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (isApiError(error)) {
    const appError = mapApiError(error, t);

    // Only a problem is the API speaking. Any other body is the text or the
    // HTML page of a gateway: leave it out, so that the message is the generic
    // one of the status.
    return getErrorMessage(
      isProblem(error.data) ? appError : { ...appError, message: '' },
      t,
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '';
}

// Why the API refused the request: the `detail` of its problem. The `title`
// of a refusal ("Forbidden") adds nothing to the restricted state.
function getRefusalReason(error: unknown): string | undefined {
  return isApiError(error) && isProblem(error.data)
    ? error.data.detail
    : undefined;
}

export function RouteError({ error, reset }: RouteErrorProps) {
  const router = useRouter();
  const { t } = useTranslation();

  // A missing entity is not a failure to retry: say it is gone, and offer the
  // way back instead of "Try Again".
  if (isNotFoundError(error)) {
    return <NotFound />;
  }

  // Nor is a refusal: the session may not read this page, and asking again
  // gets the same answer.
  if (isForbiddenError(error)) {
    return <RestrictedAccess reason={getRefusalReason(error)} />;
  }

  const handleRetry = () => {
    if (reset) {
      reset();
    } else {
      router.invalidate();
    }
  };

  const handleGoHome = () => {
    router.navigate({ to: '/' });
  };

  const isDev = import.meta.env.DEV;
  const message = getRouteErrorMessage(error, t);
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive-subtle-foreground" />
            <CardTitle>{t('Errors.title', 'Something went wrong')}</CardTitle>
          </div>
          <CardDescription>
            {t(
              'Errors.description',
              'An error occurred while loading this page.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('Errors.errorTitle', 'Error')}</AlertTitle>
            <AlertDescription>
              {message || t('Errors.unknownError', 'An unknown error occurred')}
            </AlertDescription>
          </Alert>
          {isDev && stack && (
            <pre tabIndex={0} className="mt-4 p-3 bg-muted rounded-md text-xs overflow-auto max-h-32">
              {stack}
            </pre>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button variant="outline" onClick={handleGoHome}>
            <Home className="h-4 w-4" />
            {t('Errors.goHome', 'Go Home')}
          </Button>
          <Button onClick={handleRetry}>
            <RefreshCw className="h-4 w-4" />
            {t('Errors.retry', 'Try Again')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
