// Reglas de las cuentas que el navegador revisa antes de enviar. Son las
// mismas que aplica players (players/src/accounts.rs): el servidor sigue
// siendo quien decide; esto solo le dice al jugador qué le falta mientras
// escribe, en vez de esperar a que el servidor lo rechace.

export const USERNAME_MIN_LEN = 3;
export const USERNAME_MAX_LEN = 20;
export const PASSWORD_MIN_LEN = 8;

// El servidor solo acepta letras ASCII: no hay acentos, eñes ni espacios.
const USERNAME_CHARS = /^[A-Za-z0-9_]*$/;

export type UsernameProblem = 'TOO_SHORT' | 'TOO_LONG' | 'BAD_CHARS';

// charCount cuenta caracteres como lo hace el servidor (no unidades UTF-16).
export function charCount(text: string): number {
  return [...text].length;
}

// usernameProblem dice por qué un usuario no sirve, o null si sirve. Los
// caracteres raros van primero: un espacio es lo que más cuesta ver.
export function usernameProblem(username: string): UsernameProblem | null {
  if (!USERNAME_CHARS.test(username)) return 'BAD_CHARS';
  const length = charCount(username);
  if (length < USERNAME_MIN_LEN) return 'TOO_SHORT';
  if (length > USERNAME_MAX_LEN) return 'TOO_LONG';
  return null;
}

// passwordMissing cuenta cuántos caracteres le faltan a la contraseña.
export function passwordMissing(password: string): number {
  return Math.max(0, PASSWORD_MIN_LEN - charCount(password));
}
