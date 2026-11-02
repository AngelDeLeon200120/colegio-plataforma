import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, Ban, Banknote, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { PaymentDialog } from '../components/PaymentDialog';
import { ReverseDialog } from '../components/ReverseDialog';
import { StatementView } from '../components/StatementView';
import { useAdminStatement, useVoidCharge } from '../hooks';

export function AdminStudentFinancePage() {
  const { studentId } = useParams();
  const { data, isLoading, isError, error } = useAdminStatement(studentId);
  const voidCharge = useVoidCharge();
  const [paying, setPaying] = useState(false);
  const [reversing, setReversing] = useState(null);
  const [confirmVoid, setConfirmVoid] = useState(null);

  return (
    <div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6 sm:px-6">
      <Link to="/admin/finance" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Cartera
      </Link>

      {isError && (
        <p className="mt-4 flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle className="size-4" /> {error.message}
        </p>
      )}
      {isLoading && <Skeleton className="mt-4 h-64 w-full rounded-xl" />}

      {data && (
        <>
          <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
                {data.student.firstName} {data.student.lastName}
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                <span className="font-mono">{data.student.code}</span>
                {data.student.section && ` · ${data.student.section}`}
              </p>
            </div>
            <Button variant="primary" onClick={() => setPaying(true)} disabled={data.summary.totalDue <= 0}>
              <Banknote className="size-3.5" /> Registrar pago
            </Button>
          </header>

          {voidCharge.error && <p className="mb-3 text-sm text-red-600">{voidCharge.error.message}</p>}

          <StatementView
            statement={data}
            renderChargeActions={(charge) =>
              charge.status !== 'VOID' &&
              charge.paidAmount === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirmVoid !== charge.id) return setConfirmVoid(charge.id);
                    voidCharge.mutate(charge.id, { onSettled: () => setConfirmVoid(null) });
                  }}
                  title="Anular cargo"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs whitespace-nowrap text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                >
                  <Ban className="size-3.5" />
                  {confirmVoid === charge.id ? '¿Anular?' : <span className="sr-only">Anular</span>}
                </button>
              )
            }
            renderPaymentActions={(payment) =>
              payment.status !== 'REVERSED' && (
                <button
                  type="button"
                  onClick={() => setReversing(payment)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                >
                  <Undo2 className="size-3.5" /> Revertir
                </button>
              )
            }
          />

          {paying && <PaymentDialog statement={data} onClose={() => setPaying(false)} />}
          {reversing && <ReverseDialog payment={reversing} currency={data.school.currency} onClose={() => setReversing(null)} />}
        </>
      )}
    </div>
  );
}
