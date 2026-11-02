import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './api';

export const adminKeys = {
  all: ['admin'],
  users: (params) => ['admin', 'users', params],
  students: (params) => ['admin', 'students', params],
  academic: ['admin', 'academic'],
};

export const useAdminUsers = (params) =>
  useQuery({ queryKey: adminKeys.users(params), queryFn: () => adminApi.users(params), placeholderData: (previous) => previous });

export const useAdminStudents = (params) =>
  useQuery({ queryKey: adminKeys.students(params), queryFn: () => adminApi.students(params), placeholderData: (previous) => previous });

export const useAcademicStructure = () => useQuery({ queryKey: adminKeys.academic, queryFn: adminApi.academic });

/**
 * Las altas y cambios de personas y estructura se reflejan en muchas pantallas
 * (cursos, cuadro de notas, cartera): se invalida todo lo cargado.
 */
export function useAdminMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries() });
}
