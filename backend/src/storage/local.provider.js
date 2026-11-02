import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

const root = path.resolve(env.UPLOADS_DIR);

// Las claves las genera el servidor (schools/{id}/{propósito}/{uuid}.ext),
// pero se valida igual que no escapen de la carpeta raíz.
function resolveKey(key) {
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep)) throw new Error(`Clave de almacenamiento inválida: ${key}`);
  return target;
}

export const localStorageProvider = {
  name: 'LOCAL',

  async putObject(key, buffer) {
    const target = resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
  },

  /** { size, stream } o null si el archivo ya no existe en disco. */
  async getObject(key) {
    const target = resolveKey(key);
    try {
      const { size } = await stat(target);
      return { size, stream: createReadStream(target) };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  },
};
