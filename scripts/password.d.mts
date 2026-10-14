export const USERNAME_PATTERN: RegExp;
export function hashPassword(password: string): Promise<string>;
export function verifyPassword(password: string, stored: string): Promise<boolean>;
