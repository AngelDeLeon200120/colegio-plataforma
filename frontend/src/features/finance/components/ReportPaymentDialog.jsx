import { useId, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { formatMoney } from '@/lib/format';
import { useReportPayment } from '../hooks';
import { METHOD_LABELS } from '../model';
import { BankEmailAutofill } from './PaymentDialog';
import { ReceiptPicker, receiptProblem } from './ReceiptPicker';

const inputClass =
  'h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none';

// La familia no reporta efectivo: eso se paga en caja
const FAMILY_METHODS = ['TRANSFER', 'DEPOSIT', 'ONLINE', 'CARD'];
const todayInput = () => new Date().toLocaleDateString('en-CA');
const toNumber = (text) => Number(String(text).replace(',', '.'));

/**
 * Familia: reportar un pago hecho en el banco, con la foto o PDF de la boleta.
 * Queda "en verificación": el saldo cambia cuando la administración lo confirma.
 */
export function ReportPaymentDialog({ statement, onClose }) {
  const { student, summary, school } = statement;
  const [amount, setAmount] = useState(String(summary.overdue || summary.nextDue?.amount || summary.totalDue || ''));
  const [method, setMethod] = useState('TRANSFER');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayInput());
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [fileProblem, setFileProblem] = useState(null);
  const [showProblems, setShowProblems] = useState(false);
  const [done, setDone] = useState(false);
  const report = useReportPayment();
  const ids = { amount: useId(), method: useId(), reference: useId(), date: useId(), notes: useId() };

  const value = toNumber(amount);
  const problems = [
    !(value > 0 && Number.isFinite(value)) && 'Escribe el monto que pagaste.',
    !reference.trim() && 'Escribe el número de boleta, autorización o transacción.',
    !paidOn && 'Indica la fecha del pago.',
    !file && 'Adjunta la foto o PDF del comprobante.',
  ].filter(Boolean);

  const submit = (event) => {
    event.preventDefault();
    if (problems.length) return setShowProblems(true);
    report.mutate(
      { studentId: student.id, amount: value, method, reference: reference.trim(), paidOn, notes: notes.trim(), file },
      { onSuccess: () => setDone(true) },
    );
  };

  if (done) {
    return (
      <Dialog open onClose={onClose} title="Pago reportado" footer={<Button variant="primary" onClick={onClose}>Listo</Button>}>
        <p className="flex items-start gap-2 text-sm text-zinc-700">
          <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>
            Enviamos tu comprobante de {formatMoney(value, school.currency)}. La administración lo verificará con el banco; te avisaremos cuando quede confirmado y se
            aplique a tu saldo.
          </span>
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reportar un pago"
      description={`${student.firstName} ${student.lastName} · ¿Pagaste en el banco? Envía el comprobante y lo verificamos.`}
      className="max-w-lg"
      footer={
        <>
          {showProblems && problems.length > 0 && (
            <p role="alert" className="mr-auto flex items-center gap-1.5 self-center text-xs text-red-600">
              <AlertCircle className="size-3.5 shrink-0" /> {problems[0]}
            </p>
          )}
          <Button onClick={onClose} disabled={report.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="report-payment-form" variant="primary" loading={report.isPending}>
            Enviar comprobante
          </Button>
        </>
      }
    >
      <form id="report-payment-form" onSubmit={submit} className="space-y-4">
        {report.error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {report.error.message}
          </p>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-zinc-700">Comprobante</p>
          <ReceiptPicker
            file={file}
            problem={fileProblem}
            label="Toma una foto o adjunta el PDF de la boleta"
            onChange={(next) => {
              const issue = next ? receiptProblem(next) : null;
              setFileProblem(issue);
              setFile(next && !issue ? next : null);
            }}
          />
        </div>

        <BankEmailAutofill
          currency={school.currency}
          onApply={(found) => {
            if (found.amount) setAmount(String(found.amount));
            if (found.method && FAMILY_METHODS.includes(found.method)) setMethod(found.method);
            if (found.reference) setReference(found.reference);
            if (found.paidOn) setPaidOn(found.paidOn);
          }}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.amount} className="block text-sm font-medium text-zinc-700">
              Monto pagado
            </label>
            <input id={ids.amount} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.method} className="block text-sm font-medium text-zinc-700">
              Forma de pago
            </label>
            <select id={ids.method} value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              {FAMILY_METHODS.map((key) => (
                <option key={key} value={key}>
                  {METHOD_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.reference} className="block text-sm font-medium text-zinc-700">
              N.º de boleta o transacción
            </label>
            <input id={ids.reference} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} className={inputClass} />
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
          <input id={ids.notes} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ej. colegiatura de noviembre" className={inputClass} />
        </div>

        <p className="flex items-start gap-2 text-xs text-zinc-500">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          Tu saldo se actualiza cuando la administración confirme el pago con el banco.
        </p>
      </form>
    </Dialog>
  );
}
