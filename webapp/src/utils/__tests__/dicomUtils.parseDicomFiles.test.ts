import { describe, it, expect, vi, beforeEach } from "vitest";

// Must be hoisted before the import of dicomUtils so the module-level
// setPipelinesBaseUrl() call doesn't throw inside jsdom.
vi.mock("@itk-wasm/dicom", () => ({
  setPipelinesBaseUrl: vi.fn(),
  readDicomTags: vi.fn(),
  readImageDicomFileSeries: vi.fn(),
}));

import { parseDicomFiles } from "../dicomUtils";
import { readDicomTags } from "@itk-wasm/dicom";

//  Helpers 

const mockedReadDicomTags = vi.mocked(readDicomTags);

/** A fake Worker object whose terminate() we can spy on. */
function makeWorker() {
  return { terminate: vi.fn() } as unknown as Worker;
}

/** Full set of DICOM tag entries that the real library would return for a valid file. */
function makeFullTags(): [string, string][] {
  return [
    ["0010|0020", "P001"],
    ["0010|0010", "Smith^John"],
    ["0010|0030", "19800101"],
    ["0010|0040", "M"],
    ["0008|0021", "20240101"],
    ["0008|0031", "120000.000000"],
    ["0008|103e", "CT Head"],
    ["0020|000d", "1.2.3.4.5"],
    ["0020|000e", "1.2.3.4.5.6"],
  ];
}

/** Create a minimal File object. */
function makeFile(name = "slice.dcm"): File {
  return new File([""], name);
}

//  Tests 

