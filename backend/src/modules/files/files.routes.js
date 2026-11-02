import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../core/middleware/validate.js';
import { filesService } from './files.service.js';

const fileParams = z.object({ fileId: z.coerce.number().int().positive() });

// Con sesión: pide una URL firmada para un archivo al que el usuario tiene acceso
export const filesRouter = Router();

filesRouter.get('/files/:fileId/url', validate({ params: fileParams }), async (req, res) => {
  res.json({ data: await filesService.createDownloadUrl(req.user, req.valid.params.fileId) });
});

// Sin sesión: el permiso viaja en el token firmado de la URL (5 minutos, un archivo)
export const publicFilesRouter = Router();

publicFilesRouter.get(
  '/files/:fileId/content',
  validate({ params: fileParams, query: z.object({ token: z.string().max(2000) }) }),
  async (req, res) => {
    const file = await filesService.openSigned(req.valid.params.fileId, req.valid.query.token);
    const disposition = file.inline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', file.size);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${file.name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Aunque se abra en una pestaña, el archivo no puede ejecutar nada
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");

    file.stream.on('error', (err) => res.destroy(err));
    file.stream.pipe(res);
  },
);
