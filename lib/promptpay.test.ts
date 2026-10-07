import { describe, expect, it } from "vitest";
import { crc16, promptPayKind, promptPayPayload } from "./promptpay";

describe("PromptPay QR", () => {
  it("uses CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("tells phone numbers, tax IDs and e-wallet IDs apart", () => {
    expect(promptPayKind("081-234-5678")).toBe("phone");
    expect(promptPayKind("0105551234567")).toBe("taxId");
    expect(promptPayKind("123456789012345")).toBe("ewallet");
    expect(promptPayKind("12345")).toBeNull();
    expect(promptPayKind("8123456789")).toBeNull();
  });

  // Expected texts checked against the promptpay-qr library (dtinth), which Thai banking apps read
  it("builds the standard text for a phone number, a tax ID and an e-wallet ID", () => {
    expect(promptPayPayload("0841234567")).toBe("00020101021129370016A000000677010111011300668412345675802TH530376463046766");
    expect(promptPayPayload("0105551234567")).toBe("00020101021129370016A000000677010111021301055512345675802TH53037646304BEA9");
    expect(promptPayPayload("123456789012345")).toBe("00020101021129390016A00000067701011103151234567890123455802TH5303764630473AF");
  });

  it("puts the amount in and marks the QR as one-off", () => {
    expect(promptPayPayload("0841234567", 1234.5)).toBe("00020101021229370016A000000677010111011300668412345675802TH530376454071234.506304EBDE");
  });

  it("puts a tax ID in as is", () => {
    expect(promptPayPayload("0105551234567")).toContain("02130105551234567");
  });
});
