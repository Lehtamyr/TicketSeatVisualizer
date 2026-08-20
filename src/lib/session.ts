import { cookies } from 'next/headers';
import crypto from 'crypto';

const SESSION_COOKIE = 'tsv_sid';

/**
 * Retrieves the current session ID from HTTP-only cookie or creates a new one.
 * Uses `next/headers` cookies() to ensure server-side tamper resistance.
 */
export async function getOrCreateSessionId(fallbackSessionId?: string): Promise<string> {
  try {
    const cookieStore = await cookies();
    const existing = cookieStore.get(SESSION_COOKIE)?.value;
    if (existing && existing.trim().length > 0) {
      return existing;
    }

    const newId = fallbackSessionId && fallbackSessionId.trim().length > 0
      ? fallbackSessionId
      : crypto.randomUUID();

    cookieStore.set(SESSION_COOKIE, newId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return newId;
  } catch {
    // If running outside request context (e.g. CLI or unit test helper)
    return fallbackSessionId && fallbackSessionId.trim().length > 0
      ? fallbackSessionId
      : crypto.randomUUID();
  }
}
