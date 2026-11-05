import { describe, expect, it } from "vitest";
import { fixedDisplayName, isGenericName } from "./fixed-name";

const ko = (c: string) => ({ rent: "임대료", utilities: "전기 · 수도 · 통신" })[c] ?? c;

describe("fixed cost names on screen", () => {
  it("shows a generic Japanese name as the kind in the reader's language", () => {
    expect(fixedDisplayName({ category: "rent", name: "家賃" }, ko)).toBe("임대료");
    expect(fixedDisplayName({ category: "utilities", name: "水道光熱費" }, ko)).toBe("전기 · 수도 · 통신");
    expect(fixedDisplayName({ category: "utilities", name: " ค่าน้ำ ค่าไฟ " }, ko)).toBe("전기 · 수도 · 통신");
    expect(isGenericName("rent", "Shop rent")).toBe(true);
  });
  it("keeps any other name as typed", () => {
    expect(fixedDisplayName({ category: "utilities", name: "Wi-Fi" }, ko)).toBe("Wi-Fi");
    expect(fixedDisplayName({ category: "rent", name: "駐車場" }, ko)).toBe("駐車場");
    // the generic word of another kind is not this kind's
    expect(fixedDisplayName({ category: "rent", name: "水道光熱費" }, ko)).toBe("水道光熱費");
    expect(isGenericName("rent", "")).toBe(false);
  });
});
