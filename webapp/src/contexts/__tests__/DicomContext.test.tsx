import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DicomProvider, useDicomContext } from "../DicomContext";
import type { DicomFileInfo } from "../../utils/dicomUtils";

const mockVtkImage = { id: "vtk-image" } as any;

const mockFileInfo: DicomFileInfo[] = [
  {
    file: new File(["dicom"], "slice1.dcm", { type: "application/dicom" }),
    isDICOM: true,
    patientID: "P001",
    seriesInstanceID: "S001",
  },
];

function ContextHarness() {
  const { hasData, fileInfo, getVtkImage, setDicomData, clearDicomData } =
    useDicomContext();

  return (
    <div>
      <div data-testid="has-data">{String(hasData)}</div>
      <div data-testid="file-count">{fileInfo.length}</div>
      <div data-testid="has-image">{String(getVtkImage() !== null)}</div>

      <button onClick={() => setDicomData(mockVtkImage, mockFileInfo)}>
        set-data
      </button>
      <button onClick={clearDicomData}>clear-data</button>
    </div>
  );
}

describe("DicomContext", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with empty default state", () => {
    render(
      <DicomProvider>
        <ContextHarness />
      </DicomProvider>,
    );

    expect(screen.getByTestId("has-data")).toHaveTextContent("false");
    expect(screen.getByTestId("file-count")).toHaveTextContent("0");
    expect(screen.getByTestId("has-image")).toHaveTextContent("false");
  });

  it("setDicomData stores image and file info and marks hasData true", () => {
    render(
      <DicomProvider>
        <ContextHarness />
      </DicomProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "set-data" }));

    expect(screen.getByTestId("has-data")).toHaveTextContent("true");
    expect(screen.getByTestId("file-count")).toHaveTextContent("1");
    expect(screen.getByTestId("has-image")).toHaveTextContent("true");
  });

  it("clearDicomData resets image, file info, and hasData", () => {
    render(
      <DicomProvider>
        <ContextHarness />
      </DicomProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "set-data" }));
    fireEvent.click(screen.getByRole("button", { name: "clear-data" }));

    expect(screen.getByTestId("has-data")).toHaveTextContent("false");
    expect(screen.getByTestId("file-count")).toHaveTextContent("0");
    expect(screen.getByTestId("has-image")).toHaveTextContent("false");
  });

  it("throws when useDicomContext is used outside DicomProvider", () => {
    function ConsumerWithoutProvider() {
      useDicomContext();
      return null;
    }

    expect(() => render(<ConsumerWithoutProvider />)).toThrow(
      "useDicomContext must be used within a DicomProvider",
    );
  });
});
