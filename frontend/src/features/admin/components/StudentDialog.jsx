import { useState } from 'react';
import { Link2, Trash2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { adminApi } from '../api';
import { useAcademicStructure, useAdminMutation, useAdminUsers } from '../hooks';

const RELATIONSHIPS = { MOTHER: 'Madre', FATHER: 'Padre', GUARDIAN: 'Encargado(a)', OTHER: 'Otro' };

function Section({ title, children }) {
  return (
    <section className="space-y-2 border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {children}
    </section>
  );
}

/** Alta de estudiante: expediente, sección y (opcional) cuenta con contraseña temporal. */
export function NewStudentDialog({ onClose, onCreated }) {
  const { data: structure } = useAcademicStructure();
  const [form, setForm] = useState({ code: '', firstName: '', lastName: '', birthDate: '', sectionId: '', email: '' });
  const create = useAdminMutation(adminApi.createStudent);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const valid = form.code.trim() && form.firstName.trim() && form.lastName.trim() && (!form.email || /\S+@\S+\.\S+/.test(form.email));

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    try {
      const result = await create.mutateAsync({
        code: form.code.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        birthDate: form.birthDate || undefined,
        sectionId: form.sectionId ? Number(form.sectionId) : undefined,
        email: form.email.trim() || undefined,
      });
      onCreated(result);
    } catch {
      // el error se muestra en el formulario
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nuevo estudiante"
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="student-form" variant="primary" loading={create.isPending} disabled={!valid}>
            Crear estudiante
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="space-y-4">
        <FormError error={create.error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código" hint="Se usa en las plantillas de notas.">
            {(id) => <input id={id} value={form.code} onChange={set('code')} maxLength={30} data-autofocus className={inputClass} />}
          </Field>
          <Field label="Fecha de nacimiento" optional>
            {(id) => <input id={id} type="date" value={form.birthDate} onChange={set('birthDate')} className={inputClass} />}
          </Field>
          <Field label="Nombres">{(id) => <input id={id} value={form.firstName} onChange={set('firstName')} maxLength={80} className={inputClass} />}</Field>
          <Field label="Apellidos">{(id) => <input id={id} value={form.lastName} onChange={set('lastName')} maxLength={80} className={inputClass} />}</Field>
        </div>
        <Field label="Sección" optional hint="Se inscribe en el ciclo activo y recibe las tareas vigentes de su sección.">
          {(id) => (
            <select id={id} value={form.sectionId} onChange={set('sectionId')} className={inputClass}>
              <option value="">Sin inscribir</option>
              {structure?.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Correo para su cuenta" optional hint="Si lo dejas vacío, el expediente se crea sin acceso a la plataforma (ej. preprimaria).">
          {(id) => <input id={id} type="email" value={form.email} onChange={set('email')} maxLength={190} className={inputClass} />}
        </Field>
      </form>
    </Dialog>
  );
}

/** Ficha de un estudiante: datos, sección, cuenta y familia. Cada bloque guarda por separado. */
export function StudentDetailDialog({ student, onClose, onPassword }) {
  const { data: structure } = useAcademicStructure();
  const { data: parents = [] } = useAdminUsers({ role: 'PARENT' });

  const [details, setDetails] = useState({ code: student.code, firstName: student.firstName, lastName: student.lastName, birthDate: student.birthDate ?? '' });
  const [sectionId, setSectionId] = useState(student.enrollment?.status === 'ACTIVE' ? String(student.enrollment.sectionId) : '');
  const [email, setEmail] = useState('');
  const [guardian, setGuardian] = useState({ guardianId: '', relationship: 'GUARDIAN', isFinancialResponsible: false });

  const saveDetails = useAdminMutation((body) => adminApi.updateStudent(student.id, body));
  const enroll = useAdminMutation((value) => adminApi.setEnrollment(student.id, value));
  const account = useAdminMutation((value) => adminApi.createStudentAccount(student.id, value));
  const link = useAdminMutation((body) => adminApi.linkGuardian(student.id, body));
  const unlink = useAdminMutation((guardianId) => adminApi.unlinkGuardian(student.id, guardianId));
  const reset = useAdminMutation(adminApi.resetPassword);

  const setDetail = (key) => (event) => setDetails((current) => ({ ...current, [key]: event.target.value }));
  const currentSection = student.enrollment?.status === 'ACTIVE' ? String(student.enrollment.sectionId) : '';
  const linkedIds = new Set(student.guardians.map((g) => g.id));
  const available = parents.filter((parent) => !linkedIds.has(parent.id));
  // true si se guardó; el error queda en la mutación y se muestra en su bloque
  const run = (mutation, value) =>
    mutation
      .mutateAsync(value)
      .then(() => true)
      .catch(() => false);

  return (
    <Dialog open onClose={onClose} title={`${student.firstName} ${student.lastName}`} description={`Código ${student.code}`} className="max-w-xl">
      <div className="space-y-5">
        <Section title="Datos">
          <FormError error={saveDetails.error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombres">{(id) => <input id={id} value={details.firstName} onChange={setDetail('firstName')} className={inputClass} />}</Field>
            <Field label="Apellidos">{(id) => <input id={id} value={details.lastName} onChange={setDetail('lastName')} className={inputClass} />}</Field>
            <Field label="Código">{(id) => <input id={id} value={details.code} onChange={setDetail('code')} className={inputClass} />}</Field>
            <Field label="Nacimiento">{(id) => <input id={id} type="date" value={details.birthDate} onChange={setDetail('birthDate')} className={inputClass} />}</Field>
          </div>
          <Button
            size="sm"
            loading={saveDetails.isPending}
            onClick={() => run(saveDetails, { ...details, birthDate: details.birthDate || null })}
            disabled={!details.firstName.trim() || !details.lastName.trim() || !details.code.trim()}
          >
            Guardar datos
          </Button>
        </Section>

        <Section title="Sección (ciclo activo)">
          <FormError error={enroll.error} />
          <div className="flex gap-2">
            <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} aria-label="Sección" className={inputClass}>
              <option value="">Sin inscribir / retirado</option>
              {structure?.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
            <Button loading={enroll.isPending} disabled={sectionId === currentSection} onClick={() => run(enroll, sectionId ? Number(sectionId) : null)}>
              {!currentSection ? 'Inscribir' : sectionId ? 'Trasladar' : 'Retirar'}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">Al cambiar de sección deja de recibir recordatorios de la anterior y recibe las tareas vigentes de la nueva.</p>
        </Section>

        <Section title="Cuenta">
          <FormError error={account.error ?? reset.error} />
          {student.account ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>
                {student.account.email} {student.account.status !== 'ACTIVE' && <Badge tone="red">Deshabilitada</Badge>}
              </span>
              <Button
                size="sm"
                loading={reset.isPending}
                onClick={async () => {
                  try {
                    const result = await reset.mutateAsync(student.account.userId);
                    onPassword({ name: student.firstName, email: student.account.email, password: result.temporaryPassword });
                  } catch {
                    // el error se muestra arriba
                  }
                }}
              >
                Restablecer contraseña
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@colegio.edu" aria-label="Correo de la cuenta" className={inputClass} />
              <Button
                loading={account.isPending}
                disabled={!/\S+@\S+\.\S+/.test(email)}
                onClick={async () => {
                  try {
                    const result = await account.mutateAsync(email.trim());
                    onPassword({ name: student.firstName, email: email.trim(), password: result.temporaryPassword });
                  } catch {
                    // el error se muestra arriba
                  }
                }}
              >
                <UserPlus className="size-3.5" /> Crear cuenta
              </Button>
            </div>
          )}
        </Section>

        <Section title="Familia">
          <FormError error={link.error ?? unlink.error} />
          {student.guardians.length === 0 && <p className="text-sm text-zinc-500">Sin familiares vinculados: no recibirán avisos ni podrán ver tareas ni pagos.</p>}
          <ul className="space-y-1.5">
            {student.guardians.map((g) => (
              <li key={g.id} className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{g.name}</span> <span className="text-zinc-500">· {RELATIONSHIPS[g.relationship]}</span>
                  {g.isFinancialResponsible && <Badge tone="blue" className="ml-2">Pagos</Badge>}
                </span>
                <button type="button" onClick={() => run(unlink, g.id)} aria-label={`Desvincular a ${g.name}`} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-red-600">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {available.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <select value={guardian.guardianId} onChange={(e) => setGuardian({ ...guardian, guardianId: e.target.value })} aria-label="Familiar" className={`${inputClass} min-w-40 flex-1`}>
                <option value="">Elegir familiar…</option>
                {available.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.firstName} {parent.lastName} ({parent.email})
                  </option>
                ))}
              </select>
              <select value={guardian.relationship} onChange={(e) => setGuardian({ ...guardian, relationship: e.target.value })} aria-label="Parentesco" className={`${inputClass} w-36`}>
                {Object.entries(RELATIONSHIPS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={guardian.isFinancialResponsible} onChange={(e) => setGuardian({ ...guardian, isFinancialResponsible: e.target.checked })} className="size-4 accent-zinc-900" />
                Responsable de pagos
              </label>
              <Button
                size="sm"
                loading={link.isPending}
                disabled={!guardian.guardianId}
                onClick={() =>
                  run(link, { ...guardian, guardianId: Number(guardian.guardianId) }).then(
                    (saved) => saved && setGuardian({ guardianId: '', relationship: 'GUARDIAN', isFinancialResponsible: false }),
                  )
                }
              >
                <Link2 className="size-3.5" /> Vincular
              </Button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Para vincular a alguien nuevo, créalo primero en la pestaña Familias.</p>
          )}
        </Section>
      </div>
    </Dialog>
  );
}
