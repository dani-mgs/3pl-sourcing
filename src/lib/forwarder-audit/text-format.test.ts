import { describe, expect, it } from "vitest";
import { dateSerial, isoFromSerial, textDate, textMoney, textPercent, textQty2, textQty3, textRate } from "./text-format";

describe("the workbook's TEXT formats", () => {
  it("formats money, quantities and rates as LibreOffice does", () => {
    expect(textMoney(1831.375)).toBe("1,831.38");
    expect(textMoney(-25)).toBe("-25.00");
    expect(textQty3(23.098)).toBe("23.098");
    expect(textQty3(20)).toBe("20");
    expect(textQty3(0)).toBe("0");
    expect(textQty2(1831.38)).toBe("1,831.38");
    expect(textRate(155)).toBe("155.00");
    expect(textRate(8.0045)).toBe("8.0045");
    expect(textPercent(0.010167196321899273)).toBe("1.0%");
    expect(textPercent(-0.0093)).toBe("-0.9%");
  });

  it("gives text back unchanged and treats an empty cell as 0", () => {
    expect(textPercent("")).toBe("");
    expect(textQty2(null)).toBe("0");
  });

  it("formats dates in UTC, whatever the host timezone", () => {
    expect(textDate(dateSerial("2026-06-30"))).toBe("30 Jun 2026");
    expect(dateSerial("2026-06-30")).toBe(46203);
    expect(isoFromSerial(46203)).toBe("2026-06-30");
  });
});
