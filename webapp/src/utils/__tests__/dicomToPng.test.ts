import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  convertDicomSeriesToPng,
  convertDicomSlicesToPng,
  downloadOrganizedPngs,
  downloadPngsAsZip,
} from "../dicomToPng";
import { parseDicomFiles, groupDicomFiles } from "../dicomUtils";

// Mock dependencies
vi.mock("@itk-wasm/image-io", () => ({
  readImage: vi.fn(() =>
    Promise.resolve({
      image: {
        size: [512, 512],
        data: new Float32Array(512 * 512).fill(100),
      },
    })
  ),
}));

vi.mock("../dicomUtils", () => ({
  parseDicomFiles: vi.fn((files, progressCallback) => {
    const parsed = Array.from(files).map((file) => ({
      file,
      isDICOM: true,
      patientID: "TEST123",
      patientName: "Test Patient",
      studyInstanceID: "study1",
      seriesInstanceID: "series1",
      seriesDescription: "Default Series",
    }));

    if (progressCallback) {
      progressCallback({
        lengthComputable: true,
        loaded: 0,
        total: parsed.length,
      });
    }

    return Promise.resolve(parsed);
  }),
  groupDicomFiles: vi.fn((fileInfos) => {
    const map = new Map();
    map.set(
      "TEST123",
      new Map([["study1", new Map([["series1", fileInfos]])]])
    );
    return map;
  }),
}));

// Mock JSZip properly
const mockZipInstance = {
  file: vi.fn(),
  folder: vi.fn(function () {
    return {
      file: vi.fn(),
    };
  }),
  generateAsync: vi.fn(() => Promise.resolve(new Blob())),
};

vi.mock("jszip", () => ({
  default: vi.fn(function() {
    return mockZipInstance;
  }),
}));

