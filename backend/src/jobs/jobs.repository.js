import { pool } from '../config/database.js';
import { BaseRepository } from '../core/db/BaseRepository.js';

/** Colegios a los que se les ejecutan tareas. Fuera de contexto de tenant a propósito. */
export async function listSchoolsForJobs() {
  const [rows] = await pool.execute(`SELECT id, timezone FROM schools WHERE status IN ('ACTIVE', 'TRIAL')`);
  return rows.map((row) => ({ id: row.id, timezone: row.timezone }));
}

class JobRunsRepository extends BaseRepository {
  /**
   * Candado: inserta (job, colegio, run_key). Si ya existe, otra réplica la está
   * ejecutando o ya terminó hoy → devuelve null y no se ejecuta otra vez.
   */
  async tryStart(jobName, runKey) {
    try {
      const result = await this.query(
        `INSERT INTO job_runs (school_id, job_name, run_key, status) VALUES (?, ?, ?, 'RUNNING')`,
        [this.schoolId, jobName, runKey],
      );
      return result.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return null;
      throw err;
    }
  }

  async finish(runId, { status, stats = null, error = null }) {
    await this.query(
      `UPDATE job_runs SET status = ?, stats = ?, error = ?, finished_at = UTC_TIMESTAMP() WHERE school_id = ? AND id = ?`,
      [status, stats && JSON.stringify(stats), error, this.schoolId, runId],
    );
  }

  async listRecent(jobName, limit = 30) {
    const rows = await this.query(
      `SELECT id, job_name, run_key, status, stats, error, started_at, finished_at
         FROM job_runs WHERE school_id = ? ${jobName ? 'AND job_name = ?' : ''}
        ORDER BY id DESC LIMIT ${Number(limit)}`,
      jobName ? [this.schoolId, jobName] : [this.schoolId],
    );
    return rows.map((row) => ({
      id: row.id,
      job: row.job_name,
      runKey: row.run_key,
      status: row.status,
      stats: row.stats,
      error: row.error,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }));
  }
}

export const jobRunsRepository = new JobRunsRepository();
