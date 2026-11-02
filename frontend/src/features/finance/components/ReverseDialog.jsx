import { useId, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { formatMoney } from '@/lib/format';
import { useReversePayment } from '../hooks';

export function ReverseDialog({ payment, currency, onClose }) {
  const [reason, setReason] = useState('');
  const reverse = useReversePayment();
  const reasonId = useId();
  const valid = reason.trim().length >= 5;

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    try {
      await reverse.mutateAsync({ paymentId: payment.id, reason: reason.trim() });
      onClose();
    } catch {
      // el error se muestra desde la mutación
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Revertir ${payment.receiptNumber}`}
      description={`${formatMoney(payment.amount, currency)} volverán a quedar como saldo pendiente.`}
      footer={
        <>
          <Button onClick={onClose} disabled={reverse.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="reverse-form" variant="warning" loading={reverse.isPending} disabled={!valid}>
            Revertir pago
          </Button>
        </>
      }
    >
      <form id="reverse-form" onSubmit={submit} className="space-y-3">
        {reverse.error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {reverse.error.message}
          </p>
        )}
        <label htmlFor={reasonId} className="block text-sm font-medium text-zinc-700">
          Motivo
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={300}
          data-autofocus
          placeholder="ej. Cheque rechazado por el banco"
          className="block w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
        />
        <p className="text-xs text-zinc-500">El pago no se borra: queda en el historial marcado como revertido, con este motivo.</p>
      </form>
    </Dialog>
  );
}
