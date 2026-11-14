"use client";

/**
 * Hands the page to the browser's own print pipeline, whose "Save as PDF"
 * destination writes the file.
 *
 * Deliberately not a PDF library: the browser already renders this document
 * with real fonts and selectable text, and a server-side renderer would mean a
 * second layout engine to keep in step with this page for a console two people
 * use. See the note in the page itself.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-neutral-300 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
    >
      Save as PDF
    </button>
  );
}