describe("parseDicomFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  //  Empty input 

  it("returns an empty array for an empty file list", async () => {
    const result = await parseDicomFiles([]);
    expect(result).toEqual([]);
    expect(mockedReadDicomTags).not.toHaveBeenCalled();
  });

  it("calls progressCallback once with total=0 for an empty file list", async () => {
    // The initial progress emission happens unconditionally before the loop,
    // so even an empty list triggers one call with loaded=0, total=0.
    const cb = vi.fn();
    await parseDicomFiles([], cb);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith({
      lengthComputable: true,
      loaded: 0,
      total: 0,
    });
  });

  //  Valid DICOM file 

  it("returns isDICOM: true for a file readDicomTags resolves for", async () => {
    const worker = makeWorker();
    mockedReadDicomTags.mockResolvedValueOnce({
      webWorker: worker,
      tags: makeFullTags(),
    });

    const file = makeFile();
    const [result] = await parseDicomFiles([file]);

    expect(result.isDICOM).toBe(true);
    expect(result.file).toBe(file);
  });

  it("maps all DICOM tag codes to the correct DicomFileInfo fields", async () => {
    const worker = makeWorker();
    mockedReadDicomTags.mockResolvedValueOnce({
      webWorker: worker,
      tags: makeFullTags(),
    });

    const [result] = await parseDicomFiles([makeFile()]);

    expect(result.patientID).toBe("P001");
    expect(result.patientName).toBe("Smith^John");
    expect(result.patientDateOfBirth).toBe("19800101");
    expect(result.patientSex).toBe("M");
    expect(result.studyDate).toBe("20240101");
    expect(result.studyTime).toBe("120000.000000");
    expect(result.seriesDescription).toBe("CT Head");
    expect(result.studyInstanceID).toBe("1.2.3.4.5");
    expect(result.seriesInstanceID).toBe("1.2.3.4.5.6");
  });

  it("leaves fields undefined when tags are absent from the response", async () => {
    const worker = makeWorker();
    // Return only patientID; everything else is missing
    mockedReadDicomTags.mockResolvedValueOnce({
      webWorker: worker,
      tags: [["0010|0020", "P001"]],
    });

    const [result] = await parseDicomFiles([makeFile()]);

    expect(result.isDICOM).toBe(true);
    expect(result.patientID).toBe("P001");
    expect(result.patientName).toBeUndefined();
    expect(result.patientDateOfBirth).toBeUndefined();
    expect(result.patientSex).toBeUndefined();
    expect(result.studyDate).toBeUndefined();
    expect(result.studyTime).toBeUndefined();
    expect(result.seriesDescription).toBeUndefined();
    expect(result.studyInstanceID).toBeUndefined();
    expect(result.seriesInstanceID).toBeUndefined();
  });

  it("returns all files in input order", async () => {
    const files = [makeFile("a.dcm"), makeFile("b.dcm"), makeFile("c.dcm")];
    const worker = makeWorker();

    mockedReadDicomTags.mockResolvedValue({
      webWorker: worker,
      tags: makeFullTags(),
    });

    const results = await parseDicomFiles(files);

    expect(results).toHaveLength(3);
    expect(results[0].file).toBe(files[0]);
    expect(results[1].file).toBe(files[1]);
    expect(results[2].file).toBe(files[2]);
  });

  //  Error handling 

  it("returns isDICOM: false when readDicomTags throws", async () => {
    mockedReadDicomTags.mockRejectedValueOnce(new Error("Not a DICOM file"));

    const file = makeFile("bad.txt");
    const [result] = await parseDicomFiles([file]);

    expect(result.isDICOM).toBe(false);
    expect(result.file).toBe(file);
  });

  it("does not propagate the error — resolves normally", async () => {
    mockedReadDicomTags.mockRejectedValueOnce(new Error("Corrupt file"));

    await expect(parseDicomFiles([makeFile()])).resolves.toHaveLength(1);
  });

  it("continues processing subsequent files after one fails", async () => {
    const worker = makeWorker();
    mockedReadDicomTags
      .mockRejectedValueOnce(new Error("File 1 bad"))
      .mockResolvedValueOnce({ webWorker: worker, tags: makeFullTags() })
      .mockResolvedValueOnce({ webWorker: worker, tags: makeFullTags() });

    const files = [
      makeFile("bad.dcm"),
      makeFile("good1.dcm"),
      makeFile("good2.dcm"),
    ];
    const results = await parseDicomFiles(files);

    expect(results).toHaveLength(3);
    expect(results[0].isDICOM).toBe(false);
    expect(results[1].isDICOM).toBe(true);
    expect(results[2].isDICOM).toBe(true);
  });

  //  Progress callback 

  it("calls progressCallback with loaded=0, total=N before any file is processed", async () => {
    const worker = makeWorker();
    mockedReadDicomTags.mockResolvedValue({ webWorker: worker, tags: [] });

    const cb = vi.fn();
    const files = [makeFile(), makeFile(), makeFile()];

    await parseDicomFiles(files, cb);

    expect(cb).toHaveBeenNthCalledWith(1, {
      lengthComputable: true,
      loaded: 0,
      total: 3,
    });
  });

  it("calls progressCallback once per file after it is processed", async () => {
    const worker = makeWorker();
    mockedReadDicomTags.mockResolvedValue({ webWorker: worker, tags: [] });

    const cb = vi.fn();
    const files = [makeFile(), makeFile(), makeFile()];

    await parseDicomFiles(files, cb);

    // 1 initial + 3 per-file = 4 total
    expect(cb).toHaveBeenCalledTimes(4);
    expect(cb).toHaveBeenNthCalledWith(2, {
      lengthComputable: true,
      loaded: 1,
      total: 3,
    });
    expect(cb).toHaveBeenNthCalledWith(3, {
      lengthComputable: true,
      loaded: 2,
      total: 3,
    });
    expect(cb).toHaveBeenNthCalledWith(4, {
      lengthComputable: true,
      loaded: 3,
      total: 3,
    });
  });

  it("calls progressCallback even when readDicomTags throws (progress still advances)", async () => {
    mockedReadDicomTags
      .mockRejectedValueOnce(new Error("bad"))
      .mockRejectedValueOnce(new Error("also bad"));

    const cb = vi.fn();
    await parseDicomFiles([makeFile(), makeFile()], cb);

    // initial + 2 per-file = 3
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenLastCalledWith({
      lengthComputable: true,
      loaded: 2,
      total: 2,
    });
  });

  it("does not throw when no progressCallback is provided", async () => {
    const worker = makeWorker();
    mockedReadDicomTags.mockResolvedValueOnce({ webWorker: worker, tags: [] });

    await expect(parseDicomFiles([makeFile()])).resolves.not.toThrow();
  });

  //  Worker lifecycle 

  it("passes null as the webWorker for the first file in a chunk", async () => {
    const worker = makeWorker();
    mockedReadDicomTags.mockResolvedValue({ webWorker: worker, tags: [] });

    await parseDicomFiles([makeFile()]);

    expect(mockedReadDicomTags).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ webWorker: undefined }),
    );
  });

  it("reuses the worker returned by the previous call within the same chunk", async () => {
    const worker1 = makeWorker();
    const worker2 = makeWorker();

    mockedReadDicomTags
      .mockResolvedValueOnce({ webWorker: worker1, tags: [] })
      .mockResolvedValueOnce({ webWorker: worker2, tags: [] })
      .mockResolvedValueOnce({ webWorker: worker2, tags: [] });

    const files = [makeFile("a.dcm"), makeFile("b.dcm"), makeFile("c.dcm")];
    await parseDicomFiles(files);

    // Second call receives worker1 (returned by first call)
    expect(mockedReadDicomTags).toHaveBeenNthCalledWith(
      2,
      files[1],
      expect.objectContaining({ webWorker: worker1 }),
    );
    // Third call receives worker2 (returned by second call)
    expect(mockedReadDicomTags).toHaveBeenNthCalledWith(
      3,
      files[2],
      expect.objectContaining({ webWorker: worker2 }),
    );
  });

  it("terminates the worker after processing a chunk", async () => {
    const worker = makeWorker();
    mockedReadDicomTags.mockResolvedValue({ webWorker: worker, tags: [] });

    await parseDicomFiles([makeFile(), makeFile()]);

    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("resets the worker to null at chunk boundaries (worker from error is null)", async () => {
    // When a file fails, fetchInfo returns null as the worker.
    // The next file in the same chunk must start with worker=null (undefined option).
    mockedReadDicomTags.mockRejectedValueOnce(new Error("bad"));

    const worker = makeWorker();
    mockedReadDicomTags.mockResolvedValueOnce({ webWorker: worker, tags: [] });

    await parseDicomFiles([makeFile("bad.dcm"), makeFile("good.dcm")]);

    // Second call: worker option should be undefined because the first call failed
    expect(mockedReadDicomTags).toHaveBeenNthCalledWith(
      2,
      expect.any(File),
      expect.objectContaining({ webWorker: undefined }),
    );
  });

  //  Multi-chunk processing (chunkSize = 200) 

  it("processes more than 200 files across multiple chunks and returns all results", async () => {
    const worker = makeWorker();
    mockedReadDicomTags.mockResolvedValue({
      webWorker: worker,
      tags: makeFullTags(),
    });

    const files = Array.from({ length: 201 }, (_, i) =>
      makeFile(`slice-${i}.dcm`),
    );
    const results = await parseDicomFiles(files);

    expect(results).toHaveLength(201);
    expect(results.every((r) => r.isDICOM === true)).toBe(true);
  });

  it("terminates the worker at the end of each 200-file chunk", async () => {
    const worker1 = makeWorker();
    const worker2 = makeWorker();

    // First chunk (200 files) will keep returning worker1; last file of second chunk returns worker2
    mockedReadDicomTags
      .mockResolvedValue({ webWorker: worker1, tags: [] })
      // Override only the 201st call to return worker2
      .mockResolvedValueOnce({ webWorker: worker2, tags: [] });

    // Re-mock: first 200 return worker1, the 201st returns worker2
    mockedReadDicomTags.mockReset();
    for (let i = 0; i < 200; i++) {
      mockedReadDicomTags.mockResolvedValueOnce({
        webWorker: worker1,
        tags: [],
      });
    }
    mockedReadDicomTags.mockResolvedValueOnce({ webWorker: worker2, tags: [] });

    const files = Array.from({ length: 201 }, (_, i) =>
      makeFile(`slice-${i}.dcm`),
    );
    await parseDicomFiles(files);

    // worker1 terminated at end of chunk 1 (file index 199)
    expect(worker1.terminate).toHaveBeenCalledOnce();
    // worker2 terminated at end of chunk 2 (file index 200)
    expect(worker2.terminate).toHaveBeenCalledOnce();
  });
});
