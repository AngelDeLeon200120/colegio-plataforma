export const METHOD_LABELS = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  DEPOSIT: 'Depósito',
  ONLINE: 'Pago en línea',
};

/** Etiqueta y tono de un cargo, pensando en lo que la familia necesita saber. */
export function chargeState(charge) {
  if (charge.status === 'VOID') return { label: 'Anulado', tone: 'neutral' };
  if (charge.status === 'PAID') return { label: 'Pagado', tone: 'green' };
  if (charge.isOverdue) return { label: charge.paidAmount > 0 ? 'Vencido · abonado' : 'Vencido', tone: 'red' };
  if (charge.status === 'PARTIAL') return { label: 'Abonado', tone: 'blue' };
  return { label: 'Pendiente', tone: 'neutral' };
}

const toCents = (amount) => Math.round(Number(amount) * 100);

/** Mismo reparto que el servidor (del cargo más antiguo al más reciente), para previsualizar. */
export function previewAllocation(amount, charges) {
  let remaining = toCents(amount);
  const allocations = [];
  for (const charge of charges) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, toCents(charge.balance));
    if (take > 0) {
      allocations.push({ charge, amount: take / 100 });
      remaining -= take;
    }
  }
  return { allocations, leftover: remaining / 100 };
}
