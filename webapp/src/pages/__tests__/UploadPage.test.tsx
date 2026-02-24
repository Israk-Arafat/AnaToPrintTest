import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UploadPage from "../UploadPage";
import * as DicomContextModule from "../../contexts/DicomContext";
import * as HooksModule from "../../hooks";
import type { DicomFileInfo } from "../../utils/dicomUtils";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockedUseNavigate } = vi.hoisted(() => ({
  mockedUseNavigate: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => mockedUseNavigate };
});

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

type DicomContextValue = ReturnType<typeof DicomContextModule.useDicomContext>;

const mockVtkImage = { type: "vtk-image" } as any;

const makeDicomFile = (name = "slice.dcm"): DicomFileInfo => ({
  file: new File(["dicom"], name),
  isDICOM: true,
  patientID: "P001",
  seriesInstanceID: "S001",
  studyInstanceID: "ST001",
  seriesDescription: "Head CT",
  patientName: "Doe^John",
  studyDate: "2025-01-01",
});

const buildContext = (
  overrides: Partial<DicomContextValue> = {},
): DicomContextValue => ({
  hasData: false,
  getVtkImage: () => null,
  fileInfo: [],
  setDicomData: vi.fn<DicomContextValue["setDicomData"]>(),
  clearDicomData: vi.fn<DicomContextValue["clearDicomData"]>(),
  ...overrides,
});

type UseDicomUploadReturn = ReturnType<typeof HooksModule.useDicomUpload>;

const idleUploadState: UseDicomUploadReturn = {
  isLoading: false,
  isComplete: false,
  error: null,
  progress: 0,
  statusMessage: "",
  vtkImage: null,
  fileInfo: [],
  seriesList: [],
  uploadDicomFiles: vi.fn<UseDicomUploadReturn["uploadDicomFiles"]>(),
  loadSeries: vi.fn<UseDicomUploadReturn["loadSeries"]>(),
  clearUpload: vi.fn<UseDicomUploadReturn["clearUpload"]>(),
};

