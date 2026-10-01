import type { User } from "@shared/schema";

/** Credential and one-time-code material that must never leave the server. */
const SECRET_USER_FIELDS = ["hashedPassword", "verificationCode", "codeExpiry"] as const;

export type PublicUser = Omit<User, (typeof SECRET_USER_FIELDS)[number]>;

export function toPublicUser<T extends Partial<User>>(user: T): Omit<T, (typeof SECRET_USER_FIELDS)[number]>;
export function toPublicUser<T extends Partial<User>>(user: T | undefined | null): Omit<T, (typeof SECRET_USER_FIELDS)[number]> | undefined;
export function toPublicUser<T extends Partial<User>>(user: T | undefined | null) {
  if (!user) return undefined;
  // Explicit destructuring (not dynamic key deletion) so the secret fields are named and typed.
  const { hashedPassword, verificationCode, codeExpiry, ...rest } = user;
  void hashedPassword;
  void verificationCode;
  void codeExpiry;
  return rest as Omit<T, (typeof SECRET_USER_FIELDS)[number]>;
}
