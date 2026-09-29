// The 6-digit sign-in code out of whatever was pasted or auto-filled: the code alone, the email subject
// ("482913 · 로그인 코드 …"), or a whole copied email. A run of exactly six digits wins (so a date or a phone number
// next to it doesn't); otherwise the digits typed so far.
// No lookbehind in the pattern: older iPhones (iOS < 16.4) cannot even load a script that has one.

export const CODE_LENGTH = 6;

export function pickCode(text: string): string {
  const run = /(?:^|\D)(\d{6})(?!\d)/.exec(text);
  if (run) return run[1];
  return text.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/** What the clipboard holds, when the browser lets the page read it; null when it does not (the person pastes by hand) */
export async function readClipboard(): Promise<string | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return null;
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
