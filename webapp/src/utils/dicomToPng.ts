import { readImage } from "@itk-wasm/image-io";
import {
  parseDicomFiles,
  groupDicomFiles,
  type DicomFileInfo,
  type ProgressCallback,
} from "./dicomUtils";

export interface DicomToPngResult {
  file: File;
  pngBlob: Blob;
  pngDataUrl: string;
  sliceIndex?: number;
  metadata?: DicomFileInfo;
}

export interface ConversionOptions {
  width?: number;
  height?: number;
  windowCenter?: number;
  windowWidth?: number;
  progressCallback?: ProgressCallback;
}

/**
 * Convert a single DICOM file to PNG
 */
async function convertDicomToPng(
  file: File,
  options?: ConversionOptions
): Promise<DicomToPngResult> {
  // Read the DICOM image
  const { image } = await readImage(file);

  // Get image dimensions
  const { size, data } = image;
  const width = size[0];
  const height = size[1];

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = options?.width || width;
  canvas.height = options?.height || height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  // Create ImageData
  const imageData = ctx.createImageData(width, height);
  const pixelData = new Uint8Array(imageData.data.buffer);

  // Normalize pixel values to 0-255 range
const dataArray = data as ArrayLike<number>;
const typedData: number[] = [];

// Convert to regular array
for (let i = 0; i < dataArray.length; i++) {
  typedData.push(dataArray[i]);
}

let min = typedData[0];
let max = typedData[0];

// Find min/max for normalization
for (let i = 0; i < typedData.length; i++) {
  if (typedData[i] < min) min = typedData[i];
  if (typedData[i] > max) max = typedData[i];
}

  // Apply windowing if provided
  if (
    options?.windowCenter !== undefined &&
    options?.windowWidth !== undefined
  ) {
    const windowMin = options.windowCenter - options.windowWidth / 2;
    const windowMax = options.windowCenter + options.windowWidth / 2;
    min = windowMin;
    max = windowMax;
  }

  const range = max - min;

  // Convert to grayscale RGBA
  for (let i = 0; i < typedData.length; i++) {
    let normalized = range > 0 ? ((typedData[i] - min) / range) * 255 : 0;
    normalized = Math.max(0, Math.min(255, normalized)); // Clamp

    const pixelIndex = i * 4;
    pixelData[pixelIndex] = normalized; // R
    pixelData[pixelIndex + 1] = normalized; // G
    pixelData[pixelIndex + 2] = normalized; // B
    pixelData[pixelIndex + 3] = 255; // A
  }

  // Put image data on canvas
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d");

  if (!tempCtx) {
    throw new Error("Could not get temp canvas context");
  }

  tempCtx.putImageData(imageData, 0, 0);

  // Scale if needed
  if (options?.width || options?.height) {
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(tempCanvas, 0, 0);
  }

  // Convert to PNG
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create PNG blob"));
          return;
        }

        const dataUrl = canvas.toDataURL("image/png");

        resolve({
          file,
          pngBlob: blob,
          pngDataUrl: dataUrl,
        });
      },
      "image/png"
    );
  });
}

/**
 * Convert DICOM files to PNG, organized by series
 */
export async function convertDicomSeriesToPng(
  files: FileList | File[],
  options?: ConversionOptions
) {
  // 1. Parse metadata using dicomUtils
  const fileInfos = await parseDicomFiles(files, (event) => {
    if (options?.progressCallback) {
      options.progressCallback(event);
    }
  });

  // 2. Group by patient/study/series using dicomUtils
  const grouped = groupDicomFiles(fileInfos);

  // 3. Convert each series to PNGs
  const resultsBySeries = new Map<string, DicomToPngResult[]>();
  let totalProcessed = 0;

  for (const [patientID, studies] of grouped) {
    for (const [studyID, series] of studies) {
      for (const [seriesID, seriesFiles] of series) {
        const seriesKey = `${patientID}_${studyID}_${seriesID}`;
        const pngs: DicomToPngResult[] = [];

        for (let i = 0; i < seriesFiles.length; i++) {
          const fileInfo = seriesFiles[i];

          try {
            const result = await convertDicomToPng(fileInfo.file, {
              width: options?.width,
              height: options?.height,
              windowCenter: options?.windowCenter,
              windowWidth: options?.windowWidth,
            });

            pngs.push({
              ...result,
              sliceIndex: i,
              metadata: fileInfo,
            });

            totalProcessed++;

            if (options?.progressCallback) {
              options.progressCallback({
                lengthComputable: true,
                loaded: totalProcessed,
                total: fileInfos.length,
              });
            }
          } catch (error) {
            console.error(`Error converting ${fileInfo.file.name}:`, error);
            totalProcessed++;

            if (options?.progressCallback) {
              options.progressCallback({
                lengthComputable: true,
                loaded: totalProcessed,
                total: fileInfos.length,
              });
            }
          }
        }

        resultsBySeries.set(seriesKey, pngs);
      }
    }
  }

  return {
    resultsBySeries,
    grouped,
  };
}

/**
 * Convert multiple DICOM files to PNG images (simple, non-organized)
 */
export async function convertDicomSlicesToPng(
  files: File[],
  options?: ConversionOptions
): Promise<DicomToPngResult[]> {
  const results: DicomToPngResult[] = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const result = await convertDicomToPng(files[i], options);
      results.push({
        ...result,
        sliceIndex: i,
      });

      if (options?.progressCallback) {
        options.progressCallback({
          lengthComputable: true,
          loaded: i + 1,
          total: files.length,
        });
      }
    } catch (error) {
      console.error(`Error converting file ${files[i].name}:`, error);
    }
  }

  return results;
}

/**
 * Download PNGs organized by series in a zip file
 */
export async function downloadOrganizedPngs(
  resultsBySeries: Map<string, DicomToPngResult[]>,
  zipFileName: string = "dicom-export.zip"
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const [seriesKey, results] of resultsBySeries) {
    const folder = zip.folder(seriesKey);

    if (folder) {
      results.forEach((result, index) => {
        const fileName = `slice-${String(index).padStart(4, "0")}.png`;
        folder.file(fileName, result.pngBlob);

        // Include metadata JSON for first slice
        if (result.metadata && index === 0) {
          folder.file(
            "metadata.json",
            JSON.stringify(result.metadata, null, 2)
          );
        }
      });
    }
  }

  const content = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download PNG files as a simple zip (non-organized)
 */
export async function downloadPngsAsZip(
  results: DicomToPngResult[],
  zipFileName: string = "dicom-slices.zip"
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  results.forEach((result, index) => {
    const fileName = `slice-${String(index).padStart(4, "0")}.png`;
    zip.file(fileName, result.pngBlob);
  });

  const content = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFileName;
  a.click();
  URL.revokeObjectURL(url);
}