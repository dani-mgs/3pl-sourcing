// Email checks for forwarder and 3PL contacts (QA B-10). A new or changed
// email must look like an address; one that is stored already and unchanged
// is never blocked, only flagged, so an old record can still be saved.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const INVALID_EMAIL_ERROR = "Enter a valid email address, or leave it empty.";
export const INVALID_EMAIL_HINT = "This email looks invalid. Please check it.";

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

// The save's answer for an email: an error when it's new or changed and
// doesn't look valid, otherwise null. previous is the stored value (null for a
// new record).
export function emailSaveError(email: string | null, previous: string | null | undefined): string | null {
  const value = email?.trim() ?? "";
  if (!value || isValidEmail(value)) return null;
  if (previous != null && previous.trim() === value) return null;
  return INVALID_EMAIL_ERROR;
}

// Whether the form should flag a stored email that is still unchanged.
export function showStoredEmailHint(current: string, stored: string | null | undefined): boolean {
  const original = stored?.trim() ?? "";
  return original !== "" && current.trim() === original && !isValidEmail(original);
}
