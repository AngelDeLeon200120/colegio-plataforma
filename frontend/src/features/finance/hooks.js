import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from './api';

export const financeKeys = {
  all: ['finance'],
  family: (studentId) => ['finance', 'family', String(studentId)],
  admin: (studentId) => ['finance', 'admin', String(studentId)],
  portfolio: (q) => ['finance', 'portfolio', q ?? ''],
  concepts: ['finance', 'concepts'],
};

export function useFamilyStatement(studentId) {
  return useQuery({
    queryKey: financeKeys.family(studentId),
    queryFn: () => financeApi.familyStatement(studentId),
    enabled: Boolean(studentId),
  });
}

export function useAdminStatement(studentId) {
  return useQuery({ queryKey: financeKeys.admin(studentId), queryFn: () => financeApi.adminStatement(studentId) });
}

export function usePortfolio(q) {
  return useQuery({ queryKey: financeKeys.portfolio(q), queryFn: () => financeApi.portfolio(q), placeholderData: (previous) => previous });
}

export function useConcepts() {
  return useQuery({ queryKey: financeKeys.concepts, queryFn: financeApi.concepts });
}

/** Cualquier movimiento cambia saldos en la cartera y en el estado de cuenta. */
function useFinanceMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }) });
}

export const useRegisterPayment = () => useFinanceMutation(financeApi.registerPayment);
export const useAttachReceipt = () => useFinanceMutation(({ paymentId, file }) => financeApi.attachReceipt(paymentId, file));
export const useReversePayment =() => useFinanceMutation(({ paymentId, reason }) => financeApi.reversePayment(paymentId, reason));
export const useVoidCharge = () => useFinanceMutation(financeApi.voidCharge);
export const useGenerateCharges = () => useFinanceMutation(financeApi.generateCharges);
