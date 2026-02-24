import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SettingsPage from "../SettingsPage";
import * as HooksModule from "../../hooks";
import { DEFAULT_SETTINGS } from "../../utils/storage";
import type { AppSettings } from "../../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type UseAppSettingsReturn = ReturnType<typeof HooksModule.useAppSettings>;

const mockUpdateSettings = vi.fn();

const buildHook = (
  overrides: Partial<AppSettings> = {},
): UseAppSettingsReturn => ({
  settings: { ...DEFAULT_SETTINGS, ...overrides },
  updateSettings: mockUpdateSettings,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HooksModule, "useAppSettings").mockReturnValue(buildHook());
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  // -------------------------------------------------------------------------
  // Static content
  // -------------------------------------------------------------------------

  it("renders the page heading", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: /Help & Settings/i }),
    ).toBeInTheDocument();
  });

  it("renders the Quick Start Guide section", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: /Quick Start Guide/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Upload DICOM/i)).toBeInTheDocument();
    expect(screen.getByText(/Select Tissue/i)).toBeInTheDocument();
    expect(screen.getByText(/Preview Model/i)).toBeInTheDocument();
    expect(screen.getByText(/Export File/i)).toBeInTheDocument();
  });

  it("renders the Supported Formats section", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: /Supported Formats/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/DICOM files \(\.dcm\)/i)).toBeInTheDocument();
    expect(screen.getByText(/STL \(\.stl\)/i)).toBeInTheDocument();
  });

  it("renders the About section with version number", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: /^About$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Version 1\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/University of Maine/i)).toBeInTheDocument();
  });

  it("renders the Save Settings button", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("button", { name: /Save Settings/i }),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Display Settings controls
  // -------------------------------------------------------------------------

  it("renders the render quality select with the current value", () => {
    vi.spyOn(HooksModule, "useAppSettings").mockReturnValue(
      buildHook({ renderQuality: "high" }),
    );
    render(<SettingsPage />);
    const select = screen.getByLabelText(
      /Render Quality/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("high");
  });

  it("renders the background color select with the current value", () => {
    vi.spyOn(HooksModule, "useAppSettings").mockReturnValue(
      buildHook({ backgroundColor: "white" }),
    );
    render(<SettingsPage />);
    const select = screen.getByLabelText(
      /Background Color/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("white");
  });

  it("calls updateSettings with new backgroundColor when select changes", () => {
    render(<SettingsPage />);
    const select = screen.getByLabelText(/Background Color/i);
    fireEvent.change(select, { target: { value: "white" } });
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      backgroundColor: "white",
    });
  });

  it("calls updateSettings with new renderQuality when select changes", () => {
    render(<SettingsPage />);
    const select = screen.getByLabelText(/Render Quality/i);
    fireEvent.change(select, { target: { value: "high" } });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ renderQuality: "high" });
  });

  // -------------------------------------------------------------------------
  // Disabled checkboxes
  // -------------------------------------------------------------------------

  it("renders the Show Grid checkbox as disabled", () => {
    render(<SettingsPage />);
    const checkbox = screen.getByRole("checkbox", { name: /Show Grid/i });
    expect(checkbox).toBeDisabled();
  });

  it("Show Grid checkbox reflects the settings value", () => {
    vi.spyOn(HooksModule, "useAppSettings").mockReturnValue(
      buildHook({ showGrid: true }),
    );
    render(<SettingsPage />);
    const checkbox = screen.getByRole("checkbox", {
      name: /Show Grid/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("renders the Auto-optimize checkbox as disabled", () => {
    render(<SettingsPage />);
    const checkbox = screen.getByRole("checkbox", {
      name: /Auto-optimize meshes/i,
    });
    expect(checkbox).toBeDisabled();
  });

  it("Auto-optimize checkbox reflects the settings value", () => {
    vi.spyOn(HooksModule, "useAppSettings").mockReturnValue(
      buildHook({ autoOptimize: false }),
    );
    render(<SettingsPage />);
    const checkbox = screen.getByRole("checkbox", {
      name: /Auto-optimize meshes/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Save button
  // -------------------------------------------------------------------------

  it("clicking Save Settings shows an alert", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }));
    expect(window.alert).toHaveBeenCalledWith("Settings saved successfully!");
  });
});
