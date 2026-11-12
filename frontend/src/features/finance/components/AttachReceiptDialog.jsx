import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormError } from '@/components/ui/Field';
import { formatMoney } from '@/lib/format';
import { useAttachReceipt } from '../hooks';
import { ReceiptPicker, receiptProblem } from './ReceiptPicker';

/** Adjuntar (o cambiar) la foto o PDF de la boleta de un pago ya registrado. */
export function AttachReceiptDialog({ payment, currency, onClose }) {
  const [file, setFile] = useState(null);
  const [problem, setProblem] = useState(null);
  const attach = useAttachReceipt();
  const replacing = Boolean(payment.receiptFile);

  return (
    <Dialog
      open
      onClose={onClose}
      title={replacing ? 'Cambiar comprobante' : 'Adjuntar comprobante'}
      description={`Recibo ${payment.receiptNumber} · ${formatMoney(payment.amount, currency)}`}
      footer={
        <>
          <Button onClick={onClose} disabled={attach.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!file} loading={attach.isPending} onClick={() => attach.mutate({ paymentId: payment.id, file }, { onSuccess: onClose })}>
            {replacing ? 'Cambiar' : 'Adjuntar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError error={attach.error} />
        {replacing && <p className="text-xs text-zinc-500">Ahora tiene: {payment.receiptFile.name}. El nuevo lo reemplaza.</p>}
        <ReceiptPicker
          file={file}
          problem={problem}
          onChange={(next) => {
            const issue = next ? receiptProblem(next) : null;
            setProblem(issue);
            setFile(next && !issue ? next : null);
          }}
        />
      </div>
    </Dialog>
  );
}
