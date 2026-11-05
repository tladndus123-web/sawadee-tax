import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";

const strings = (o: unknown, path = ""): [string, string][] =>
  typeof o === "string" ? [[path, o]] : o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k)) : [];

describe("screen words", () => {
  // In these messages an apostrophe right before {x} switches the placeholder off: the screen showed "{name}"
  // (found 2026-10-27). Quote names with “ ” or 「」 instead.
  it.each([
    ["ko", ko],
    ["ja", ja],
    ["th", th],
    ["en", en],
  ])("%s: no apostrophe right before a {placeholder}", (_l, m) => {
    expect(strings(m).filter(([, s]) => /'\{/.test(s)).map(([p]) => p)).toEqual([]);
  });
  it("every language has the same words", () => {
    const keys = (m: unknown) => strings(m).map(([p]) => p).sort();
    expect(keys(ja)).toEqual(keys(ko));
    expect(keys(th)).toEqual(keys(ko));
    expect(keys(en)).toEqual(keys(ko));
  });

  // Account sign-in is a mail link. The branch gate is a separate lock, so its words must not
  // sound like another login or like the password the sign-in screen said you do not have.
  it("sign-in and the branch lock use different words", () => {
    const banned = (m: unknown, phrases: string[]) =>
      strings(m)
        .filter(([path, s]) => (path === "auth.intro" || path.startsWith("gate.") || path === "branch.staffSwitchHint") && phrases.some((p) => s.includes(p)))
        .map(([path]) => path);
    expect(banned(ko, ["비밀번호는 필요 없습니다", "간편 로그인", "지점 비밀번호"])).toEqual([]);
    expect(banned(ja, ["パスワードは不要です", "かんたんログイン", "店舗パスワード"])).toEqual([]);
    expect(banned(en, ["No password needed", "quick sign-in", "Branch password", "branch password"])).toEqual([]);
    expect(banned(th, ["ไม่ต้องใช้รหัสผ่าน", "เข้าสู่ระบบด่วน", "รหัสผ่านสาขา"])).toEqual([]);
    expect(ko.gate.passkey).toBe("지점 잠금 해제");
    expect(ko.gate.hintAdmin).toContain("잠금 번호");
  });
});
