// Genera el hash scrypt de una contraseña para seeds o altas manuales.
// Uso: npm run hash -- "<contraseña>"
import { hashPassword } from '../src/core/security/password.js';

const password = process.argv[2];
if (!password) {
  console.error('Uso: npm run hash -- "<contraseña>"');
  process.exit(1);
}

console.log(await hashPassword(password));
