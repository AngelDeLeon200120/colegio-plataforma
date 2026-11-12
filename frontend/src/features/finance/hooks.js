import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { financeApi } from './api';

export const financeKeys = {
  all: ['finance'],
  family: (studentId) => ['finance', 'family', String(studentId)],
  admin: (studentId) => ['finance', 'admin', String(studentId)],
  portfolio: (q) => ['finance', 'portfolio', q ?? ''],
  concepts: ['finance', 'concepts'],
};

export function useFamilyStatement(studentId) {
  // Un pago confirmado o rechazado por la administración se ve sin recargar
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: financeKeys.all });
    socket.on('finance:status_changed', refresh);
    return () => socket.off('finance:status_changed', refresh);
  }, [queryClient]);
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
export const useReportPayment = () => useFinanceMutation(financeApi.reportPayment);
export const useConfirmReported = () => useFinanceMutation(financeApi.confirmReported);
export const useRejectReported = () => useFinanceMutation(({ paymentId, reason }) => financeApi.rejectReported(paymentId, reason));

/** Pagos que reportaron las familias y esperan verificación. Se refresca con cualquier movimiento. */
export function useReportedPayments() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: financeKeys.all });
    socket.on('finance:status_changed', refresh);
    return () => socket.off('finance:status_changed', refresh);
  }, [queryClient]);
  return useQuery({ queryKey: [...financeKeys.all, 'reported'], queryFn: financeApi.reportedPayments });
}

export const useAttachReceipt = () => useFinanceMutation(({ paymentId, file }) => financeApi.attachReceipt(paymentId, file));
export const useReversePayment = () => useFinanceMutation(({ paymentId, reason }) => financeApi.reversePayment(paymentId, reason));
export const useVoidCharge = () => useFinanceMutation(financeApi.voidCharge);
export const useGenerateCharges = () => useFinanceMutation(financeApi.generateCharges);
