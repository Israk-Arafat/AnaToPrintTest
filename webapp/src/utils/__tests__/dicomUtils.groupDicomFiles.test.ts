import { describe, it, expect, vi } from "vitest";

// @itk-wasm/dicom uses WASM and calls setPipelinesBaseUrl at module load time,
// which doesn't work in jsdom. Mock the entire module so importing dicomUtils
// doesn't throw. groupDicomFiles itself has no dependency on these functions.
vi.mock("@itk-wasm/dicom", () => ({
  setPipelinesBaseUrl: vi.fn(),
  readDicomTags: vi.fn(),
  readImageDicomFileSeries: vi.fn(),
}));

import { groupDicomFiles } from "../dicomUtils";
import type { DicomFileInfo } from "../dicomUtils";

//  Helpers 

/**
 * Create a minimal DicomFileInfo for test purposes.
 * Any field not provided falls back to the "unknown" sentinel or undefined.
 */
function makeDicomFile(
  overrides: Partial<DicomFileInfo> & { isDICOM?: boolean } = {},
): DicomFileInfo {
  return {
    file: new File([""], overrides.patientID ?? "file.dcm"),
    isDICOM: true,
    patientID: "P001",
    studyInstanceID: "ST001",
    seriesInstanceID: "SE001",
    ...overrides,
  } as DicomFileInfo;
}

//  Tests 

