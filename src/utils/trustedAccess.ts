const STORAGE_KEY = 'ff14_submarine_trusted_access_code';

/** Trusted-crafter access code, kept per browser. Sent with every new claim. */
export function getTrustedAccessCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setTrustedAccessCode(code: string | null): void {
  try {
    if (code) {
      localStorage.setItem(STORAGE_KEY, code);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* storage unavailable — non-critical */
  }
}
