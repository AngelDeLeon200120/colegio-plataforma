import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { adminApi } from '../api';
import { useAdminMutation } from '../hooks';

export const ROLE_LABELS = { TEACHER: 'Docente', PARENT: 'Familia', ADMIN: 'Administración', STUDENT: 'Estudiante' };

/** Alta o edición de docentes, familias y administración. `user` null = alta. */
export function UserDialog({ user, role, onClose, onCreated }) {
  const editing = Boolean(user);
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
  });
  const save = useAdminMutation((body) => (editing ? adminApi.updateUser(user.id, body) : adminApi.createUser({ role, ...body })));
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const valid = form.firstName.trim() && form.lastName.trim() && /\S+@\S+\.\S+/.test(form.email);

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    try {
      const body = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim() };
      if (form.phone.trim() || editing) body.phone = form.phone.trim() || (editing ? null : undefined);
      const result = await save.mutateAsync(body);
      if (editing) onClose();
      else onCreated(result);
    } catch {
      // el error se muestra en el formulario
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? `Editar ${user.firstName}` : `Nuevo usuario · ${ROLE_LABELS[role]}`}
      description={editing ? undefined : 'Se generará una contraseña temporal para entregarle.'}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" variant="primary" loading={save.isPending} disabled={!valid}>
            {editing ? 'Guardar' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <FormError error={save.error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombres">{(id) => <input id={id} value={form.firstName} onChange={set('firstName')} maxLength={80} data-autofocus className={inputClass} />}</Field>
          <Field label="Apellidos">{(id) => <input id={id} value={form.lastName} onChange={set('lastName')} maxLength={80} className={inputClass} />}</Field>
        </div>
        <Field label="Correo" hint="Con este correo inicia sesión.">
          {(id) => <input id={id} type="email" value={form.email} onChange={set('email')} maxLength={190} className={inputClass} />}
        </Field>
        <Field label="Teléfono" optional>
          {(id) => <input id={id} type="tel" value={form.phone} onChange={set('phone')} maxLength={30} className={inputClass} />}
        </Field>
      </form>
    </Dialog>
  );
}