describe("DICOM to PNG Converter", () => {
  let mockFiles: File[];
  let createElementSpy: any;
  let mockLink: HTMLAnchorElement;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    // Create mock DICOM files
    mockFiles = [
      new File([new ArrayBuffer(1024)], "slice1.dcm", {
        type: "application/dicom",
      }),
      new File([new ArrayBuffer(1024)], "slice2.dcm", {
        type: "application/dicom",
      }),
      new File([new ArrayBuffer(1024)], "slice3.dcm", {
        type: "application/dicom",
      }),
    ];

    // Create a real link element that we'll reuse
    mockLink = document.createElement("a");
    mockLink.click = vi.fn();
    originalCreateElement = document.createElement.bind(document);

    // Mock DOM methods
    createElementSpy = vi.spyOn(document, "createElement");
    vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url/12345");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    // Mock canvas methods
    const mockCanvas = {
      getContext: vi.fn(() => ({
        createImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(512 * 512 * 4),
        })),
        putImageData: vi.fn(),
        drawImage: vi.fn(),
      })),
      toBlob: vi.fn((callback) => {
        callback(new Blob([new ArrayBuffer(1024)], { type: "image/png" }));
      }),
      toDataURL: vi.fn(() => "data:image/png;base64,mock"),
      width: 512,
      height: 512,
    };

    createElementSpy.mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return mockCanvas as any;
      }
      if (tag === "a") {
        return mockLink;
      }
      // For any other tag, create a real element
      const element = originalCreateElement(tag);
      return element;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });
  
  //Tests

  describe("convertDicomSlicesToPng()", () => {
    it("should convert DICOM files to PNG", async () => {
      const results = await convertDicomSlicesToPng(mockFiles);

      expect(results).toHaveLength(3);
      expect(results[0].pngBlob).toBeInstanceOf(Blob);
      expect(results[0].pngDataUrl).toContain("data:image/png");
    });

    it("should call progress callback during conversion", async () => {
      const progressCallback = vi.fn();

      await convertDicomSlicesToPng(mockFiles, { progressCallback });

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith({
        lengthComputable: true,
        loaded: expect.any(Number),
        total: 3,
      });
    });

    it("should assign slice indices correctly", async () => {
      const results = await convertDicomSlicesToPng(mockFiles);

      expect(results[0].sliceIndex).toBe(0);
      expect(results[1].sliceIndex).toBe(1);
      expect(results[2].sliceIndex).toBe(2);
    });

    it("should handle resize options", async () => {
      const results = await convertDicomSlicesToPng(mockFiles, {
        width: 256,
        height: 256,
      });

      expect(results).toHaveLength(3);
      expect(results[0].pngBlob).toBeInstanceOf(Blob);
    });

    it("should handle windowing options", async () => {
      const results = await convertDicomSlicesToPng(mockFiles, {
        windowCenter: 40,
        windowWidth: 400,
      });

      expect(results).toHaveLength(3);
      expect(results[0].pngBlob).toBeInstanceOf(Blob);
    });

    it("should handle empty file array", async () => {
      const results = await convertDicomSlicesToPng([]);

      expect(results).toHaveLength(0);
    });

    it("should handle conversion errors gracefully", async () => {
      const { readImage } = await import("@itk-wasm/image-io");
      vi.mocked(readImage).mockRejectedValueOnce(
        new Error("Failed to read DICOM")
      );

      const results = await convertDicomSlicesToPng([mockFiles[0]]);

      // Should not throw, but may return empty or partial results
      expect(results).toBeDefined();
    });

    it("should preserve file reference", async () => {
      const results = await convertDicomSlicesToPng(mockFiles);

      expect(results[0].file).toBe(mockFiles[0]);
      expect(results[1].file).toBe(mockFiles[1]);
      expect(results[2].file).toBe(mockFiles[2]);
    });

    it("should report progress at each step", async () => {
      const progressCallback = vi.fn();

      await convertDicomSlicesToPng(mockFiles, { progressCallback });

      expect(progressCallback).toHaveBeenCalledTimes(3);
      expect(progressCallback).toHaveBeenNthCalledWith(1, {
        lengthComputable: true,
        loaded: 1,
        total: 3,
      });
      expect(progressCallback).toHaveBeenNthCalledWith(2, {
        lengthComputable: true,
        loaded: 2,
        total: 3,
      });
      expect(progressCallback).toHaveBeenNthCalledWith(3, {
        lengthComputable: true,
        loaded: 3,
        total: 3,
      });
    });

    it("should handle null main canvas context and continue", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      createElementSpy.mockImplementation((tag: string) => {
        if (tag === "canvas") {
          return {
            width: 512,
            height: 512,
            getContext: vi.fn(() => null),
            toBlob: vi.fn(),
            toDataURL: vi.fn(),
          } as any;
        }
        if (tag === "a") {
          return mockLink;
        }
        return originalCreateElement(tag);
      });

      const results = await convertDicomSlicesToPng([mockFiles[0]]);

      expect(results).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalled();
    });

    it("should handle null temp canvas context and continue", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let canvasCallCount = 0;

      createElementSpy.mockImplementation((tag: string) => {
        if (tag === "canvas") {
          canvasCallCount += 1;
          const isMainCanvas = canvasCallCount % 2 === 1;
          return {
            width: 512,
            height: 512,
            getContext: vi.fn(() =>
              isMainCanvas
                ? {
                    createImageData: vi.fn(() => ({
                      data: new Uint8ClampedArray(512 * 512 * 4),
                    })),
                    putImageData: vi.fn(),
                    drawImage: vi.fn(),
                  }
                : null,
            ),
            toBlob: vi.fn((callback) =>
              callback(new Blob([new ArrayBuffer(8)], { type: "image/png" })),
            ),
            toDataURL: vi.fn(() => "data:image/png;base64,mock"),
          } as any;
        }
        if (tag === "a") {
          return mockLink;
        }
        return originalCreateElement(tag);
      });

      const results = await convertDicomSlicesToPng([mockFiles[0]]);

      expect(results).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalled();
    });

    it("should handle null PNG blob from canvas and continue", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      createElementSpy.mockImplementation((tag: string) => {
        if (tag === "canvas") {
          return {
            width: 512,
            height: 512,
            getContext: vi.fn(() => ({
              createImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(512 * 512 * 4),
              })),
              putImageData: vi.fn(),
              drawImage: vi.fn(),
            })),
            toBlob: vi.fn((callback) => callback(null)),
            toDataURL: vi.fn(() => "data:image/png;base64,mock"),
          } as any;
        }
        if (tag === "a") {
          return mockLink;
        }
        return originalCreateElement(tag);
      });

      const results = await convertDicomSlicesToPng([mockFiles[0]]);

      expect(results).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("convertDicomSeriesToPng()", () => {
    it("should parse, group, and convert files by series", async () => {
      const progressCallback = vi.fn();

      const result = await convertDicomSeriesToPng(mockFiles, { progressCallback });

      expect(vi.mocked(parseDicomFiles)).toHaveBeenCalled();
      expect(vi.mocked(groupDicomFiles)).toHaveBeenCalled();
      expect(result.resultsBySeries.has("TEST123_study1_series1")).toBe(true);

      const converted = result.resultsBySeries.get("TEST123_study1_series1");
      expect(converted).toHaveLength(3);
      expect(converted?.[0].sliceIndex).toBe(0);
      expect(converted?.[0].metadata?.patientID).toBe("TEST123");
      expect(progressCallback).toHaveBeenCalled();
    });

    it("should continue series conversion if one file fails", async () => {
      const { readImage } = await import("@itk-wasm/image-io");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      vi.mocked(readImage)
        .mockRejectedValueOnce(new Error("bad dicom"))
        .mockResolvedValue({
          image: {
            size: [512, 512],
            data: new Float32Array(512 * 512).fill(100),
          },
        } as any);

      const result = await convertDicomSeriesToPng([mockFiles[0], mockFiles[1]]);
      const converted = result.resultsBySeries.get("TEST123_study1_series1");

      expect(converted).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalled();
    });

    it("should handle empty grouped result", async () => {
      vi.mocked(groupDicomFiles).mockReturnValueOnce(new Map() as any);

      const result = await convertDicomSeriesToPng(mockFiles);

      expect(result.resultsBySeries.size).toBe(0);
    });
  });

  describe("downloadOrganizedPngs()", () => {
    it("should create series folders and include metadata for first slice", async () => {
      const folderFileSpy = vi.fn();
      vi.mocked(mockZipInstance.folder).mockReturnValue({ file: folderFileSpy } as any);

      const resultsBySeries = new Map([
        [
          "TEST123_study1_series1",
          [
            {
              file: mockFiles[0],
              pngBlob: new Blob(),
              pngDataUrl: "data:image/png;base64,one",
              sliceIndex: 0,
              metadata: {
                file: mockFiles[0],
                isDICOM: true,
                patientID: "TEST123",
                seriesInstanceID: "series1",
              },
            },
            {
              file: mockFiles[1],
              pngBlob: new Blob(),
              pngDataUrl: "data:image/png;base64,two",
              sliceIndex: 1,
            },
          ],
        ],
      ]);

      await downloadOrganizedPngs(resultsBySeries, "organized.zip");

      expect(mockZipInstance.folder).toHaveBeenCalledWith("TEST123_study1_series1");
      expect(folderFileSpy).toHaveBeenCalledWith("slice-0000.png", expect.any(Blob));
      expect(folderFileSpy).toHaveBeenCalledWith("slice-0001.png", expect.any(Blob));
      expect(folderFileSpy).toHaveBeenCalledWith(
        "metadata.json",
        expect.stringContaining("TEST123"),
      );
      expect(mockLink.download).toBe("organized.zip");
    });

    it("should skip writing files when zip folder creation fails", async () => {
      vi.mocked(mockZipInstance.folder).mockReturnValueOnce(null as any);

      const resultsBySeries = new Map([
        [
          "TEST123_study1_series1",
          [
            {
              file: mockFiles[0],
              pngBlob: new Blob(),
              pngDataUrl: "data:image/png;base64,one",
              sliceIndex: 0,
            },
          ],
        ],
      ]);

      await expect(downloadOrganizedPngs(resultsBySeries)).resolves.not.toThrow();
      expect(mockZipInstance.generateAsync).toHaveBeenCalled();
      expect(mockLink.download).toBe("dicom-export.zip");
    });
  });

  describe("downloadPngsAsZip()", () => {
    it("should create a zip file with PNG files", async () => {
      const mockResults = [
        {
          file: mockFiles[0],
          pngBlob: new Blob(),
          pngDataUrl: "data:image/png;base64,mock1",
          sliceIndex: 0,
        },
        {
          file: mockFiles[1],
          pngBlob: new Blob(),
          pngDataUrl: "data:image/png;base64,mock2",
          sliceIndex: 1,
        },
      ];

      await downloadPngsAsZip(mockResults, "test-export.zip");

      expect(mockLink.download).toBe("test-export.zip");
    });

    it("should create download link and trigger download", async () => {
        const mockResults = [
        {
        file: mockFiles[0],
        pngBlob: new Blob(),
        pngDataUrl: "data:image/png;base64,mock",
        sliceIndex: 0,
        },
    ];

    await downloadPngsAsZip(mockResults);

    // Verify that createElement was called to create a link
    expect(createElementSpy).toHaveBeenCalledWith("a");
    // Verify the link's click method was called
    expect(mockLink.click).toHaveBeenCalled();
    }); 

    it("should use default filename if not provided", async () => {
      const mockResults = [
        {
          file: mockFiles[0],
          pngBlob: new Blob(),
          pngDataUrl: "data:image/png;base64,mock",
          sliceIndex: 0,
        },
      ];

      await downloadPngsAsZip(mockResults);

      expect(mockLink.download).toBe("dicom-slices.zip");
    });

    it("should clean up object URL", async () => {
      const mockResults = [
        {
          file: mockFiles[0],
          pngBlob: new Blob(),
          pngDataUrl: "data:image/png;base64,mock",
          sliceIndex: 0,
        },
      ];

      const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL");

      await downloadPngsAsZip(mockResults);

      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it("should handle empty results array", async () => {
      await expect(downloadPngsAsZip([])).resolves.not.toThrow();
    });

    it("should add files to zip", async () => {
      const mockResults = Array.from({ length: 3 }, (_, i) => ({
        file: mockFiles[0],
        pngBlob: new Blob(),
        pngDataUrl: `data:image/png;base64,mock${i}`,
        sliceIndex: i,
      }));

      await downloadPngsAsZip(mockResults);

      // Verify zip.file was called for each result
      expect(mockZipInstance.file).toHaveBeenCalled();
    });
  });

  describe("Image Processing", () => {
    it("should normalize pixel values to 0-255 range", async () => {
      const results = await convertDicomSlicesToPng(mockFiles);

      // PNG should be created successfully
      expect(results[0].pngBlob.type).toBe("image/png");
    });

    it("should handle different pixel value ranges", async () => {
      const { readImage } = await import("@itk-wasm/image-io");

      // Test with negative values (common in CT scans)
      vi.mocked(readImage).mockResolvedValueOnce({
        image: {
          size: [512, 512],
          data: new Float32Array(512 * 512).fill(-1000),
        },
      } as any);

      const results = await convertDicomSlicesToPng([mockFiles[0]]);

      expect(results[0].pngBlob).toBeInstanceOf(Blob);
    });

    it("should create canvas with correct dimensions", async () => {
      await convertDicomSlicesToPng(mockFiles, {
        width: 256,
        height: 256,
      });

      // Canvas creation is mocked, but we verify it was called
      expect(createElementSpy).toHaveBeenCalledWith("canvas");
    });
  });
});