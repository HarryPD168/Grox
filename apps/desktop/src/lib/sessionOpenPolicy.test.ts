import { describe, expect, it, beforeEach } from "vitest";
import {
  SHELL_VERSION_STORAGE_KEY,
  consumeShellUpgradeRescan,
  sanitizeSessionForOpen,
  shouldForceOfflineRescan,
} from "./sessionOpenPolicy";

describe("consumeShellUpgradeRescan", () => {
  beforeEach(() => {
    localStorage.removeItem(SHELL_VERSION_STORAGE_KEY);
  });

  it("returns true on first pin and stores version", () => {
    expect(consumeShellUpgradeRescan("0.2.13")).toBe(true);
    expect(localStorage.getItem(SHELL_VERSION_STORAGE_KEY)).toBe("0.2.13");
  });

  it("returns false when version unchanged", () => {
    localStorage.setItem(SHELL_VERSION_STORAGE_KEY, "0.2.13");
    expect(consumeShellUpgradeRescan("0.2.13")).toBe(false);
  });

  it("returns true on upgrade 0.2.12 → 0.2.13", () => {
    localStorage.setItem(SHELL_VERSION_STORAGE_KEY, "0.2.12");
    expect(consumeShellUpgradeRescan("0.2.13")).toBe(true);
    expect(localStorage.getItem(SHELL_VERSION_STORAGE_KEY)).toBe("0.2.13");
  });
});

describe("shouldForceOfflineRescan (0.2.30 per-session)", () => {
  it("forces when upgrade active and session not yet force-rescanned", () => {
    expect(
      shouldForceOfflineRescan({
        upgradeRescanActive: true,
        sessionAlreadyForceRescanned: false,
      }),
    ).toBe(true);
  });

  it("does not force the same session twice in one upgrade generation", () => {
    expect(
      shouldForceOfflineRescan({
        upgradeRescanActive: true,
        sessionAlreadyForceRescanned: true,
      }),
    ).toBe(false);
  });

  it("does not force when upgrade generation is inactive", () => {
    expect(
      shouldForceOfflineRescan({
        upgradeRescanActive: false,
        sessionAlreadyForceRescanned: false,
      }),
    ).toBe(false);
  });
});

describe("sanitizeSessionForOpen", () => {
  it("always paints idle", () => {
    expect(sanitizeSessionForOpen({ status: "running", blocks: [] }).status).toBe("idle");
  });
});
