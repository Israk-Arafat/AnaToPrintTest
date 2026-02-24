import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDicomUpload } from "../useDicomUpload";
import type { DicomFileInfo } from "../../utils/dicomUtils";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockParseDicomFiles = vi.fn();
const mockLoadDicomImageSeries = vi.fn();
const mockGroupDicomFiles = vi.fn();
const mockConvertItkToVtkImage = vi.fn();

vi.mock("../../utils/dicomUtils", () => ({
  parseDicomFiles: (...args: unknown[]) => mockParseDicomFiles(...args),
  loadDicomImageSeries: (...args: unknown[]) =>
    mockLoadDicomImageSeries(...args),
  groupDicomFiles: (...args: unknown[]) => mockGroupDicomFiles(...args),
}));

vi.mock("@kitware/vtk.js/Common/DataModel/ITKHelper", () => ({
  convertItkToVtkImage: (...args: unknown[]) =>
    mockConvertItkToVtkImage(...args),
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const makeDicomFile = (name = "slice.dcm"): DicomFileInfo => ({
  file: new File(["dicom"], name, { type: "application/dicom" }),
  isDICOM: true,
  patientID: "P001",
  seriesInstanceID: "S001",
  studyInstanceID: "ST001",
  seriesDescription: "Head CT",
});

const mockItkImage = { type: "itk-image" } as any;
const mockVtkImage = { type: "vtk-image" } as any;

/** Build the nested Map structure returned by groupDicomFiles */
function buildGroupMap(
  series: DicomFileInfo[][],
): Map<string, Map<string, Map<string, DicomFileInfo[]>>> {
  const patientMap = new Map<
    string,
    Map<string, Map<string, DicomFileInfo[]>>
  >();
  const studyMap = new Map<string, Map<string, DicomFileInfo[]>>();
  const seriesMap = new Map<string, DicomFileInfo[]>();

  series.forEach((s, i) => {
    seriesMap.set(`series-${i}`, s);
  });

  studyMap.set("study-0", seriesMap);
  patientMap.set("patient-0", studyMap);
  return patientMap;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useDicomUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConvertItkToVtkImage.mockReturnValue(mockVtkImage);
    mockLoadDicomImageSeries.mockResolvedValue(mockItkImage);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it("starts with a clean, idle state", () => {
    const { result } = renderHook(() => useDicomUpload());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBe(0);
    expect(result.current.statusMessage).toBe("");
    expect(result.current.vtkImage).toBeNull();
    expect(result.current.fileInfo).toEqual([]);
    expect(result.current.seriesList).toEqual([]);
  });

  it("exposes uploadDicomFiles, loadSeries, and clearUpload functions", () => {
    const { result } = renderHook(() => useDicomUpload());
    expect(typeof result.current.uploadDicomFiles).toBe("function");
    expect(typeof result.current.loadSeries).toBe("function");
    expect(typeof result.current.clearUpload).toBe("function");
  });

  // -------------------------------------------------------------------------
  // uploadDicomFiles — no valid DICOM files
  // -------------------------------------------------------------------------

  it("sets error when no valid DICOM files are found", async () => {
    const nonDicomFile: DicomFileInfo = {
      file: new File(["txt"], "readme.txt"),
      isDICOM: false,
    };
    mockParseDicomFiles.mockResolvedValue([nonDicomFile]);

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([nonDicomFile.file]);
    });

    expect(result.current.error).toBe("No valid DICOM files found");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.vtkImage).toBeNull();
  });

  it("resets state to loading at the start of uploadDicomFiles", async () => {
    // Delay parseDicomFiles so we can observe interim state
    let resolve!: (v: DicomFileInfo[]) => void;
    mockParseDicomFiles.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useDicomUpload());

    act(() => {
      void result.current.uploadDicomFiles([new File(["d"], "s.dcm")]);
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.error).toBeNull();

    // Clean up
    resolve([]);
  });

  // -------------------------------------------------------------------------
  // uploadDicomFiles — single series (auto-load)
  // -------------------------------------------------------------------------

  it("auto-loads a single series and reaches complete state", async () => {
    const dicomFile = makeDicomFile();
    mockParseDicomFiles.mockResolvedValue([dicomFile]);
    mockGroupDicomFiles.mockReturnValue(buildGroupMap([[dicomFile]]));

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([dicomFile.file]);
    });

    expect(result.current.isComplete).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.vtkImage).toBe(mockVtkImage);
    expect(result.current.progress).toBe(100);
    expect(result.current.statusMessage).toBe("Upload complete");
  });

  it("stores fileInfo after a successful single-series upload", async () => {
    const dicomFile = makeDicomFile();
    mockParseDicomFiles.mockResolvedValue([dicomFile]);
    mockGroupDicomFiles.mockReturnValue(buildGroupMap([[dicomFile]]));

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([dicomFile.file]);
    });

    expect(result.current.fileInfo).toEqual([dicomFile]);
  });

  it("calls convertItkToVtkImage with the image returned by loadDicomImageSeries", async () => {
    const dicomFile = makeDicomFile();
    mockParseDicomFiles.mockResolvedValue([dicomFile]);
    mockGroupDicomFiles.mockReturnValue(buildGroupMap([[dicomFile]]));

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([dicomFile.file]);
    });

    expect(mockConvertItkToVtkImage).toHaveBeenCalledWith(mockItkImage);
  });

  // -------------------------------------------------------------------------
  // uploadDicomFiles — multiple series (user selection)
  // -------------------------------------------------------------------------

  it("populates seriesList and stops loading when multiple series are found", async () => {
    const fileA = makeDicomFile("a.dcm");
    const fileB = { ...makeDicomFile("b.dcm"), seriesInstanceID: "S002" };
    mockParseDicomFiles.mockResolvedValue([fileA, fileB]);
    mockGroupDicomFiles.mockReturnValue(buildGroupMap([[fileA], [fileB]]));

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([fileA.file, fileB.file]);
    });

    expect(result.current.seriesList).toHaveLength(2);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.vtkImage).toBeNull();
    expect(result.current.statusMessage).toBe("Please select a series");
  });

  // -------------------------------------------------------------------------
  // uploadDicomFiles — parseDicomFiles throws
  // -------------------------------------------------------------------------

  it("sets error state when parseDicomFiles rejects", async () => {
    mockParseDicomFiles.mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([new File(["d"], "s.dcm")]);
    });

    expect(result.current.error).toBe("Network failure");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });

  it("sets a generic error message when the thrown value is not an Error instance", async () => {
    mockParseDicomFiles.mockRejectedValue("string error");

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([new File(["d"], "s.dcm")]);
    });

    expect(result.current.error).toBe("Failed to load DICOM files");
  });

  it("resets vtkImage and fileInfo on upload error", async () => {
    mockParseDicomFiles.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([new File(["d"], "s.dcm")]);
    });

    expect(result.current.vtkImage).toBeNull();
    expect(result.current.fileInfo).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // loadSeries
  // -------------------------------------------------------------------------

  it("loadSeries reaches complete state and stores vtkImage", async () => {
    const dicomFile = makeDicomFile();

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.loadSeries([dicomFile]);
    });

    expect(result.current.isComplete).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.vtkImage).toBe(mockVtkImage);
    expect(result.current.progress).toBe(100);
  });

  it("loadSeries sets error state when loadDicomImageSeries rejects", async () => {
    mockLoadDicomImageSeries.mockRejectedValue(new Error("ITK load failed"));
    const dicomFile = makeDicomFile();

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.loadSeries([dicomFile]);
    });

    expect(result.current.error).toBe("ITK load failed");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });

  it("loadSeries clears seriesList on start", async () => {
    // First populate seriesList via a multi-series upload
    const fileA = makeDicomFile("a.dcm");
    const fileB = { ...makeDicomFile("b.dcm"), seriesInstanceID: "S002" };
    mockParseDicomFiles.mockResolvedValue([fileA, fileB]);
    mockGroupDicomFiles.mockReturnValue(buildGroupMap([[fileA], [fileB]]));

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([fileA.file, fileB.file]);
    });

    expect(result.current.seriesList).toHaveLength(2);

    // Now load one series — seriesList should be cleared
    await act(async () => {
      await result.current.loadSeries([fileA]);
    });

    expect(result.current.seriesList).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // clearUpload
  // -------------------------------------------------------------------------

  it("clearUpload resets state to the initial idle values", async () => {
    const dicomFile = makeDicomFile();
    mockParseDicomFiles.mockResolvedValue([dicomFile]);
    mockGroupDicomFiles.mockReturnValue(buildGroupMap([[dicomFile]]));

    const { result } = renderHook(() => useDicomUpload());

    await act(async () => {
      await result.current.uploadDicomFiles([dicomFile.file]);
    });

    expect(result.current.isComplete).toBe(true);

    act(() => {
      result.current.clearUpload();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBe(0);
    expect(result.current.statusMessage).toBe("");
    expect(result.current.vtkImage).toBeNull();
    expect(result.current.fileInfo).toEqual([]);
    expect(result.current.seriesList).toEqual([]);
  });
});
