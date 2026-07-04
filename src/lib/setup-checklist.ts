// The EA-setup checklist is verified from real state, not checkboxes: a step
// is done because the database proves it happened. Client-only facts (the
// download click) arrive via cookie and are the one honor-system input.

// Client-owned cookies: the checklist UI writes them, the server render and
// the /api/setup-status poller read them. Client-safe module so both sides
// share the names.
export const EA_DOWNLOADED_COOKIE = "tf-ea-downloaded";
export const SETUP_DONE_COOKIE = "tf-setup-done";
export const SETUP_DISMISSED_COOKIE = "tf-setup-dismissed";

export const SETUP_STEP_IDS = [
  "generate-key",
  "download-ea",
  "install",
  "first-checkin",
  "first-trade",
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export type SetupFacts = {
  hasKey: boolean;
  hasCheckedIn: boolean;
  hasEaTrade: boolean;
  downloadClicked: boolean;
};

export type SetupStep = { id: SetupStepId; done: boolean };

export type SetupChecklist = {
  steps: SetupStep[];
  completedCount: number;
  total: number;
  done: boolean;
};

export function deriveSetupChecklist(facts: SetupFacts): SetupChecklist {
  // A terminal that has checked in proves the download + install happened,
  // whatever browser the click was (or wasn't) tracked on.
  const doneById: Record<SetupStepId, boolean> = {
    "generate-key": facts.hasKey,
    "download-ea": facts.downloadClicked || facts.hasCheckedIn,
    install: facts.hasCheckedIn,
    "first-checkin": facts.hasCheckedIn,
    "first-trade": facts.hasEaTrade,
  };

  const steps = SETUP_STEP_IDS.map((id) => ({ id, done: doneById[id] }));
  const completedCount = steps.filter((s) => s.done).length;
  return { steps, completedCount, total: steps.length, done: completedCount === steps.length };
}

export const COMPLETED_CHECKLIST: SetupChecklist = deriveSetupChecklist({
  hasKey: true,
  hasCheckedIn: true,
  hasEaTrade: true,
  downloadClicked: true,
});
