import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { BaseRepository } from '../../core/db/BaseRepository.js';
import { servingTypeFor } from '../../core/security/fileSignature.js';
import { localStorageProvider } from '../../storage/local.provider.js';

// Cuando se agregue S3, el proveedor se elige en config/storage.js
const storage = localStorageProvider;

const FILE_TOKEN_AUDIENCE = 'file';
const FILE_URL_TTL_SECONDS = 300;

const toFile = (row) =>
  row && { id: row.id, schoolId: row.school_id, name: row.original_name, storageKey: row.storage_key, size: row.size_bytes };

class FilesRepository extends BaseRepository {
  async insert(file) {
    const result = await this.query(
      `INSERT INTO files (school_id, uploaded_by, provider, storage_key, original_name, mime_type, size_bytes, sha256, purpose)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.schoolId,
        file.uploadedBy,
        file.provider,
        file.storageKey,
        file.originalName,
        file.mimeType,
        file.size,
        file.sha256,
        file.purpose,
      ],
    );
    return result.insertId;
  }

  /**
   * El archivo solo se devuelve si el usuario tiene relación con él:
   * administración, quien lo subió, el docente del curso, el estudiante dueño
   * de la entrega o su familia; y para material de una actividad, la sección inscrita.
   */
  async findAccessible(user, fileId) {
    const guardianOf = (studentColumn) =>
      `EXISTS (SELECT 1 FROM guardian_students gs WHERE gs.school_id = f.school_id AND gs.student_id = ${studentColumn} AND gs.guardian_id = ?)`;

    const row = await this.one(
      `SELECT f.id, f.school_id, f.original_name, f.storage_key, f.size_bytes
         FROM files f
        WHERE f.school_id = ? AND f.id = ? AND f.deleted_at IS NULL AND (
              ? = 'ADMIN'
           OR f.uploaded_by = ?
           OR EXISTS (
                SELECT 1 FROM submission_attempt_files saf
                  JOIN submission_attempts sa ON sa.school_id = saf.school_id AND sa.id = saf.attempt_id
                  JOIN submissions s ON s.school_id = sa.school_id AND s.id = sa.submission_id
                  JOIN activities a  ON a.school_id = s.school_id AND a.id = s.activity_id
                  JOIN courses c     ON c.school_id = a.school_id AND c.id = a.course_id
                  JOIN students st   ON st.school_id = s.school_id AND st.id = s.student_id
                 WHERE saf.school_id = f.school_id AND saf.file_id = f.id
                   AND (c.teacher_id = ? OR st.user_id = ? OR ${guardianOf('s.student_id')}))
           OR EXISTS (
                SELECT 1 FROM activity_files af
                  JOIN activities a ON a.school_id = af.school_id AND a.id = af.activity_id
                  JOIN courses c    ON c.school_id = a.school_id AND c.id = a.course_id
                 WHERE af.school_id = f.school_id AND af.file_id = f.id
                   AND (c.teacher_id = ? OR EXISTS (
                         SELECT 1 FROM enrollments e
                           JOIN students st ON st.school_id = e.school_id AND st.id = e.student_id
                          WHERE e.school_id = c.school_id AND e.section_id = c.section_id AND e.status = 'ACTIVE'
                            AND (st.user_id = ? OR ${guardianOf('st.id')}))))
        )`,
      [this.schoolId, fileId, user.role, user.id, user.id, user.id, user.id, user.id, user.id, user.id],
    );
    return toFile(row);
  }

  /** Sin contexto de petición: el colegio viene firmado dentro del token del archivo. */
  async findBySchool(schoolId, fileId) {
    const row = await this.one(
      `SELECT id, school_id, original_name, storage_key, size_bytes FROM files
        WHERE school_id = ? AND id = ? AND deleted_at IS NULL`,
      [schoolId, fileId],
    );
    return toFile(row);
  }
}

const filesRepository = new FilesRepository();

export const filesService = {
  /** Guarda el archivo subido (multer, en memoria) y registra sus metadatos. Devuelve el id. */
  async store(user, file, purpose) {
    const extension = file.originalname.toLowerCase().split('.').pop();
    const storageKey = `schools/${user.schoolId}/${purpose.toLowerCase().replace(/_/g, '-')}/${randomUUID()}.${extension}`;

    await storage.putObject(storageKey, file.buffer);
    return filesRepository.insert({
      uploadedBy: user.id,
      provider: storage.name,
      storageKey,
      originalName: file.originalname.slice(0, 255),
      mimeType: file.mimetype.slice(0, 120),
      size: file.size,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      purpose,
    });
  },

  /** URL firmada de 5 minutos para abrir el archivo en una pestaña (un <a> no envía el token). */
  async createDownloadUrl(user, fileId) {
    const file = await filesRepository.findAccessible(user, fileId);
    if (!file) throw AppError.notFound('Archivo no encontrado');

    const token = jwt.sign({ sid: file.schoolId }, env.JWT_ACCESS_SECRET, {
      subject: String(file.id),
      audience: FILE_TOKEN_AUDIENCE,
      expiresIn: FILE_URL_TTL_SECONDS,
      algorithm: 'HS256',
    });
    return { url: `/api/v1/files/${file.id}/content?token=${token}`, expiresIn: FILE_URL_TTL_SECONDS };
  },

  async openSigned(fileId, token) {
    let payload;
    try {
      payload = jwt.verify(token ?? '', env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], audience: FILE_TOKEN_AUDIENCE });
    } catch (err) {
      throw err.name === 'TokenExpiredError'
        ? new AppError(410, 'LINK_EXPIRED', 'El enlace expiró. Vuelve a abrir el archivo desde la plataforma.')
        : new AppError(403, 'INVALID_LINK', 'Enlace de descarga inválido');
    }
    if (Number(payload.sub) !== fileId) throw new AppError(403, 'INVALID_LINK', 'Enlace de descarga inválido');

    const file = await filesRepository.findBySchool(Number(payload.sid), fileId);
    const object = file && (await storage.getObject(file.storageKey));
    if (!object) throw AppError.notFound('El archivo ya no está disponible');

    return { ...servingTypeFor(file.name), name: file.name, size: object.size, stream: object.stream };
  },
};
