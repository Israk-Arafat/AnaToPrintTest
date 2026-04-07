import { test, expect } from "@playwright/test";
import { uploadDicomFiles } from "./helpers/upload-helper";
import path from "path";

test.describe("Upload Page", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    // Must be set before goto so the flag is available on first load
    await page.addInitScript(() => {
      (window as any).__PLAYWRIGHT_TEST__ = true;
    });
    await page.goto("/");
  });

  test("should display the upload page", async ({ page }) => {
    await expect(page.locator("h2")).toContainText("Upload DICOM Files");
    await expect(page.getByText("Drop DICOM folder here")).toBeVisible();
  });

  // Test will upload a test DICOM File and navigate to previewer
  test("should upload DICOM files and navigate to preview", async ({
    page,
    browserName,
  }) => {
    await uploadDicomFiles(page);

    // Wait for the upload to be processed
    await expect(page.getByText("Successfully loaded")).toBeVisible({
      timeout: 10000,
    });

    const continueButton = page.getByRole("button", {
      name: /Continue to 3D Preview/i,
    });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect(page).toHaveURL("/preview", { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: /3D Preview/i }),
    ).toBeVisible({
      timeout: 10000,
    });
  });

  test("should show patient information after upload", async ({
    page,
    browserName,
  }) => {
    // test.skip(
    //   browserName === "firefox",
    //   "Firefox has issues with directory uploads in CI"
    // );

    await uploadDicomFiles(page);

    await expect(page.getByText("Successfully loaded")).toBeVisible();
  });

  // Takes the folder containing an invalid file option in this case our invalid option is a txt file in a folder and test for an error
  test("should show error for non-DICOM files (folder upload)", async ({
    page,
  }) => {
    await page.goto("/");

    //folder containing invalid file(s)
    const invalidFolderPath = path.join(__dirname, "fixtures/Invalid_Folder");

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page
      .locator("div")
      .filter({ hasText: /Drop DICOM folder here/ })
      .first()
      .click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(invalidFolderPath);

    await expect(page.getByText("Error")).toBeVisible();
  });
});
