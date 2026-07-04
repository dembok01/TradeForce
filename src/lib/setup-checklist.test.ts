import { describe, expect, it } from "vitest";
import { deriveSetupChecklist } from "./setup-checklist";

const facts = (overrides = {}) => ({
  hasKey: false,
  hasCheckedIn: false,
  hasEaTrade: false,
  downloadClicked: false,
  ...overrides,
});

describe("deriveSetupChecklist", () => {
  it("starts with nothing done", () => {
    const c = deriveSetupChecklist(facts());
    expect(c.completedCount).toBe(0);
    expect(c.done).toBe(false);
    expect(c.total).toBe(5);
  });

  it("key generation completes only the first step", () => {
    const c = deriveSetupChecklist(facts({ hasKey: true }));
    expect(c.steps.find((s) => s.id === "generate-key")?.done).toBe(true);
    expect(c.completedCount).toBe(1);
  });

  it("a check-in proves download and install too", () => {
    const c = deriveSetupChecklist(facts({ hasKey: true, hasCheckedIn: true }));
    expect(c.steps.find((s) => s.id === "download-ea")?.done).toBe(true);
    expect(c.steps.find((s) => s.id === "install")?.done).toBe(true);
    expect(c.steps.find((s) => s.id === "first-checkin")?.done).toBe(true);
    expect(c.completedCount).toBe(4);
    expect(c.done).toBe(false);
  });

  it("download click marks only the download step early", () => {
    const c = deriveSetupChecklist(facts({ hasKey: true, downloadClicked: true }));
    expect(c.steps.find((s) => s.id === "download-ea")?.done).toBe(true);
    expect(c.steps.find((s) => s.id === "install")?.done).toBe(false);
    expect(c.completedCount).toBe(2);
  });

  it("first EA trade completes the checklist", () => {
    const c = deriveSetupChecklist(
      facts({ hasKey: true, hasCheckedIn: true, hasEaTrade: true })
    );
    expect(c.completedCount).toBe(5);
    expect(c.done).toBe(true);
  });
});
