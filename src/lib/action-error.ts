// Next.js's redirect() throws a special NEXT_REDIRECT error that must
// propagate up uncaught — any try/catch wrapping a server action body has to
// re-throw it, or every redirect() call inside that action silently breaks.
export function isRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

// Supabase's client throws (rather than returning { error }) for failures
// below the HTTP layer — DNS resolution, connection refused, timeouts. Every
// action calling it needs to catch that or a network blip crashes instead of
// showing a message.
export function toActionErrorMessage(error: unknown, context: string): string {
  console.error(`[${context}] Unexpected error:`, error);
  return "Couldn't reach the server. Check your connection and try again.";
}
