import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Check, FileImage, FileText, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormError } from '@/components/ui/Field';
import { openFile } from '@/lib/apiClient';
import { formatDate, formatMoney, formatRelative } from '@/lib/format';
import { useConfirmReported, useRejectReported, useReportedPayments } from '../hooks';
import { METHOD_LABELS } from '../model';

function OpenReceipt({ file }) {
  const [opening, setOpening] = useState(false);
  const Icon = file.mimeType === 'application/pdf' ? FileText : FileImage;
  return (
    <Button
      size="sm"
      onClick={async () => {
        setOpening(true);
        try {
          await openFile(file.id);
        } finally {
          setOpening(false);
        }
      }}
    >
      {opening ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />} Ver comprobante
    </Button>
  );
}

function RejectDialog({ payment, onClose }) {
  const [reason, setReason] = useState('');
  const reject = useRejectReported();
  return (
    <Dialog
      open
      onClose={onClose}
      title="Rechazar pago reportado"
      description={`${formatMoney(payment.amount)} · Ref. ${payment.reference ?? '—'}. La familia recibirá el motivo.`}
      footer={
        <>
          <Button onClick={onClose} disabled={reject.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            className="bg-red-600 hover:bg-red-700"
            disabled={reason.trim().length < 5}
            loading={reject.isPending}
            onClick={() => reject.mutate({ paymentId: payment.id, reason: reason.trim() }, { onSuccess: onClose })}
          >
            Rechazar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError error={reject.error} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-700">Motivo</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={300}
            data-autofocus
            placeholder="Ej. No aparece en el estado de cuenta del banco; el monto no coincide"
            className="block w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
          />
        </label>
      </div>
    </Dialog>
  );
}

/** Confirmar / Rechazar un pago reportado (en la lista y en el estado de cuenta del estudiante). */
export function ReportedPaymentActions({ payment }) {
  const confirm = useConfirmReported();
  const [rejecting, setRejecting] = useState(false);
  const [asking, setAsking] = useState(false);
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex flex-wrap justify-end gap-1.5">
        {asking ? (
          <>
            <Button size="sm" variant="primary" loading={confirm.isPending} onClick={() => confirm.mutate(payment.id, { onSettled: () => setAsking(false) })}>
              <Check className="size-3.5" /> Sí, está en el banco
            </Button>
            <Button size="sm" onClick={() => setAsking(false)} disabled={confirm.isPending}>
              No
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" onClick={() => setAsking(true)}>
              <Check className="size-3.5" /> Confirmar
            </Button>
            <Button size="sm" onClick={() => setRejecting(true)} className="text-red-600 hover:bg-red-50">
              <X className="size-3.5" /> Rechazar
            </Button>
          </>
        )}
      </span>
      {confirm.error && <span className="max-w-xs text-right text-xs text-red-600">{confirm.error.message}</span>}
      {rejecting && <RejectDialog payment={payment} onClose={() => setRejecting(false)} />}
    </span>
  );
}

/** Pagos reportados por familias que esperan verificación contra el banco. */
export function ReportedPaymentsPanel({ focus }) {
  const { data = [], isLoading } = useReportedPayments();
  const ref = useRef(null);
  useEffect(() => {
    if (focus && data.length) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focus, data.length]);

  if (isLoading || data.length === 0) return null;
  return (
    <section ref={ref} className="mt-6 scroll-mt-4 rounded-xl border border-amber-200 bg-amber-50/50 shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-amber-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-amber-900">Pagos por verificar · {data.length}</h2>
        <p className="text-xs text-amber-800">Reportados por las familias. Compáralos con el estado de cuenta del banco.</p>
      </header>
      <ul className="divide-y divide-amber-100">
        {data.map((payment) => (
          <li key={payment.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-white/60 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900">
                {formatMoney(payment.amount)} · {METHOD_LABELS[payment.method]}
                <span className="font-normal text-zinc-500"> · Ref. {payment.reference ?? '—'}</span>
              </p>
              <p className="text-xs text-zinc-500">
                <Link to={`/admin/finance/${payment.student.id}`} className="font-medium text-brand-700 hover:underline">
                  {payment.student.lastName}, {payment.student.firstName}
                </Link>{' '}
                · pagado el {formatDate(new Date(payment.paidAt).toISOString())} · reportado {formatRelative(payment.reportedAt)}
                {payment.reportedBy && ` por ${payment.reportedBy}`}
              </p>
              {payment.notes && <p className="text-xs text-zinc-600">“{payment.notes}”</p>}
            </div>
            {payment.receiptFile && <OpenReceipt file={payment.receiptFile} />}
            <ReportedPaymentActions payment={payment} />
          </li>
        ))}
      </ul>
    </section>
  );
}
