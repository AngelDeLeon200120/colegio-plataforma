import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { formatDateTime, formatMoney } from '@/lib/format';
import { METHOD_LABELS } from '../model';

/** Recibo imprimible (o guardable como PDF desde el diálogo de impresión). */
export function ReceiptDialog({ payment, statement, onClose }) {
  const { student, school } = statement;
  const reversed = payment.status === 'REVERSED';

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Recibo ${payment.receiptNumber}`}
      className="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cerrar</Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Imprimir o guardar PDF
          </Button>
        </>
      }
    >
      <div className="print-area space-y-4 text-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-zinc-900">{school.name}</p>
            <p className="text-zinc-500">Recibo de pago</p>
          </div>
          <div className="text-right">
            <p className="font-mono font-semibold">{payment.receiptNumber}</p>
            <p className="text-zinc-500">{formatDateTime(payment.paidAt)}</p>
          </div>
        </div>

        {reversed && (
          <p className="rounded-md bg-red-50 px-3 py-2 font-semibold text-red-700 ring-1 ring-red-200">
            PAGO REVERTIDO: este recibo no es válido.
          </p>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-zinc-500">Estudiante</dt>
          <dd className="font-medium">
            {student.firstName} {student.lastName} <span className="font-mono text-zinc-500">({student.code})</span>
          </dd>
          {student.section && (
            <>
              <dt className="text-zinc-500">Sección</dt>
              <dd>{student.section}</dd>
            </>
          )}
          <dt className="text-zinc-500">Forma de pago</dt>
          <dd>
            {METHOD_LABELS[payment.method]}
            {payment.reference && <span className="text-zinc-500"> · Ref. {payment.reference}</span>}
          </dd>
          {payment.receivedBy && (
            <>
              <dt className="text-zinc-500">Recibido por</dt>
              <dd>{payment.receivedBy}</dd>
            </>
          )}
        </dl>

        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="py-1.5 font-medium">Aplicado a</th>
              <th className="py-1.5 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.map((allocation) => (
              <tr key={allocation.chargeId} className="border-b border-zinc-100">
                <td className="py-1.5">{allocation.description}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(allocation.amount, school.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-2 font-semibold">Total</td>
              <td className="pt-2 text-right text-base font-semibold tabular-nums">{formatMoney(payment.amount, school.currency)}</td>
            </tr>
          </tfoot>
        </table>

        {payment.notes && <p className="text-xs whitespace-pre-line text-zinc-500">{payment.notes}</p>}
      </div>
    </Dialog>
  );
}
