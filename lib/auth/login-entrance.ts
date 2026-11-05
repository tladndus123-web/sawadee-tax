// The login card rises in the first time it opens. Switching language loads another /[locale]/login and would
// play that rise again (it starts invisible, so the card ghosts for a frame). The language button sets a
// short-lived cookie before the route change; the server then paints the next language already in place.

export const LOGIN_STAY_COOKIE = "sawadee_login_stay";

/** True when this visit should play the entrance. A "1" cookie means a language change, not a fresh arrival. */
export function loginShouldEnter(value: string | undefined): boolean {
  return value !== "1";
}

/** document.cookie text. stay=true lasts a minute (long enough for the navigation); false clears it. */
export function loginStayCookie(stay: boolean): string {
  return stay
    ? `${LOGIN_STAY_COOKIE}=1; Path=/; Max-Age=60; SameSite=Lax`
    : `${LOGIN_STAY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

// Set on the language click, before React unmounts the card, so the next screen can tell a language change
// from leaving the login page. Cleared once the next screen has decided.
let switching = false;

export function markLoginSwitch() {
  switching = true;
  if (typeof document === "undefined") return;
  document.documentElement.dataset.loginStay = "1";
  document.cookie = loginStayCookie(true);
}

export function isLoginSwitching() {
  return switching;
}

export function finishLoginSwitch() {
  switching = false;
}

// The login page remounts on a language change, which would wipe what was typed. Kept here (this tab only)
// so the address and the "check your email" step stay. Never written on the server.
export type LoginDraft = { email: string; code: string; sent: boolean };

let draft: LoginDraft | null = null;

export function peekLoginDraft(): LoginDraft | null {
  return draft;
}

export function keepLoginDraft(next: LoginDraft) {
  draft = next;
}

export function dropLoginDraft() {
  draft = null;
}
