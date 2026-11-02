// Dinero en centavos enteros: 0.1 + 0.2 no debe dar 0.30000000000000004 en una colegiatura.

export const toCents = (amount) => Math.round(Number(amount) * 100);
export const fromCents = (cents) => cents / 100;

/** "Q650.00" con la moneda del colegio (schools.currency). */
export const formatMoney = (amount, currency) =>
  new Intl.NumberFormat('es-GT', { style: 'currency', currency }).format(amount);

/**
 * Reparte un pago entre cargos abiertos, del más antiguo al más reciente.
 * charges: [{ id, balance }] ya ordenados. Devuelve [{ chargeId, amount }] y lo que sobra.
 */
export function allocateOldestFirst(amount, charges) {
  let remaining = toCents(amount);
  const allocations = [];
  for (const charge of charges) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, toCents(charge.balance));
    if (take > 0) {
      allocations.push({ chargeId: charge.id, amount: fromCents(take) });
      remaining -= take;
    }
  }
  return { allocations, leftover: fromCents(remaining) };
}
