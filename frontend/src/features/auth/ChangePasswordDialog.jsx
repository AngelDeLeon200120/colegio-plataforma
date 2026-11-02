import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { adminApi } from '@/features/admin/api';

export function ChangePasswordDialog({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const change = useMutation({ mutationFn: adminApi.changeOwnPassword });

  const mismatch = repeat && next !== repeat;
  const valid = current && next.length >= 8 && next === repeat;

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
    } catch {
      // se muestra en el formulario
    }
  };

  if (change.isSuccess) {
    return (
      <Dialog open onClose={onClose} title="Contraseña actualizada" footer={<Button variant="primary" onClick={onClose}>Listo</Button>}>
        <p className="flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" /> Usa la nueva contraseña la próxima vez que inicies sesión.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Cambiar contraseña"
      footer={
        <>
          <Button onClick={onClose} disabled={change.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="password-form" variant="primary" loading={change.isPending} disabled={!valid}>
            Cambiar
          </Button>
        </>
      }
    >
      <form id="password-form" onSubmit={submit} className="space-y-4">
        <FormError error={change.error} />
        <Field label="Contraseña actual">
          {(id) => <input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-autofocus className={inputClass} />}
        </Field>
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
          {(id) => <input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Repite la nueva contraseña" hint={mismatch ? 'No coincide.' : undefined}>
          {(id) => <input id={id} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={Boolean(mismatch)} className={inputClass} />}
        </Field>
      </form>
    </Dialog>
  );
}
