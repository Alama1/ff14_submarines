const STORAGE_KEY = 'ff14_submarine_trusted_access_code';
const NICKNAME_KEY = 'ff14_submarine_trusted_nickname';

/** Trusted-crafter access code, kept per browser. Sent with every new claim. */
export function getTrustedAccessCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Crafter name the admin attached to the code — prefills "Your Nickname". */
export function getTrustedNickname(): string | null {
  try {
    return localStorage.getItem(NICKNAME_KEY) || null;
  } catch {
    return null;
  }
}

export function setTrustedAccessCode(code: string | null, nickname?: string): void {
  try {
    if (code) {
      localStorage.setItem(STORAGE_KEY, code);
      if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(NICKNAME_KEY);
    }
  } catch {
    /* storage unavailable — non-critical */
  }
}
