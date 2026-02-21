import { useEffect } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PreviewPage from "../PreviewPage";
import * as DicomContextModule from "../../contexts/DicomContext";
import type { DicomFileInfo } from "../../utils/dicomUtils";

const mockedUseNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return {
    ...actual,
    useNavigate: () => mockedUseNavigate,
  };
});

vi.mock("../../components/Viewer3D", () => ({
  default: ({ onReady }: { onReady?: () => void }) => {
    useEffect(() => {
      onReady?.();
    }, [onReady]);

    return <div data-testid="viewer-3d">Mock Viewer3D</div>;
  },
}));

type DicomContextValue = ReturnType<typeof DicomContextModule.useDicomContext>;

const buildContext = (
  overrides: Partial<DicomContextValue> = {},
): DicomContextValue => ({
  hasData: true,
  getVtkImage: () => ({}) as any,
  fileInfo: [
    {
      file: new File(["dicom"], "scan-1.dcm", {
        type: "application/dicom",
      }),
      isDICOM: true,
      patientName: "Jane Doe",
      seriesDescription: "CT Head",
      studyDate: "20260221",
    } as DicomFileInfo,
  ],
  setDicomData: vi.fn(),
  clearDicomData: vi.fn(),
  ...overrides,
});

describe("PreviewPage", () => {
  beforeEach(() => {
    mockedUseNavigate.mockReset();
    vi.restoreAllMocks();
  });

  it("shows upload guard when there is no data", () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({
        hasData: false,
        getVtkImage: () => null,
        fileInfo: [],
      }),
    );

    render(
      <MemoryRouter>
        <PreviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("No file loaded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Go to Upload/i }));
    expect(mockedUseNavigate).toHaveBeenCalledWith("/");
  });

  it("shows image-data guard when vtk image is missing", () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext({ getVtkImage: () => null }),
    );

    render(
      <MemoryRouter>
        <PreviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("No image data")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Go to Upload/i }));
    expect(mockedUseNavigate).toHaveBeenCalledWith("/");
  });

  it("renders preview content and file info when data exists", () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext(),
    );

    render(
      <MemoryRouter>
        <PreviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("viewer-3d")).toBeInTheDocument();
    expect(screen.getByText("Interactive")).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/i)).toBeInTheDocument();
    expect(screen.getByText(/CT Head/i)).toBeInTheDocument();
    expect(screen.getByText(/20260221/i)).toBeInTheDocument();
  });

  it("updates HU threshold when tissue type changes", () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext(),
    );

    render(
      <MemoryRouter>
        <PreviewPage />
      </MemoryRouter>,
    );

    const numberInput = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(numberInput.value).toBe("300");

    fireEvent.click(screen.getByRole("radio", { name: /skin/i }));
    expect(numberInput.value).toBe("-200");

    fireEvent.click(screen.getByRole("radio", { name: /muscle/i }));
    expect(numberInput.value).toBe("40");
  });

  it("navigates with Back and Next buttons", () => {
    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue(
      buildContext(),
    );

    render(
      <MemoryRouter>
        <PreviewPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next: Export/i }));

    expect(mockedUseNavigate).toHaveBeenCalledWith("/");
    expect(mockedUseNavigate).toHaveBeenCalledWith("/export");
  });
});
