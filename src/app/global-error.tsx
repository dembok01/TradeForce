"use client"; // Error boundaries must be Client Components

// global-error replaces the root layout when it renders, so it must define its
// own <html>/<body> and cannot rely on the layout's font variables. Inline the
// obsidian/bone colors so the last-resort screen still reads as TradeForce.
import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(20 8% 4%)",
          color: "hsl(40 27% 90%)",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", padding: "1.5rem" }}>
          <p
            style={{
              margin: 0,
              fontFamily: "ui-monospace, monospace",
              fontSize: "11px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "hsl(6 63% 55%)",
            }}
          >
            Something broke
          </p>
          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.5rem", fontWeight: 600 }}>
            TradeForce hit an unexpected error.
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "hsl(35 10% 60%)" }}>
            Reload to get back to your dashboard. Your rules and trades are untouched.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "0.375rem",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              color: "hsl(0 0% 6%)",
              background: "linear-gradient(to bottom, hsl(45 75% 62%), hsl(38 70% 46%))",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
