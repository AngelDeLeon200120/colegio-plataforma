// Fragmentos SQL de visibilidad por rol, compartidos por reuniones y calendario.
// Cada función devuelve { sql, params } para incrustar en un WHERE.

const enrolledSection = (sectionColumn) => `
  EXISTS (SELECT 1 FROM enrollments e
            JOIN students st ON st.school_id = e.school_id AND st.id = e.student_id
           WHERE e.school_id = ${sectionColumn.split('.')[0]}.school_id AND e.section_id = ${sectionColumn} AND e.status = 'ACTIVE'
             AND (st.user_id = ? OR EXISTS (SELECT 1 FROM guardian_students gs
                                              WHERE gs.school_id = st.school_id AND gs.student_id = st.id AND gs.guardian_id = ?)))`;

/** Cursos que ve la persona. `alias` es el alias de `courses` en la consulta. */
export function courseVisibility(user, alias = 'c') {
  if (user.role === 'ADMIN') return { sql: 'TRUE', params: [] };
  if (user.role === 'TEACHER') return { sql: `${alias}.teacher_id = ?`, params: [user.id] };
  return { sql: enrolledSection(`${alias}.section_id`), params: [user.id, user.id] };
}

/**
 * Secciones que ve la persona. Docente: donde dicta algún curso o es guía.
 * `column` es la columna section_id a evaluar (ej. 'ev.section_id').
 */
export function sectionVisibility(user, column) {
  if (user.role === 'ADMIN') return { sql: 'TRUE', params: [] };
  const table = column.split('.')[0];
  if (user.role === 'TEACHER') {
    return {
      sql: `(EXISTS (SELECT 1 FROM courses vc WHERE vc.school_id = ${table}.school_id AND vc.section_id = ${column} AND vc.teacher_id = ? AND vc.is_active = 1)
          OR EXISTS (SELECT 1 FROM sections vs WHERE vs.school_id = ${table}.school_id AND vs.id = ${column} AND vs.homeroom_teacher_id = ?))`,
      params: [user.id, user.id],
    };
  }
  return { sql: enrolledSection(column), params: [user.id, user.id] };
}
