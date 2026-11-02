import { cn } from '@/lib/cn';

/** Familias con más de un estudiante: elegir de quién ver las tareas. */
export function StudentSwitcher({ students, studentId, onChange }) {
  if (students.length < 2) return null;
  return (
    <div role="tablist" aria-label="Estudiante" className="flex flex-wrap gap-1.5">
      {students.map((child) => (
        <button
          key={child.id}
          type="button"
          role="tab"
          aria-selected={child.id === studentId}
          onClick={() => onChange(child.id)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
            child.id === studentId ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
          )}
        >
          {child.firstName}
        </button>
      ))}
    </div>
  );
}
