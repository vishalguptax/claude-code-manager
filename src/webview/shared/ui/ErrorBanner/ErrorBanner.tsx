/**
 * ErrorBanner — a warning strip listing user-readable parse errors
 * (malformed config files) above a feature's list view. Renders
 * nothing when there are no errors. Purely presentational; features
 * feed it from their `parseErrors` signal.
 */

export interface ErrorBannerProps {
  errors: string[];
}

export function ErrorBanner({ errors }: ErrorBannerProps) {
  if (errors.length === 0) return null;
  return (
    <div class="error-banner" role="alert">
      {errors.map((message, i) => (
        <div class="error-banner__item" key={i}>
          {message}
        </div>
      ))}
    </div>
  );
}
