import { useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronDown, FileImage, FileText, Loader2, Receipt, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { openFile } from '@/lib/apiClient';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { METHOD_LABELS, chargeState } from '../model';
import { ReceiptDialog } from './ReceiptDialog';

function SummaryCard({ icon: Icon, label, value, hint, tone = 'default' }) {
  return (
    <div className={cn('rounded-xl border bg-white p-4 shadow-xs', tone === 'danger' ? 'border-red-200' : 'border-zinc-200')}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className={cn('mt-1 text-xl font-semibold tracking-tight tabular-nums', tone === 'danger' ? 'text-red-600' : 'text-zinc-900')}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function ChargesTable({ charges, currency, renderActions }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-xs">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <th className="px-4 py-2 font-medium">Concepto</th>
            <th className="px-3 py-2 font-medium">Vence</th>
            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Total</th>
            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Pagado</th>
            <th className="px-3 py-2 text-right font-medium">Saldo</th>
            <th className="px-4 py-2 text-right font-medium">Estado</th>
            {renderActions && <th className="w-px px-2 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {charges.map((charge) => {
            const state = chargeState(charge);
            const total = charge.amount - charge.discount + charge.lateFee;
            return (
              <tr key={charge.id} className={cn(charge.status === 'VOID' && 'text-zinc-400 line-through')}>
                <td className="px-4 py-2.5">
                  <span className="block font-medium">{charge.description}</span>
                  {(charge.discount > 0 || charge.lateFee > 0) && (
                    <span className="block text-xs text-zinc-500 no-underline">
                      {charge.discount > 0 && `Descuento ${formatMoney(charge.discount, currency)}`}
                      {charge.discount > 0 && charge.lateFee > 0 && ' · '}
                      {charge.lateFee > 0 && `Mora ${formatMoney(charge.lateFee, currency)}`}
                    </span>
                  )}
                </td>
                <td className={cn('px-3 py-2.5 whitespace-nowrap', charge.isOverdue && 'font-medium text-red-600')}>{formatDate(charge.dueDate)}</td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{formatMoney(total, currency)}</td>
                <td className="hidden px-3 py-2.5 text-right text-zinc-500 tabular-nums sm:table-cell">{formatMoney(charge.paidAmount, currency)}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatMoney(charge.balance, currency)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Badge tone={state.tone}>{state.label}</Badge>
                </td>
                {renderActions && <td className="px-2 py-2.5 text-right">{renderActions(charge)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Estado de cuenta de un estudiante: lo usan la familia y la administración.
 * `renderChargeActions` / `renderPaymentActions` agregan los botones de administración.
 */
/** Abre la foto o PDF de la boleta en otra pestaña (URL firmada). */
function ReceiptFileButton({ file }) {
  const [state, setState] = useState({ opening: false, error: null });
  const Icon = file.mimeType === 'application/pdf' ? FileText : FileImage;
  return (
    <button
      type="button"
      title={state.error ?? `Ver comprobante: ${file.name}`}
      disabled={state.opening}
      onClick={async () => {
        setState({ opening: true, error: null });
        try {
          await openFile(file.id);
          setState({ opening: false, error: null });
        } catch (error) {
          setState({ opening: false, error: error.message });
        }
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-zinc-100',
        state.error ? 'text-red-600' : 'text-brand-700',
      )}
    >
      {state.opening ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />} Comprobante
    </button>
  );
}

export function StatementView({ statement, renderChargeActions, renderPaymentActions, isFamily = false }) {
  const [receipt, setReceipt] = useState(null);
  const { summary, charges, payments, school } = statement;
  const currency = school.currency;

  const open = charges.filter((charge) => charge.status !== 'VOID' && charge.balance > 0);
  const settled = charges.filter((charge) => !(charge.status !== 'VOID' && charge.balance > 0)).reverse();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={Wallet} label="Saldo pendiente" value={formatMoney(summary.totalDue, currency)} />
        <SummaryCard
          icon={AlertTriangle}
          label="Vencido"
          value={formatMoney(summary.overdue, currency)}
          tone={summary.overdue > 0 ? 'danger' : 'default'}
          hint={summary.overdue > 0 ? 'Requiere pago' : 'Al día'}
        />
        <SummaryCard
          icon={CalendarClock}
          label="Próximo vencimiento"
          value={summary.nextDue ? formatMoney(summary.nextDue.amount, currency) : '—'}
          hint={summary.nextDue ? `Vence el ${formatDate(summary.nextDue.date, { day: 'numeric', month: 'long' })}` : 'Nada pendiente'}
        />
      </div>

      {isFamily && summary.overdue > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Hay pagos vencidos por {formatMoney(summary.overdue, currency)}. Si ya pagaste, comunícate con la administración y ten a mano tu comprobante.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Por pagar</h2>
        {open.length ? (
          <ChargesTable charges={open} currency={currency} renderActions={renderChargeActions} />
        ) : (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">No hay saldos pendientes.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Pagos realizados</h2>
        {payments.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
            {payments.map((payment) => {
              const reversed = payment.status === 'REVERSED';
              const pending = payment.status === 'PENDING_VERIFICATION';
              // Un reporte de la familia que se rechazó nunca se aplicó a cargos
              const rejected = reversed && payment.allocations.length === 0 && /Rechazado/.test(payment.notes ?? '');
              const rejectReason = rejected ? payment.notes.split('\n').find((line) => line.startsWith('Rechazado'))?.replace(/^Rechazado[^:]*:\s*/, '') : null;
              return (
                <li key={payment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-medium', reversed && 'text-zinc-400 line-through')}>
                      {formatMoney(payment.amount, currency)} · {METHOD_LABELS[payment.method]}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {formatDateTime(payment.paidAt)} · {payment.receiptNumber}
                      {pending && payment.reference && ` · Ref. ${payment.reference}`}
                      {payment.allocations.length > 0 && ` · ${payment.allocations.map((a) => a.description).join(', ')}`}
                    </p>
                    {rejectReason && <p className="text-xs text-red-600">Motivo: {rejectReason}</p>}
                  </div>
                  {pending && <Badge tone="amber">En verificación</Badge>}
                  {rejected ? <Badge tone="red">Rechazado</Badge> : reversed && <Badge tone="red">Revertido</Badge>}
                  {payment.receiptFile && <ReceiptFileButton file={payment.receiptFile} />}
                  {payment.status === 'CONFIRMED' || (reversed && !rejected) ? (
                    <button
                      type="button"
                      onClick={() => setReceipt(payment)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      <Receipt className="size-3.5" /> Recibo
                    </button>
                  ) : null}
                  {renderPaymentActions?.(payment)}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {settled.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-zinc-900">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" /> Cargos pagados y anulados ({settled.length})
          </summary>
          <div className="mt-2">
            <ChargesTable charges={settled} currency={currency} renderActions={renderChargeActions} />
          </div>
        </details>
      )}

      {receipt && <ReceiptDialog payment={receipt} statement={statement} onClose={() => setReceipt(null)} />}
    </div>
  );
}