describe("groupDicomFiles", () => {
  //  Empty input 

  it("returns an empty map for an empty array", () => {
    const result = groupDicomFiles([]);
    expect(result.size).toBe(0);
  });

  //  Non-DICOM filtering 

  it("excludes files where isDICOM is false", () => {
    const nonDicom = makeDicomFile({ isDICOM: false });
    const result = groupDicomFiles([nonDicom]);
    expect(result.size).toBe(0);
  });

  it("excludes non-DICOM files while keeping valid ones", () => {
    const valid = makeDicomFile({ patientID: "P001" });
    const invalid = makeDicomFile({ isDICOM: false });
    const result = groupDicomFiles([valid, invalid]);

    expect(result.size).toBe(1);
    expect(result.has("P001")).toBe(true);
  });

  //  Single file 

  it("places a single DICOM file under the correct patient/study/series keys", () => {
    const file = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST001",
      seriesInstanceID: "SE001",
    });

    const result = groupDicomFiles([file]);

    expect(result.size).toBe(1);
    const studies = result.get("P001")!;
    expect(studies.size).toBe(1);
    const series = studies.get("ST001")!;
    expect(series.size).toBe(1);
    expect(series.get("SE001")).toEqual([file]);
  });

  //  Patient grouping 

  it("groups multiple files under the same patient", () => {
    // Both files share the same patientID and studyInstanceID (default: "ST001")
    // but different series — expect one patient, one study, two series.
    const f1 = makeDicomFile({ patientID: "P001", seriesInstanceID: "SE001" });
    const f2 = makeDicomFile({ patientID: "P001", seriesInstanceID: "SE002" });

    const result = groupDicomFiles([f1, f2]);

    expect(result.size).toBe(1);
    const studies = result.get("P001")!;
    expect(studies.size).toBe(1); // same study
    expect(studies.get("ST001")!.size).toBe(2); // two distinct series
  });

  it("creates separate top-level entries for different patients", () => {
    const f1 = makeDicomFile({ patientID: "P001" });
    const f2 = makeDicomFile({ patientID: "P002" });

    const result = groupDicomFiles([f1, f2]);

    expect(result.size).toBe(2);
    expect(result.has("P001")).toBe(true);
    expect(result.has("P002")).toBe(true);
  });

  //  Study grouping 

  it("groups files from the same patient under separate studies", () => {
    const f1 = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST001",
      seriesInstanceID: "SE001",
    });
    const f2 = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST002",
      seriesInstanceID: "SE001",
    });

    const result = groupDicomFiles([f1, f2]);

    const studies = result.get("P001")!;
    expect(studies.size).toBe(2);
    expect(studies.has("ST001")).toBe(true);
    expect(studies.has("ST002")).toBe(true);
  });

  it("places files with the same study under one study entry", () => {
    const f1 = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST001",
      seriesInstanceID: "SE001",
    });
    const f2 = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST001",
      seriesInstanceID: "SE002",
    });

    const result = groupDicomFiles([f1, f2]);

    const studies = result.get("P001")!;
    expect(studies.size).toBe(1);
  });

  //  Series grouping 

  it("groups files from the same study under separate series", () => {
    const f1 = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST001",
      seriesInstanceID: "SE001",
    });
    const f2 = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST001",
      seriesInstanceID: "SE002",
    });

    const result = groupDicomFiles([f1, f2]);

    const series = result.get("P001")!.get("ST001")!;
    expect(series.size).toBe(2);
    expect(series.get("SE001")).toEqual([f1]);
    expect(series.get("SE002")).toEqual([f2]);
  });

  it("accumulates multiple files within the same series", () => {
    const f1 = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST001",
      seriesInstanceID: "SE001",
    });
    const f2 = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST001",
      seriesInstanceID: "SE001",
    });
    const f3 = makeDicomFile({
      patientID: "P001",
      studyInstanceID: "ST001",
      seriesInstanceID: "SE001",
    });

    const result = groupDicomFiles([f1, f2, f3]);

    const files = result.get("P001")!.get("ST001")!.get("SE001")!;
    expect(files).toHaveLength(3);
    expect(files).toContain(f1);
    expect(files).toContain(f2);
    expect(files).toContain(f3);
  });

  it("preserves insertion order of files within a series", () => {
    const files = Array.from({ length: 5 }, (_, i) =>
      makeDicomFile({
        patientID: "P001",
        studyInstanceID: "ST001",
        seriesInstanceID: "SE001",
        file: new File([""], `slice-${i}.dcm`),
      }),
    );

    const result = groupDicomFiles(files);
    const stored = result.get("P001")!.get("ST001")!.get("SE001")!;

    expect(stored).toEqual(files);
  });

  //  "unknown" fallback keys 

  it('uses "unknown" as the patient key when patientID is undefined', () => {
    const file = makeDicomFile({ patientID: undefined });
    const result = groupDicomFiles([file]);

    expect(result.has("unknown")).toBe(true);
  });

  it('uses "unknown" as the study key when studyInstanceID is undefined', () => {
    const file = makeDicomFile({ studyInstanceID: undefined });
    const result = groupDicomFiles([file]);

    const studies = result.get("P001")!;
    expect(studies.has("unknown")).toBe(true);
  });

  it('uses "unknown" as the series key when seriesInstanceID is undefined', () => {
    const file = makeDicomFile({ seriesInstanceID: undefined });
    const result = groupDicomFiles([file]);

    const series = result.get("P001")!.get("ST001")!;
    expect(series.has("unknown")).toBe(true);
  });

  it('groups multiple files with missing IDs together under "unknown" keys', () => {
    const f1 = makeDicomFile({
      patientID: undefined,
      studyInstanceID: undefined,
      seriesInstanceID: undefined,
    });
    const f2 = makeDicomFile({
      patientID: undefined,
      studyInstanceID: undefined,
      seriesInstanceID: undefined,
    });

    const result = groupDicomFiles([f1, f2]);

    expect(result.size).toBe(1);
    const files = result.get("unknown")!.get("unknown")!.get("unknown")!;
    expect(files).toHaveLength(2);
  });

  //  Complex multi-patient/multi-study/multi-series 

  it("handles a realistic mix of patients, studies, and series", () => {
    const files = [
      makeDicomFile({
        patientID: "P001",
        studyInstanceID: "ST001",
        seriesInstanceID: "SE001",
      }),
      makeDicomFile({
        patientID: "P001",
        studyInstanceID: "ST001",
        seriesInstanceID: "SE001",
      }),
      makeDicomFile({
        patientID: "P001",
        studyInstanceID: "ST001",
        seriesInstanceID: "SE002",
      }),
      makeDicomFile({
        patientID: "P001",
        studyInstanceID: "ST002",
        seriesInstanceID: "SE001",
      }),
      makeDicomFile({
        patientID: "P002",
        studyInstanceID: "ST001",
        seriesInstanceID: "SE001",
      }),
      makeDicomFile({ isDICOM: false }),
    ];

    const result = groupDicomFiles(files);

    // Two patients
    expect(result.size).toBe(2);

    // P001 → two studies
    const p1Studies = result.get("P001")!;
    expect(p1Studies.size).toBe(2);

    // P001/ST001 → two series, first series has two files
    const p1st1Series = p1Studies.get("ST001")!;
    expect(p1st1Series.size).toBe(2);
    expect(p1st1Series.get("SE001")).toHaveLength(2);
    expect(p1st1Series.get("SE002")).toHaveLength(1);

    // P001/ST002 → one series
    expect(p1Studies.get("ST002")!.size).toBe(1);

    // P002 → one study, one series
    const p2Studies = result.get("P002")!;
    expect(p2Studies.size).toBe(1);
    expect(p2Studies.get("ST001")!.get("SE001")).toHaveLength(1);
  });
});
