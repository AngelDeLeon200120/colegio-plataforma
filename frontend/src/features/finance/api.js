import { api } from '@/lib/apiClient';

export const financeApi = {
  // Familia
  familyStatement: (studentId) => api(`/me/finance?studentId=${studentId}`),

  // Administración
  portfolio: (q) => api(`/finance/students${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  adminStatement: (studentId) => api(`/finance/students/${studentId}`),
  concepts: () => api('/finance/fee-concepts'),
  generateCharges: (body) => api('/finance/charges/generate', { method: 'POST', body }),
  voidCharge: (chargeId) => api(`/finance/charges/${chargeId}/void`, { method: 'POST' }),
  registerPayment: (body) => api('/finance/payments', { method: 'POST', body }),
  attachReceipt(paymentId, file) {
    const form = new FormData();
    form.append('file', file);
    return api(`/finance/payments/${paymentId}/receipt`, { method: 'POST', body: form });
  },
  reversePayment: (paymentId, reason) => api(`/finance/payments/${paymentId}/reverse`, { method: 'POST', body: { reason } }),
};
