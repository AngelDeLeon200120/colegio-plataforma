import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { StudentSwitcher } from '@/features/homework/components/StudentSwitcher';
import { useViewedStudent } from '@/features/homework/hooks';
import { StatementView } from '../components/StatementView';
import { useFamilyStatement } from '../hooks';

export function FamilyFinancePage() {
  const { children, studentId, selectStudent } = useViewedStudent();
  const { data, isLoading, isError, error } = useFamilyStatement(studentId);

  return (
    <div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-normal text-zinc-900">Pagos {data && `de ${data.student.firstName}`}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Estado de cuenta, próximos vencimientos e historial de pagos.</p>
        </div>
        <StudentSwitcher students={children} studentId={studentId} onChange={selectStudent} />
      </header>

      {!studentId && <p className="text-sm text-zinc-500">Tu cuenta aún no está vinculada a ningún estudiante.</p>}
      {isError && (
        <p className="flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle className="size-4" /> {error.message}
        </p>
      )}
      {isLoading && studentId && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}
      {data && <StatementView statement={data} isFamily />}
    </div>
  );
}
