import { expect, test } from "@playwright/test";

test("renders the opt-in Quasar stylebook overview with static chart fixtures", async ({
  page,
}) => {
  await page.goto("/stylebook/");
  await expect(page.getByRole("heading", { name: "UiCogs Quasar stylebook" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Typography" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pie" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Line" })).toBeVisible();
  await expect(page.locator(".uc-stylebook")).toBeVisible();
  await expect(page.locator(".uc-rich-text")).toBeVisible();
  await expect(page.getByRole("radio", { name: "review" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Audience" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Review window" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(9);
  await page.getByRole("button", { name: "Source" }).click();
  await expect(page.locator(".uc-rich-text__source")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await page.getByRole("button", { name: "Use mobile preview" }).click();
  await expect(page.locator(".uc-stylebook")).toHaveClass(/uc-stylebook--mobile/);
  await page.getByRole("button", { name: "Use dark preview" }).click();
  await expect(page.getByRole("button", { name: "Use light preview" })).toBeVisible();
});
