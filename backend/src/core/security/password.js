import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

// Parámetros recomendados por OWASP para scrypt. Viajan dentro del hash,
// así que se pueden endurecer después sin invalidar contraseñas existentes.
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

/** Formato: scrypt$N$r$p$salt$hash (base64url) */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: MAX_MEMORY });
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password, stored) {
  const [algorithm, N, r, p, salt, hash] = String(stored).split('$');
  if (algorithm !== 'scrypt' || !hash) return false;

  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEMORY,
  });
  return timingSafeEqual(actual, expected);
}

// Sin caracteres que se confunden al dictarlos o leerlos (0/O, 1/l/I)
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** Contraseña temporal para entregar a la persona (se muestra una sola vez). */
export function generateTemporaryPassword(length = 10) {
  return Array.from({ length }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('');
}

let dummyHash = null;

/**
 * Hash para comparar cuando el usuario no existe: el login tarda lo mismo
 * y no revela qué correos están registrados.
 */
export async function getDummyHash() {
  dummyHash ??= await hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
