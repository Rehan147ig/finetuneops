import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("full workflow clickthrough reaches the cost estimate screen", async ({ page }) => {
  await page.goto("/traces");
  await page.getByRole("button", { name: "Promote to dataset" }).first().click();
  await expect(page.getByText("Dataset created")).toBeVisible({ timeout: 15000 });

  await page.goto("/datasets");
  await page.getByRole("button", { name: "Start experiment" }).first().click();
  await expect(page.getByText("Experiment started")).toBeVisible({ timeout: 15000 });

  await page.goto("/experiments");
  await page.getByRole("link", { name: "Review cost estimate" }).first().click();
  await expect(page.getByText("Estimated cost")).toBeVisible();
  await expect(page.getByRole("button", { name: "Proceed anyway" })).toBeVisible();
});

test("toast notifications appear on trace capture", async ({ page }) => {
  await page.goto("/traces");
  await page.getByLabel("Failure title").fill("Escalation loop after refund denial from QA");
  await page.getByLabel("Source").fill("Playwright trace capture");
  await page.getByLabel("Severity").selectOption("high");
  await page.getByRole("button", { name: "Capture trace" }).click();

  await expect(page.getByText("Trace captured")).toBeVisible({ timeout: 15000 });
});

test("cost estimator appears before fine-tune launch", async ({ page }) => {
  await page.goto("/experiments");
  await page.getByRole("link", { name: "Review cost estimate" }).first().click();

  await expect(page.getByText("Estimated epochs")).toBeVisible();
  await expect(page.getByText("Potential savings")).toBeVisible();
});

test("public review links open without login", async ({ page }) => {
  await page.goto("/releases");
  await page.getByRole("button", { name: "Generate review link" }).first().click();
  await expect(page.getByText("Review link created")).toBeVisible({ timeout: 15000 });

  const reviewLink = page.getByRole("link", { name: "Open review link" }).first();
  await reviewLink.click();

  await expect(page.getByText("No login required")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve Release" })).toBeVisible();
});
