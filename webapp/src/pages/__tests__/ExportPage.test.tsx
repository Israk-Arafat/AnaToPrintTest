import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ExportPage from "../ExportPage";
import * as DicomContextModule from "../../contexts/DicomContext";
import type { DicomFileInfo } from "../../utils/dicomUtils";

//Mocks

const {
  mockedUseNavigate,
  mockedExportToSTL,
  mockedConvertDicomSeriesToPng,
  mockedDownloadOrganizedPngs,
} = vi.hoisted(() => ({
  mockedUseNavigate: vi.fn(),
  mockedExportToSTL: vi.fn(),
  mockedConvertDicomSeriesToPng: vi.fn(),
  mockedDownloadOrganizedPngs: vi.fn(),
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

vi.mock("../../utils/dicomToPng", () => ({
  convertDicomSeriesToPng: mockedConvertDicomSeriesToPng,
  downloadOrganizedPngs: mockedDownloadOrganizedPngs,
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

//Tests

describe("ExportPage", () => {
  const baseFileInfo = [
    {
      file: new File([new ArrayBuffer(8)], "slice1.dcm", {
        type: "application/dicom",
      }),
      isDICOM: true,
      patientID: "P001",
      seriesInstanceID: "SERIES-1",
      studyInstanceID: "STUDY-1",
    },
  ] as DicomFileInfo[];

  beforeEach(() => {
    vi.useRealTimers();
    mockedUseNavigate.mockReset();
    mockedExportToSTL.mockReset();
    mockedConvertDicomSeriesToPng.mockReset();
    mockedDownloadOrganizedPngs.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});

    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext(),
    );

    mockedExportToSTL.mockResolvedValue(undefined);
    mockedConvertDicomSeriesToPng.mockResolvedValue({
      resultsBySeries: new Map(),
      grouped: new Map(),
    });
    mockedDownloadOrganizedPngs.mockResolvedValue(undefined);
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

  it("exports gcode by converting series and downloading organized zip", async () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({ fileInfo: baseFileInfo }),
    );

    mockedConvertDicomSeriesToPng.mockImplementation(async (_files, options) => {
      options?.progressCallback?.({
        lengthComputable: true,
        loaded: 1,
        total: 1,
      });
      return {
        resultsBySeries: new Map([
          [
            "P001_STUDY-1_SERIES-1",
            [
              {
                file: baseFileInfo[0].file,
                pngBlob: new Blob(),
                pngDataUrl: "data:image/png;base64,mock",
              },
            ],
          ],
        ]),
        grouped: new Map(),
      };
    });

    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /G-code/i }));
    fireEvent.change(screen.getByLabelText(/Output Filename/i), {
      target: { value: "my_export" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await waitFor(() => {
      expect(mockedConvertDicomSeriesToPng).toHaveBeenCalledTimes(1);
      expect(mockedDownloadOrganizedPngs).toHaveBeenCalledTimes(1);
    });

    expect(mockedDownloadOrganizedPngs).toHaveBeenCalledWith(
      expect.any(Map),
      "my_export.zip",
    );
    expect(screen.getByText("Export complete!")).toBeInTheDocument();
  });

  it("alerts and aborts gcode export when no original files are available", async () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({ fileInfo: [] }),
    );

    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /G-code/i }));
    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        "No original DICOM files available for PNG export.",
      );
    });
    expect(mockedConvertDicomSeriesToPng).not.toHaveBeenCalled();
    expect(mockedDownloadOrganizedPngs).not.toHaveBeenCalled();
  });

  it("alerts and aborts gcode export when fileInfo is undefined", async () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({ fileInfo: undefined as unknown as DicomFileInfo[] }),
    );

    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /G-code/i }));
    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        "No original DICOM files available for PNG export.",
      );
    });
    expect(mockedConvertDicomSeriesToPng).not.toHaveBeenCalled();
    expect(mockedDownloadOrganizedPngs).not.toHaveBeenCalled();
  });

  it("handles gcode conversion failures and resets exporting state", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({ fileInfo: baseFileInfo }),
    );
    mockedConvertDicomSeriesToPng.mockRejectedValue(new Error("png conversion failed"));

    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /G-code/i }));
    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        "Failed to generate PNG zip for G-code export.",
      );
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "G-code export error:",
      expect.any(Error),
    );
    expect(screen.queryByText("Exporting PNG Images")).not.toBeInTheDocument();
  });

  it("keeps generic writing label when gcode progress event is incomplete", async () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({ fileInfo: baseFileInfo }),
    );

const conversionRef: { resolve: ((value: any) => void) | null } = { resolve: null };

mockedConvertDicomSeriesToPng.mockImplementation(
  (_files, options?: { progressCallback?: (evt: any) => void }) =>
    new Promise((resolve) => {
      conversionRef.resolve = resolve;
      options?.progressCallback?.({ loaded: 1 });
    }),
);


    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /G-code/i }));
    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    expect(await screen.findByText("Converting DICOM slices...")).toBeInTheDocument();
    expect(screen.queryByText(/Converting DICOM slices... \(1\//i)).not.toBeInTheDocument();
    expect(conversionRef.resolve).not.toBeNull();
    conversionRef.resolve!({ resultsBySeries: new Map(), grouped: new Map() });

    await waitFor(() => {
      expect(mockedDownloadOrganizedPngs).toHaveBeenCalled();
    });
  });

  it("executes scheduled auto-close callback after successful gcode export", async () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({ fileInfo: baseFileInfo }),
    );

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    mockedConvertDicomSeriesToPng.mockResolvedValue({
      resultsBySeries: new Map(),
      grouped: new Map(),
    });

    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /G-code/i }));
    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedDownloadOrganizedPngs).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1200);

    const closeCallback = setTimeoutSpy.mock.calls[0]?.[0];
    if (typeof closeCallback === "function") {
      closeCallback();
    }

    await waitFor(() => {
      expect(screen.queryByText("Exporting PNG Images")).not.toBeInTheDocument();
    });
  });

  it("can toggle export format from gcode back to stl", () => {
    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /G-code/i }));
    expect(screen.queryByText(/Tissue Threshold \(HU\)/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /STL File/i }));
    expect(screen.getByText(/Tissue Threshold \(HU\)/i)).toBeInTheDocument();
  });

  it("updates summary when selecting a different preset threshold", () => {
    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: /Medium Density \(Muscle\/Organs\/Brain\)/i }),
    );

    expect(
      screen.getByText(/Medium Density \(Muscle\/Organs\/Brain\) \(40 HU\)/i),
    ).toBeInTheDocument();
  });

  it("handles STL export failures and shows generic error alert", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedExportToSTL.mockRejectedValue(new Error("stl failed"));

    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate & Download/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith("Export failed. Please try again.");
    });
    expect(errorSpy).toHaveBeenCalledWith("Export error:", expect.any(Error));
    expect(screen.queryByText("Processing 3D Model")).not.toBeInTheDocument();
  });
});
