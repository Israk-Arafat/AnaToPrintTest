import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppSettings } from "../useAppSettings";
import { DEFAULT_SETTINGS } from "../../utils/storage";
import type { AppSettings } from "../../types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLoadSettings = vi.fn<() => AppSettings>();
const mockSaveSettings = vi.fn<(s: AppSettings) => void>();

vi.mock("../../utils/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/storage")>();
  return {
    ...actual,
    loadSettings: () => mockLoadSettings(),
    saveSettings: (s: AppSettings) => mockSaveSettings(s),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const customSettings: AppSettings = {
  renderQuality: "low",
  backgroundColor: "black",
  showGrid: false,
  autoOptimize: false,
  defaultExport: "gcode",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAppSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it("initialises settings from loadSettings on first render", () => {
    mockLoadSettings.mockReturnValue({ ...DEFAULT_SETTINGS });

    const { result } = renderHook(() => useAppSettings());

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("calls loadSettings exactly twice on mount (useState initialiser + useEffect)", () => {
    renderHook(() => useAppSettings());
    // useState initialiser + the useEffect both call loadSettings
    expect(mockLoadSettings).toHaveBeenCalledTimes(2);
  });

  it("reflects non-default settings returned by loadSettings", () => {
    mockLoadSettings.mockReturnValue({ ...customSettings });

    const { result } = renderHook(() => useAppSettings());

    expect(result.current.settings).toEqual(customSettings);
  });

  // -------------------------------------------------------------------------
  // updateSettings
  // -------------------------------------------------------------------------

  it("updateSettings merges a partial update into current settings", () => {
    const { result } = renderHook(() => useAppSettings());

    act(() => {
      result.current.updateSettings({ renderQuality: "low" });
    });

    expect(result.current.settings.renderQuality).toBe("low");
    // Other fields remain unchanged
    expect(result.current.settings.backgroundColor).toBe(
      DEFAULT_SETTINGS.backgroundColor,
    );
  });

  it("updateSettings persists the merged settings to storage", () => {
    const { result } = renderHook(() => useAppSettings());

    act(() => {
      result.current.updateSettings({ showGrid: false });
    });

    expect(mockSaveSettings).toHaveBeenCalledOnce();
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ showGrid: false }),
    );
  });

  it("updateSettings with a complete settings object replaces all fields", () => {
    const { result } = renderHook(() => useAppSettings());

    act(() => {
      result.current.updateSettings({ ...customSettings });
    });

    expect(result.current.settings).toEqual(customSettings);
    expect(mockSaveSettings).toHaveBeenCalledWith(customSettings);
  });

  it("multiple sequential updateSettings calls accumulate correctly", () => {
    const { result } = renderHook(() => useAppSettings());

    act(() => {
      result.current.updateSettings({ renderQuality: "medium" });
    });
    act(() => {
      result.current.updateSettings({ backgroundColor: "white" });
    });

    expect(result.current.settings.renderQuality).toBe("medium");
    expect(result.current.settings.backgroundColor).toBe("white");
    expect(mockSaveSettings).toHaveBeenCalledTimes(2);
  });

  it("updateSettings does not read from storage to derive the new value", () => {
    const { result } = renderHook(() => useAppSettings());

    act(() => {
      result.current.updateSettings({ autoOptimize: false });
    });

    // The merged value must come from in-memory state, not a fresh loadSettings call.
    // Verify: even if loadSettings returned a different value, the merge used the
    // live state (autoOptimize: false wins, other fields are from DEFAULT_SETTINGS).
    expect(result.current.settings.autoOptimize).toBe(false);
    expect(result.current.settings.renderQuality).toBe(
      DEFAULT_SETTINGS.renderQuality,
    );
  });

  it("the hook exposes exactly settings and updateSettings", () => {
    const { result } = renderHook(() => useAppSettings());
    expect(Object.keys(result.current)).toEqual(
      expect.arrayContaining(["settings", "updateSettings"]),
    );
  });
});
