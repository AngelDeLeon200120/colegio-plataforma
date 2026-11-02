import { Link } from 'react-router';
import { Users } from 'lucide-react';

/** Tarjeta de curso estilo Classroom: franja de color con el curso y pie con accesos. */
export function CourseTile({ course, to, badge, children }) {
  const [section, subject] = course.name.includes(' · ') ? course.name.split(' · ') : [null, course.name];
  const color = course.color ?? '#1a73e8';

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-zinc-300 bg-white transition-shadow hover:shadow-card-hover">
      <div className="relative h-24 px-4 pt-3 text-white" style={{ backgroundColor: color }}>
        <Link to={to} className="block truncate text-[22px] leading-tight hover:underline after:absolute after:inset-0">
          {subject}
        </Link>
        {section && <p className="truncate text-sm text-white/90">{section}</p>}
        <span
          className="absolute right-4 -bottom-7 flex size-14 items-center justify-center rounded-full border-2 border-white text-xl font-medium text-white"
          style={{ backgroundColor: color, filter: 'brightness(0.85)' }}
          aria-hidden="true"
        >
          {subject.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex min-h-16 flex-1 flex-col justify-center gap-1 px-4 pt-4 pb-3 pr-20 text-sm text-zinc-600">
        <span className="flex items-center gap-1.5">
          <Users className="size-4" /> {course.studentCount} estudiantes
        </span>
        {badge}
      </div>
      {children && <div className="flex justify-end gap-1 border-t border-zinc-300 px-2 py-1.5">{children}</div>}
    </article>
  );
}
