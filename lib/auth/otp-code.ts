// The 6-digit sign-in code out of whatever was pasted or auto-filled: the code alone, the email subject
// ("482913 · 로그인 코드 …"), or a whole copied email. A run of exactly six digits wins (so a date or a phone number
// next to it doesn't); otherwise the digits typed so far.

export const CODE_LENGTH = 6;

export function pickCode(text: string): string {
  const run = /(?<!\d)\d{6}(?!\d)/.exec(text);
  if (run) return run[0];
  return text.replace(/\D/g, "").slice(0, CODE_LENGTH);
}
