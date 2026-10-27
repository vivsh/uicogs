import { describe, expect, it } from "vitest";
import {
  fromCalendarDate,
  fromDateTimeParts,
  fromQuasarDateRange,
  toCalendarDate,
  toDateTimeParts,
  toQuasarDateRange,
  toQuasarTime,
} from "./date-codecs.js";

describe("Quasar temporal codecs", () => {
  it("round-trips date-only values through the fixed UTC calendar mask", () => {
    const value = new Date("2028-02-29T00:00:00.000Z");
    expect(toCalendarDate(value)).toBe("2028-02-29");
    expect(fromCalendarDate("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(fromCalendarDate("2027-02-29")).toBeUndefined();
    expect(fromCalendarDate("2028/02/29")).toBeUndefined();
  });

  it("round-trips range values and rejects incomplete picker ranges", () => {
    const source = Object.freeze([
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T00:00:00.000Z"),
    ] as const);
    expect(toQuasarDateRange(source)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(
      fromQuasarDateRange({ from: "2026-07-01", to: "2026-07-31" })?.map(toCalendarDate),
    ).toEqual(["2026-07-01", "2026-07-31"]);
    expect(fromQuasarDateRange({ from: "2026-07-01" })).toBeUndefined();
  });

  it("retains seconds and constructs local date-time selections safely", () => {
    expect(toQuasarTime("12:34:56")).toBe("12:34:56");
    expect(toQuasarTime("25:00")).toBeUndefined();
    const value = fromDateTimeParts("2026-07-21", "10:30:45");
    expect(value).toBeInstanceOf(Date);
    expect(toDateTimeParts(value)).toMatchObject({ date: "2026-07-21", time: "10:30:45" });
    expect(fromDateTimeParts("not-a-date", "10:30")).toBeUndefined();
  });
});