const buildUploadHook = (
  overrides: Partial<typeof idleUploadState> = {},
): UseDicomUploadReturn => ({
  ...idleUploadState,
  uploadDicomFiles: vi.fn<UseDicomUploadReturn["uploadDicomFiles"]>(),
  loadSeries: vi.fn<UseDicomUploadReturn["loadSeries"]>(),
  clearUpload: vi.fn<UseDicomUploadReturn["clearUpload"]>(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>,
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UploadPage", () => {
  let mockSetDicomData: Mock<DicomContextValue["setDicomData"]>;
  let mockClearDicomData: Mock<DicomContextValue["clearDicomData"]>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDicomData = vi.fn<DicomContextValue["setDicomData"]>();
    mockClearDicomData = vi.fn<DicomContextValue["clearDicomData"]>();

    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({
        setDicomData: mockSetDicomData,
        clearDicomData: mockClearDicomData,
      }),
    );

    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(buildUploadHook());
  });

  // -------------------------------------------------------------------------
  // Initial / idle state
  // -------------------------------------------------------------------------

  it("renders the page heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /Upload DICOM Files/i }),
    ).toBeInTheDocument();
  });

  it("shows the drop zone prompt in idle state", () => {
    renderPage();
    expect(screen.getByText(/Drop DICOM folder here/i)).toBeInTheDocument();
    expect(screen.getByText(/or click to browse/i)).toBeInTheDocument();
  });

  it("does not show progress bar, success message, or error in idle state", () => {
    renderPage();
    expect(screen.queryByText(/complete/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Continue to 3D Preview/i }),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it("shows the progress bar and status message while loading", () => {
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isLoading: true,
        progress: 42,
        statusMessage: "Parsing DICOM files...",
      }),
    );
    renderPage();
    expect(screen.getByText(/Parsing DICOM files/i)).toBeInTheDocument();
    expect(screen.getByText(/42%/i)).toBeInTheDocument();
  });

  it("hides the drop zone prompt while loading", () => {
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isLoading: true,
        progress: 10,
        statusMessage: "Loading...",
      }),
    );
    renderPage();
    expect(
      screen.queryByText(/Drop DICOM folder here/i),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Complete state
  // -------------------------------------------------------------------------

  it("shows success message and file count after upload completes", () => {
    const dicomFile = makeDicomFile();
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isComplete: true,
        vtkImage: mockVtkImage,
        fileInfo: [dicomFile],
      }),
    );
    renderPage();
    expect(
      screen.getByText(/Successfully loaded 1 DICOM files/i),
    ).toBeInTheDocument();
  });

  it("displays patient name from first file info entry", () => {
    const dicomFile = makeDicomFile();
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isComplete: true,
        vtkImage: mockVtkImage,
        fileInfo: [dicomFile],
      }),
    );
    renderPage();
    expect(screen.getByText(/Doe\^John/i)).toBeInTheDocument();
  });

  it("shows 'Continue to 3D Preview' and 'Skip to Export' buttons when complete with a VTK image", () => {
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isComplete: true,
        vtkImage: mockVtkImage,
        fileInfo: [makeDicomFile()],
      }),
    );
    renderPage();
    expect(
      screen.getByRole("button", { name: /Continue to 3D Preview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Skip to Export/i }),
    ).toBeInTheDocument();
  });

  it("shows 'Select Different Folder' and 'Clear' buttons when complete", () => {
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isComplete: true,
        vtkImage: mockVtkImage,
        fileInfo: [makeDicomFile()],
      }),
    );
    renderPage();
    expect(
      screen.getByRole("button", { name: /Select Different Folder/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Clear$/i }),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Navigation from complete state
  // -------------------------------------------------------------------------

  it("'Continue to 3D Preview' calls setDicomData and navigates to /preview", () => {
    const dicomFile = makeDicomFile();
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isComplete: true,
        vtkImage: mockVtkImage,
        fileInfo: [dicomFile],
      }),
    );
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: /Continue to 3D Preview/i }),
    );
    expect(mockSetDicomData).toHaveBeenCalledWith(mockVtkImage, [dicomFile]);
    expect(mockedUseNavigate).toHaveBeenCalledWith("/preview");
  });

  it("'Skip to Export' calls setDicomData and navigates to /export", () => {
    const dicomFile = makeDicomFile();
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isComplete: true,
        vtkImage: mockVtkImage,
        fileInfo: [dicomFile],
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Skip to Export/i }));
    expect(mockSetDicomData).toHaveBeenCalledWith(mockVtkImage, [dicomFile]);
    expect(mockedUseNavigate).toHaveBeenCalledWith("/export");
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it("displays the error message when upload fails", () => {
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({ error: "No valid DICOM files found" }),
    );
    renderPage();
    expect(screen.getByText(/No valid DICOM files found/i)).toBeInTheDocument();
    expect(screen.getByText(/^Error$/i)).toBeInTheDocument();
  });

  it("does not show error block when error is null", () => {
    renderPage();
    expect(screen.queryByText(/^Error$/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Series selection state
  // -------------------------------------------------------------------------

  it("shows the series selection list when multiple series are returned", () => {
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isLoading: false,
        isComplete: false,
        seriesList: [
          {
            patientID: "P001",
            studyInstanceID: "ST001",
            seriesInstanceID: "S001",
            seriesDescription: "Head CT",
            numberOfSlices: 5,
            files: [makeDicomFile()],
          },
          {
            patientID: "P001",
            studyInstanceID: "ST001",
            seriesInstanceID: "S002",
            seriesDescription: "Chest CT",
            numberOfSlices: 3,
            files: [makeDicomFile("b.dcm")],
          },
        ],
      }),
    );
    renderPage();
    expect(screen.getByText(/Select a Series/i)).toBeInTheDocument();
    expect(screen.getByText(/Head CT/i)).toBeInTheDocument();
    expect(screen.getByText(/Chest CT/i)).toBeInTheDocument();
  });

  it("clicking a series entry calls loadSeries with that series's files", () => {
    const mockLoadSeries = vi.fn();
    const dicomFile = makeDicomFile();
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        loadSeries: mockLoadSeries,
        seriesList: [
          {
            patientID: "P001",
            studyInstanceID: "ST001",
            seriesInstanceID: "S001",
            seriesDescription: "Head CT",
            numberOfSlices: 1,
            files: [dicomFile],
          },
        ],
      }),
    );
    renderPage();
    fireEvent.click(screen.getByText(/Head CT/i));
    expect(mockLoadSeries).toHaveBeenCalledWith([dicomFile]);
  });

  // -------------------------------------------------------------------------
  // Context data takes precedence
  // -------------------------------------------------------------------------

  it("treats the page as complete when hasData is true in context", () => {
    const dicomFile = makeDicomFile();
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({
        hasData: true,
        getVtkImage: () => mockVtkImage,
        fileInfo: [dicomFile],
        setDicomData: mockSetDicomData,
        clearDicomData: mockClearDicomData,
      }),
    );
    renderPage();
    expect(
      screen.getByText(/Successfully loaded 1 DICOM files/i),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Clear action
  // -------------------------------------------------------------------------

  it("clicking 'Clear' calls clearUpload and clearDicomData", () => {
    const mockClearUpload = vi.fn();
    vi.spyOn(HooksModule, "useDicomUpload").mockReturnValue(
      buildUploadHook({
        isComplete: true,
        vtkImage: mockVtkImage,
        fileInfo: [makeDicomFile()],
        clearUpload: mockClearUpload,
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Clear$/i }));
    expect(mockClearUpload).toHaveBeenCalled();
    expect(mockClearDicomData).toHaveBeenCalled();
  });
});
