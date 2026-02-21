import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock before importing dicomUtils — the module calls setPipelinesBaseUrl()
// at load time, which fails in jsdom without this mock.
vi.mock("@itk-wasm/dicom", () => ({
  setPipelinesBaseUrl: vi.fn(),
  readDicomTags: vi.fn(),
  readImageDicomFileSeries: vi.fn(),
}));

import { loadDicomImageSeries } from "../dicomUtils";
import { readImageDicomFileSeries } from "@itk-wasm/dicom";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockedReadImageDicomFileSeries = vi.mocked(readImageDicomFileSeries);

/** A fake worker pool with a spy on terminateWorkers(). */
function makeWorkerPool() {
  return { terminateWorkers: vi.fn() };
}

/** A minimal stand-in for the vtkImageData output. */
const MOCK_IMAGE = { dimensions: [512, 512, 100], mock: true };

function makeFile(name = "slice.dcm"): File {
  return new File([""], name);
}

/** Build a fully-typed mock result for readImageDicomFileSeries. */
function makeSeriesResult(
  pool: ReturnType<typeof makeWorkerPool> | null | undefined,
) {
  return {
    outputImage: MOCK_IMAGE as any,
    webWorkerPool: pool as any,
    sortedFilenames: [] as string[],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("loadDicomImageSeries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Return value ────────────────────────────────────────────────────────────

  it("returns the outputImage from readImageDicomFileSeries", async () => {
    const pool = makeWorkerPool();
    mockedReadImageDicomFileSeries.mockResolvedValueOnce(
      makeSeriesResult(pool),
    );

    const result = await loadDicomImageSeries([makeFile()]);

    expect(result).toBe(MOCK_IMAGE);
  });

  it("passes the files array as inputImages to readImageDicomFileSeries", async () => {
    const pool = makeWorkerPool();
    const files = [makeFile("a.dcm"), makeFile("b.dcm")];

    mockedReadImageDicomFileSeries.mockResolvedValueOnce(
      makeSeriesResult(pool),
    );

    await loadDicomImageSeries(files);

    expect(mockedReadImageDicomFileSeries).toHaveBeenCalledOnce();
    expect(mockedReadImageDicomFileSeries).toHaveBeenCalledWith({
      inputImages: files,
    });
  });

  // ── Worker pool lifecycle ───────────────────────────────────────────────────

  it("calls terminateWorkers() on the pool after a successful load", async () => {
    const pool = makeWorkerPool();
    mockedReadImageDicomFileSeries.mockResolvedValueOnce(
      makeSeriesResult(pool),
    );

    await loadDicomImageSeries([makeFile()]);

    expect(pool.terminateWorkers).toHaveBeenCalledOnce();
  });

  it("does not throw when webWorkerPool is null", async () => {
    mockedReadImageDicomFileSeries.mockResolvedValueOnce(
      makeSeriesResult(null),
    );

    await expect(loadDicomImageSeries([makeFile()])).resolves.toBe(MOCK_IMAGE);
  });

  it("does not throw when webWorkerPool is undefined", async () => {
    mockedReadImageDicomFileSeries.mockResolvedValueOnce(
      makeSeriesResult(undefined),
    );

    await expect(loadDicomImageSeries([makeFile()])).resolves.toBe(MOCK_IMAGE);
  });

  // ── Progress callback ───────────────────────────────────────────────────────

  it("calls progressCallback with lengthComputable=false before the load starts", async () => {
    const pool = makeWorkerPool();
    mockedReadImageDicomFileSeries.mockResolvedValueOnce(
      makeSeriesResult(pool),
    );

    const cb = vi.fn();
    await loadDicomImageSeries([makeFile()], cb);

    expect(cb).toHaveBeenNthCalledWith(1, {
      lengthComputable: false,
      loaded: 0,
      total: 0,
    });
  });

  it("calls progressCallback with loaded=100, total=100 after the load completes", async () => {
    const pool = makeWorkerPool();
    mockedReadImageDicomFileSeries.mockResolvedValueOnce(
      makeSeriesResult(pool),
    );

    const cb = vi.fn();
    await loadDicomImageSeries([makeFile()], cb);

    expect(cb).toHaveBeenNthCalledWith(2, {
      lengthComputable: true,
      loaded: 100,
      total: 100,
    });
  });

  it("calls progressCallback exactly twice — once before and once after loading", async () => {
    const pool = makeWorkerPool();
    mockedReadImageDicomFileSeries.mockResolvedValueOnce(
      makeSeriesResult(pool),
    );

    const cb = vi.fn();
    await loadDicomImageSeries([makeFile()], cb);

    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("calls the initial indeterminate progress before readImageDicomFileSeries is invoked", async () => {
    const pool = makeWorkerPool();
    const callOrder: string[] = [];

    mockedReadImageDicomFileSeries.mockImplementationOnce(async () => {
      callOrder.push("readImageDicomFileSeries");
      return makeSeriesResult(pool);
    });

    const cb = vi.fn().mockImplementation(() => {
      callOrder.push("progressCallback");
    });

    await loadDicomImageSeries([makeFile()], cb);

    expect(callOrder).toEqual([
      "progressCallback", // initial indeterminate call
      "readImageDicomFileSeries",
      "progressCallback", // completion call
    ]);
  });

  it("does not throw when no progressCallback is provided", async () => {
    const pool = makeWorkerPool();
    mockedReadImageDicomFileSeries.mockResolvedValueOnce(
      makeSeriesResult(pool),
    );

    await expect(loadDicomImageSeries([makeFile()])).resolves.not.toThrow();
  });

  // ── Error propagation ───────────────────────────────────────────────────────

  it("propagates errors thrown by readImageDicomFileSeries", async () => {
    mockedReadImageDicomFileSeries.mockRejectedValueOnce(
      new Error("WASM load failed"),
    );

    await expect(loadDicomImageSeries([makeFile()])).rejects.toThrow(
      "WASM load failed",
    );
  });

  it("does not fire the completion progressCallback when readImageDicomFileSeries throws", async () => {
    mockedReadImageDicomFileSeries.mockRejectedValueOnce(new Error("bad"));

    const cb = vi.fn();
    await loadDicomImageSeries([makeFile()], cb).catch(() => {});

    // Only the initial indeterminate call should have been made
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith({
      lengthComputable: false,
      loaded: 0,
      total: 0,
    });
  });
});
