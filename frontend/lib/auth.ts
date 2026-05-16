import { env } from "@/lib/env";

export const AUTH_STORAGE_KEY = "aperture-auth-key";
export const AUTH_REQUIRED_CACHE_KEY = "aperture-auth-required";
export const AUTH_HEADER = "X-Auth-Key";

export function getCachedAuthRequired(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(AUTH_REQUIRED_CACHE_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function setCachedAuthRequired(required: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_REQUIRED_CACHE_KEY, required ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getStoredAuthKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}

export function clearStoredAuthKey(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function authHeaders(): Record<string, string> {
  const key = getStoredAuthKey();
  return key ? { [AUTH_HEADER]: key } : {};
}

const AUTH_INVALID_EVENT = "aperture-auth-invalid";

export function emitAuthInvalid(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT));
}

export function onAuthInvalid(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUTH_INVALID_EVENT, listener);
  return () => window.removeEventListener(AUTH_INVALID_EVENT, listener);
}

export async function fetchAuthRequired(): Promise<boolean> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/auth/status`);
    if (!res.ok) return true;
    const body = (await res.json()) as { auth_required?: unknown };
    const required = body.auth_required !== false;
    setCachedAuthRequired(required);
    return required;
  } catch {
    return true;
  }
}

export async function verifyAuthKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/auth/verify`, {
      method: "GET",
      headers: { [AUTH_HEADER]: key },
    });
    return res.ok;
  } catch {
    return false;
  }
}
