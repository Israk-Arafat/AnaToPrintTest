import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ExportPage from "../ExportPage";
import * as DicomContextModule from "../../contexts/DicomContext";
import type { DicomFileInfo } from "../../utils/dicomUtils";

const { mockedUseNavigate, mockedExportToSTL } = vi.hoisted(() => ({
  mockedUseNavigate: vi.fn(),
  mockedExportToSTL: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return {
    ...actual,
    useNavigate: () => mockedUseNavigate,
  };
});

vi.mock("../../utils", () => ({
  exportToSTL: mockedExportToSTL,
  HU_THRESHOLDS: {
    HIGH_DENSITY: 300,
    MEDIUM_DENSITY: 40,
    LOW_DENSITY: -50,
  },
}));

type DicomContextValue = ReturnType<typeof DicomContextModule.useDicomContext>;

const buildContext = (
  overrides: Partial<DicomContextValue> = {},
): DicomContextValue => ({
  hasData: true,
  getVtkImage: () => ({}) as DicomContextValue extends {
    getVtkImage: () => infer T;
  }
    ? Exclude<T, null>
    : never,
  fileInfo: [] as DicomFileInfo[],
  setDicomData: vi.fn(),
  clearDicomData: vi.fn(),
  ...overrides,
});

describe("ExportPage", () => {
  beforeEach(() => {
    mockedUseNavigate.mockReset();
    mockedExportToSTL.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});

    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext(),
    );

    mockedExportToSTL.mockResolvedValue(undefined);
  });

  it("shows upload guard when no DICOM data exists", () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({ hasData: false }),
    );

    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("No file loaded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Go to Upload/i }));
    expect(mockedUseNavigate).toHaveBeenCalledWith("/");
  });

  it("navigates to upload when Cancel is clicked", () => {
    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(mockedUseNavigate).toHaveBeenCalledWith("/");
  });

  it("alerts when filename is blank and does not export", async () => {
    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Output Filename/i), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith("Please enter a filename");
    });
    expect(mockedExportToSTL).not.toHaveBeenCalled();
  });

  it("alerts and redirects when image data is unavailable", async () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({ getVtkImage: () => null }),
    );

    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        "No DICOM data loaded. Please upload files first.",
      );
    });
    expect(mockedUseNavigate).toHaveBeenCalledWith("/");
    expect(mockedExportToSTL).not.toHaveBeenCalled();
  });

  it("exports with preset threshold and updates progress stage", async () => {
    mockedExportToSTL.mockImplementation(
      async (
        _image,
        _filename,
        _threshold,
        _smoothing,
        onProgress?: (
          stage: "marching-cubes" | "smoothing" | "writing" | "complete",
          metrics: {
            marchingCubesTime?: number;
            smoothingTime?: number;
            writingTime?: number;
            totalTime?: number;
            polygonCount?: number;
          },
        ) => void,
      ) => {
        onProgress?.("marching-cubes", { polygonCount: 1234 });
        onProgress?.("complete", { totalTime: 99 });
      },
    );

    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await waitFor(() => {
      expect(mockedExportToSTL).toHaveBeenCalledTimes(1);
    });

    const [vtkImage, filename, thresholdValue, smoothingEnabled] =
      mockedExportToSTL.mock.calls[0];

    expect(vtkImage).toBeTruthy();
    expect(filename).toBe("ct_scan_bone_model");
    expect(thresholdValue).toBe("HIGH_DENSITY");
    expect(smoothingEnabled).toBe(true);
    expect(screen.getByText("Export complete!")).toBeInTheDocument();
  });

  it("exports with clamped custom threshold and smoothing disabled", async () => {
    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Custom/i }));

    const customInput = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(customInput, { target: { value: "3500" } });

    const smoothingCheckbox = screen.getByRole("checkbox", {
      name: /Apply Smoothing/i,
    });
    fireEvent.click(smoothingCheckbox);

    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await waitFor(() => {
      expect(mockedExportToSTL).toHaveBeenCalledTimes(1);
    });

    const [, , thresholdValue, smoothingEnabled] = mockedExportToSTL.mock.calls[0];
    expect(thresholdValue).toBe(3000);
    expect(smoothingEnabled).toBe(false);
  });
});
