import { cn } from '@/lib/cn';

/** Familias con más de un estudiante: elegir de quién ver las tareas. */
export function StudentSwitcher({ students, studentId, onChange }) {
  if (students.length < 2) return null;
  return (
    <div role="tablist" aria-label="Estudiante" className="flex gap-1 rounded-lg bg-zinc-100 p-0.5">
      {students.map((child) => (
        <button
          key={child.id}
          type="button"
          role="tab"
          aria-selected={child.id === studentId}
          onClick={() => onChange(child.id)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
            child.id === studentId ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900',
          )}
        >
          {child.firstName}
        </button>
      ))}
    </div>
  );
}
