import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PreviewPage from "../PreviewPage";
import ExportPage from "../ExportPage";
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

describe("Route guards for missing DICOM data", () => {
  beforeEach(() => {
    mockedUseNavigate.mockReset();

    vi.spyOn(DicomContextModule, "useDicomContext").mockReturnValue({
      hasData: false,
      getVtkImage: () => null,
      fileInfo: [] as DicomFileInfo[],
      setDicomData: vi.fn(),
      clearDicomData: vi.fn(),
    });
  });

  it("PreviewPage shows no-data message when hasData is false", () => {
    render(
      <MemoryRouter>
        <PreviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("No file loaded")).toBeInTheDocument();
    expect(
      screen.getByText("Please upload a CT scan before previewing a 3D model."),
    ).toBeInTheDocument();
  });

  it("PreviewPage navigates to upload when Go to Upload is clicked", () => {
    render(
      <MemoryRouter>
        <PreviewPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Go to Upload/i }));

    expect(mockedUseNavigate).toHaveBeenCalledWith("/");
  });

  it("ExportPage shows no-data message when hasData is false", () => {
    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("No file loaded")).toBeInTheDocument();
    expect(
      screen.getByText("Please upload a CT scan before exporting a 3D model."),
    ).toBeInTheDocument();
  });

  it("ExportPage navigates to upload when Go to Upload is clicked", () => {
    render(
      <MemoryRouter>
        <ExportPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Go to Upload/i }));

    expect(mockedUseNavigate).toHaveBeenCalledWith("/");
  });
});
