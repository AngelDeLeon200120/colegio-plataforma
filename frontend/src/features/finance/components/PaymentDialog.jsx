import { useId, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { formatMoney } from '@/lib/format';
import { useRegisterPayment } from '../hooks';
import { METHOD_LABELS, previewAllocation } from '../model';

const inputClass =
  'h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none';

const toNumber = (text) => Number(String(text).replace(',', '.'));
const todayInput = () => new Date().toLocaleDateString('en-CA');

/** Caja: registrar un pago. Muestra a qué cargos se aplicará antes de confirmar. */
export function PaymentDialog({ statement, onClose }) {
  const { student, summary, charges, school } = statement;
  const open = charges.filter((charge) => charge.status !== 'VOID' && charge.balance > 0);

  const [amount, setAmount] = useState(String(summary.overdue || summary.nextDue?.amount || summary.totalDue || ''));
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayInput());
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(null);
  const register = useRegisterPayment();
  const ids = { amount: useId(), method: useId(), reference: useId(), date: useId(), notes: useId() };

  const value = toNumber(amount);
  const valid = value > 0 && Number.isFinite(value);
  const preview = valid ? previewAllocation(value, open) : null;
  const overpaid = preview && preview.leftover > 0;
  const needsReference = method !== 'CASH';

  const submit = async (event) => {
    event.preventDefault();
    if (!valid || overpaid) return;
    try {
      // Hora actual si el pago es de hoy; si se registra uno atrasado, mediodía de ese día
      const paidAt = paidOn === todayInput() ? new Date() : new Date(`${paidOn}T12:00:00`);
      const result = await register.mutateAsync({
        studentId: student.id,
        amount: value,
        method,
        reference: reference.trim() || undefined,
        paidAt: paidAt.toISOString(),
        notes: notes.trim() || undefined,
      });
      setDone(result);
    } catch {
      // el error se muestra desde la mutación
    }
  };

  if (done) {
    return (
      <Dialog open onClose={onClose} title="Pago registrado" footer={<Button variant="primary" onClick={onClose}>Listo</Button>}>
        <p className="flex items-start gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>
            Se registró el recibo <span className="font-mono font-semibold">{done.receiptNumber}</span> por {formatMoney(value, school.currency)}.{' '}
            {done.notifiedGuardians > 0
              ? 'La familia recibió una notificación.'
              : 'El estudiante no tiene encargados registrados: entrega el recibo impreso.'}
          </span>
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Registrar pago"
      description={`${student.firstName} ${student.lastName} · saldo ${formatMoney(summary.totalDue, school.currency)}`}
      footer={
        <>
          <Button onClick={onClose} disabled={register.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="payment-form" variant="primary" loading={register.isPending} disabled={!valid || overpaid}>
            Registrar {valid && formatMoney(value, school.currency)}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        {register.error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {register.error.message}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.amount} className="block text-sm font-medium text-zinc-700">
              Monto
            </label>
            <input id={ids.amount} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" data-autofocus className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.method} className="block text-sm font-medium text-zinc-700">
              Forma de pago
            </label>
            <select id={ids.method} value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              {Object.entries(METHOD_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.reference} className="block text-sm font-medium text-zinc-700">
              Referencia {!needsReference && <span className="font-normal text-zinc-400">(opcional)</span>}
            </label>
            <input
              id={ids.reference}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={needsReference ? 'N.º de boleta o transacción' : ''}
              maxLength={100}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.date} className="block text-sm font-medium text-zinc-700">
              Fecha del pago
            </label>
            <input id={ids.date} type="date" value={paidOn} max={todayInput()} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.notes} className="block text-sm font-medium text-zinc-700">
            Nota <span className="font-normal text-zinc-400">(opcional)</span>
          </label>
          <input id={ids.notes} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={inputClass} />
        </div>

        {preview && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <p className="mb-1.5 text-xs font-medium text-zinc-500">Se aplicará a (del más antiguo al más reciente)</p>
            {preview.allocations.length === 0 && <p className="text-zinc-500">No hay cargos pendientes.</p>}
            <ul className="space-y-1">
              {preview.allocations.map(({ charge, amount: part }) => (
                <li key={charge.id} className="flex justify-between gap-3">
                  <span>
                    {charge.description}
                    {part < charge.balance && <span className="text-zinc-500"> (abono)</span>}
                  </span>
                  <span className="tabular-nums">{formatMoney(part, school.currency)}</span>
                </li>
              ))}
            </ul>
            {overpaid && (
              <p className="mt-2 text-red-600">
                El pago supera el saldo por {formatMoney(preview.leftover, school.currency)}. No se aceptan pagos a cuenta de cargos futuros.
              </p>
            )}
          </div>
        )}
      </form>
    </Dialog>
  );
}
