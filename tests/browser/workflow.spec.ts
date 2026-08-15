import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Prepare brief")).toBeVisible();
});

test("runs list, filter, pagination and relation workflows", async ({ page }) => {
  await page.getByLabel("Search tasks").fill("Publish");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.getByText("Publish notes")).toBeVisible();
  await expect(page.getByText("Prepare brief")).toHaveCount(0);

  await page.getByLabel("Search tasks").fill("");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Archive files")).toBeVisible();

  await page.getByText("Publish notes").click();
  await expect(page.getByText("Project: Beta")).toBeVisible();
});

test("matches generated filter actions to fields only in a shared desktop row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const filter = page.getByTestId("generated-filter");
  const field = filter.locator(".uc-field .q-field__control");
  const action = filter.getByRole("button", { name: "Apply filter" });
  await expect(field).toBeVisible();
  await expect(action).toBeVisible();

  const [fieldBox, actionBox] = await Promise.all([field.boundingBox(), action.boundingBox()]);
  expect(fieldBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(Math.abs(fieldBox!.height - actionBox!.height)).toBeLessThanOrEqual(1);
});

test("keeps generated filter actions naturally sized and reachable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const filter = page.getByTestId("generated-filter");
  const field = filter.locator(".uc-field");
  const actions = filter.locator(".uc-filter__actions");
  const action = filter.getByRole("button", { name: "Apply filter" });
  await expect(field).toBeVisible();
  await expect(action).toBeVisible();

  const [fieldBox, actionsBox, actionBox] = await Promise.all([
    field.boundingBox(),
    actions.boundingBox(),
    action.boundingBox(),
  ]);
  expect(fieldBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.y).toBeGreaterThanOrEqual(fieldBox!.y + fieldBox!.height);
  expect(actionBox!.width).toBeLessThan(actionsBox!.width);

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("renders Markdown preview and cycles a nullable generated Boolean", async ({ page }) => {
  const showcase = page.getByTestId("editor-showcase");
  await expect(showcase.getByRole("button", { name: "Preview" })).toBeVisible();
  await showcase.getByRole("button", { name: "Preview" }).click();
  await expect(showcase.locator(".uc-markdown__preview").getByRole("heading")).toHaveText(
    "Markdown preview",
  );

  const featured = showcase.getByRole("checkbox", { name: "Featured" });
  await expect(featured).toHaveAttribute("aria-checked", "mixed");
  await featured.click();
  await expect(featured).toBeChecked();
  await featured.click();
  await expect(featured).not.toBeChecked();
  await featured.click();
  await expect(featured).toHaveAttribute("aria-checked", "mixed");

  await showcase.locator(".uc-field-published .cursor-pointer").click();
  await expect(page.locator(".q-date")).toBeVisible();
});

test("creates, edits and uploads through schema-driven forms", async ({ page }) => {
  await page.getByRole("button", { name: "Create task" }).click();
  await page.getByRole("textbox", { name: "Task title" }).fill("Ship release");
  await page.locator('input[type="file"]').setInputFiles("README.md");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".q-dialog__backdrop")).toBeHidden();

  await page.getByLabel("Search tasks").fill("Ship release");
  await page.getByRole("button", { name: "Apply filter" }).click();
  const createdTitle = page.getByRole("cell", { name: "Ship release", exact: true });
  await expect(createdTitle).toBeVisible();

  await createdTitle.click();
  const title = page.getByRole("textbox", { name: "Task title" });
  await title.fill("Ship stable release");
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.locator(".q-menu").getByText("open", { exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles("README.md");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".q-dialog__backdrop")).toBeHidden();
  await page.getByLabel("Search tasks").fill("Ship stable");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.getByRole("cell", { name: "Ship stable release", exact: true })).toBeVisible();
});

test("performs bulk and delete actions independently of pagination", async ({ page }) => {
  await page.locator("tbody").getByRole("checkbox").first().click();
  await page.getByRole("button", { name: "Complete selected" }).click();
  await expect(page.getByRole("cell", { name: "done" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByText("Archive files").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Archive files")).toHaveCount(0);
});

test("reacts to local cache writes and attributed relation mutations", async ({ page }) => {
  const localValues = page.getByTestId("local-values");
  await expect(localValues).toHaveText("");
  await page.getByRole("button", { name: "Add local task" }).click();
  await expect(localValues).toHaveText("Cached locally");
  await page.getByRole("button", { name: "Update local task" }).click();
  await expect(localValues).toHaveText("Updated locally");

  const relationValues = page.getByTestId("relation-values");
  const relationEntries = page.getByTestId("relation-entries");
  await expect(relationValues).toHaveText("Grace");
  await expect(relationEntries).toHaveText("1");
  await page.getByRole("button", { name: "Add relation member" }).click();
  await expect(relationValues).toHaveText("Grace,Ada");
  await expect(relationEntries).toHaveText("1,2");
  await page.getByRole("button", { name: "Set relation members" }).click();
  await expect(relationValues).toHaveText("Ada");
  await page.getByRole("button", { name: "Clear relation members" }).click();
  await expect(relationValues).toHaveText("");
});

test("renders and updates a modular ECharts chart from a local resource", async ({ page }) => {
  const chart = page.getByTestId("local-task-chart");
  const canvas = chart.locator("canvas");
  await expect(canvas).toHaveCount(1);
  const emptyImage = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());

  await page.getByRole("button", { name: "Add local task" }).click();
  await expect
    .poll(async () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL()))
    .not.toBe(emptyImage);
});

test("reacts to and restores persisted runtime context", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("context-locale")).toHaveText("en");
  await page.getByRole("button", { name: "Add local task" }).click();
  await expect(page.getByTestId("local-values")).toHaveText("Cached locally");
  await page.getByRole("button", { name: "Change locale" }).click();
  await expect(page.getByTestId("context-locale")).toHaveText("fr");
  await page.reload();
  await expect(page.getByTestId("context-locale")).toHaveText("fr");
  await expect(page.getByTestId("local-values")).toHaveText("Cached locally");
});

test("repaints from SSE, reconnects with the event ID, bulk loads through targets, and disposes", async ({
  page,
}) => {
  await expect(page.getByTestId("live-values")).toHaveText("Reconnected live item");
  await expect(page.getByTestId("live-event-id")).toHaveText("live-3");
  await expect(page.getByTestId("live-status")).toHaveText("open");
  await expect(page.getByTestId("bulk-relation-values")).toHaveText("Ada,Grace");

  await expect
    .poll(async () => {
      const response = await page.request.get("/api/live-connections");
      return ((await response.json()) as { active: number }).active;
    })
    .toBe(1);

  await page.getByRole("button", { name: "Dispose live" }).click();
  await expect(page.getByTestId("live-status")).toHaveText("closed");
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/live-connections");
      return ((await response.json()) as { active: number }).active;
    })
    .toBe(0);
});

test("keeps the resource dialog inside a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Prepare brief").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Task title" })).toBeVisible();
  await page.waitForTimeout(300);

  const bounds = await dialog.locator("aside").boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "output/playwright/mobile-resource-detail.png" });
});

test("renders the desktop workflow without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await page.screenshot({ path: "output/playwright/desktop-resource-list.png" });
});
