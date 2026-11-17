import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, Plus, ShieldAlert, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormError } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime } from '@/lib/format';
import { FollowupDialog } from './FollowupDialog';
import { useConductLive, useConductReports, useConductStudents, useFollowups, useVoidReport } from './hooks';
import { CATEGORIES, DECISIONS, FOLLOWUP_STATUS, counterTone } from './model';
import { NewReportDialog } from './NewReportDialog';

const TABS = [
  { id: 'students', label: 'Estudiantes', icon: Users },
  { id: 'reports', label: 'Reportes', icon: ClipboardList },
  { id: 'followups', label: 'Seguimientos', icon: ShieldAlert },
];

const chip = (active) =>
  cn('rounded-full border px-3 py-1 text-xs font-medium', active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100');

function CategoryIcon({ category }) {
  const look = CATEGORIES[category] ?? CATEGORIES.OTRO;
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: look.color }} aria-hidden>
      <look.icon className="size-4" />
    </span>
  );
}

function VoidDialog({ report, onClose }) {
  const [reason, setReason] = useState('');
  const voidReport = useVoidReport();
  return (
    <Dialog
      open
      onClose={onClose}
      title="Anular reporte"
      description={`${report.student.firstName} ${report.student.lastName} · ${CATEGORIES[report.category].label}. Deja de contar; no se borra.`}
      footer={
        <>
          <Button onClick={onClose} disabled={voidReport.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            className="bg-red-600 hover:bg-red-700"
            disabled={reason.trim().length < 5}
            loading={voidReport.isPending}
            onClick={() => voidReport.mutate({ reportId: report.id, reason: reason.trim() }, { onSuccess: onClose })}
          >
            Anular
          </Button>
        </>
      }
    >
      <FormError error={voidReport.error} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-700">Motivo</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={300}
          data-autofocus
          placeholder="Ej. Se registró al estudiante equivocado"
          className="block w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
        />
      </label>
    </Dialog>
  );
}

function StudentsTab({ onReport, onOpenStudent }) {
  const [sectionId, setSectionId] = useState('');
  const { data, isLoading, isError, error } = useConductStudents({});
  const all = data?.students ?? [];
  const threshold = data?.threshold ?? 3;
  const sections = [...new Map(all.map((student) => [student.section.id, student.section])).values()];
  const students = all.filter((student) => !sectionId || String(student.section.id) === sectionId).sort((a, b) => b.reportCount - a.reportCount);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chip(!sectionId)} onClick={() => setSectionId('')}>
          Todas las secciones
        </button>
        {sections.map((section) => (
          <button key={section.id} type="button" className={chip(sectionId === String(section.id))} onClick={() => setSectionId(String(section.id))}>
            {section.name}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-500">Al llegar a {threshold} reportes en el ciclo se abre un seguimiento.</span>
      </div>
      {isError && <p className="text-sm text-red-600">{error.message}</p>}
      {isLoading && <Skeleton className="h-48 w-full rounded-lg" />}
      {data && students.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">No hay estudiantes en tus secciones.</p>}
      {students.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {students.map((student) => {
            const tone = counterTone(student.reportCount, threshold);
            return (
              <li key={student.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Avatar firstName={student.firstName} lastName={student.lastName} size="sm" />
                <button type="button" onClick={() => onOpenStudent(student)} className="min-w-0 flex-1 text-left hover:underline">
                  <span className="block truncate text-sm font-medium text-zinc-900">
                    {student.lastName}, {student.firstName}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {student.code} · {student.section.name}
                  </span>
                </button>
                {student.followupStatus && <Badge tone={FOLLOWUP_STATUS[student.followupStatus].tone}>{FOLLOWUP_STATUS[student.followupStatus].label}</Badge>}
                <span
                  className={cn(
                    'flex min-w-16 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
                    { neutral: 'bg-zinc-100 text-zinc-500', blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-800', red: 'bg-red-50 text-red-700' }[tone],
                  )}
                  title={`${student.reportCount} de ${threshold} reportes`}
                >
                  {tone === 'red' && <AlertTriangle className="size-3.5" />}
                  {student.reportCount} / {threshold}
                </span>
                <Button size="sm" onClick={() => onReport(student)}>
                  <Plus className="size-3.5" /> Reportar
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ReportsTab({ studentFilter, onClearStudent }) {
  const [category, setCategory] = useState('');
  const [includeVoid, setIncludeVoid] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const { data, isLoading, isError, error } = useConductReports({ studentId: studentFilter?.id, category: category || undefined, includeVoid });
  const reports = data?.reports ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {studentFilter && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white">
            {studentFilter.lastName}, {studentFilter.firstName}
            <button type="button" onClick={onClearStudent} className="text-white/70 hover:text-white" aria-label="Quitar filtro de estudiante">
              ✕
            </button>
          </span>
        )}
        <button type="button" className={chip(!category)} onClick={() => setCategory('')}>
          Todos
        </button>
        {Object.entries(CATEGORIES).map(([key, item]) => (
          <button key={key} type="button" className={chip(category === key)} onClick={() => setCategory(key)}>
            {item.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
          <input type="checkbox" checked={includeVoid} onChange={(event) => setIncludeVoid(event.target.checked)} /> Mostrar anulados
        </label>
      </div>
      {isError && <p className="text-sm text-red-600">{error.message}</p>}
      {isLoading && <Skeleton className="h-48 w-full rounded-lg" />}
      {data && reports.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">No hay reportes con este filtro.</p>}
      {reports.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {reports.map((report) => {
            const voided = report.status === 'VOID';
            return (
              <li key={report.id} className={cn('flex gap-3 px-4 py-3', voided && 'opacity-60')}>
                <CategoryIcon category={report.category} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className={cn('font-medium text-zinc-900', voided && 'line-through')}>
                      {report.student.lastName}, {report.student.firstName}
                    </span>
                    <span className="text-zinc-500">· {CATEGORIES[report.category].label}</span>
                    {voided && <Badge tone="neutral">Anulado</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-zinc-700">{report.description}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(report.incidentDate)} · {report.section.name} · reportado por {report.reportedBy.name}
                  </p>
                  {voided && <p className="text-xs text-zinc-500">Motivo de anulación: {report.voidReason}</p>}
                </div>
                {data.canVoid && !voided && (
                  <button
                    type="button"
                    onClick={() => setVoiding(report)}
                    className="inline-flex h-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                  >
                    <Ban className="size-3.5" /> Anular
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {voiding && <VoidDialog report={voiding} onClose={() => setVoiding(null)} />}
    </div>
  );
}

function FollowupsTab() {
  const [editing, setEditing] = useState(null);
  const { data, isLoading, isError, error } = useFollowups({});
  const followups = data?.followups ?? [];
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Se abre uno cada vez que un estudiante llega a 3 reportes (y a 6, 9...). La administración decide la medida y registra los acuerdos.
      </p>
      {isError && <p className="text-sm text-red-600">{error.message}</p>}
      {isLoading && <Skeleton className="h-32 w-full rounded-lg" />}
      {data && followups.length === 0 && (
        <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-zinc-500">
          <CheckCircle2 className="size-8 text-zinc-300" /> No hay seguimientos abiertos.
        </p>
      )}
      {followups.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {followups.map((followup) => {
            const status = FOLLOWUP_STATUS[followup.status];
            return (
              <li key={followup.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar firstName={followup.student.firstName} lastName={followup.student.lastName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {followup.student.lastName}, {followup.student.firstName}
                    <span className="font-normal text-zinc-500"> · {followup.section?.name} · {followup.reportCount} reportes</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {followup.decision ? DECISIONS[followup.decision] : 'Sin medida todavía'}
                    {followup.meetingAt && ` · ${formatDateTime(followup.meetingAt)}`}
                    {followup.handledBy && ` · ${followup.handledBy}`}
                  </p>
                  {followup.outcome && <p className="mt-0.5 text-xs text-zinc-700">Acuerdos: {followup.outcome}</p>}
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
                {data.canManage && (
                  <Button size="sm" variant={followup.status === 'PENDIENTE' ? 'primary' : 'secondary'} onClick={() => setEditing(followup)}>
                    {followup.status === 'PENDIENTE' ? 'Decidir' : 'Ver / editar'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <FollowupDialog key={editing.id} followup={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Reportes de conducta: los registran docentes y administración; las familias los reciben. */
export function ConductPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((item) => item.id === searchParams.get('tab')) ? searchParams.get('tab') : 'students';
  const [reporting, setReporting] = useState(null); // { student } | { student: null }
  const [studentFilter, setStudentFilter] = useState(null);
  const [notice, setNotice] = useState(null);
  const { data: pending } = useFollowups({ status: 'PENDIENTE' });
  useConductLive();
  const pendingCount = pending?.followups.length ?? 0;

  const goTab = (id) => setSearchParams(id === 'students' ? {} : { tab: id });

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-normal text-zinc-900">
            <ShieldAlert className="size-6 text-red-600" /> Reportes de conducta
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">Cada reporte le llega a la familia. Al tercero, la institución decide el seguimiento.</p>
        </div>
        <Button variant="primary" onClick={() => setReporting({ student: null })}>
          <Plus className="size-4" /> Nuevo reporte
        </Button>
      </header>

      {notice && (
        <p className={cn('mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1', notice.alert ? 'bg-red-50 text-red-800 ring-red-100' : 'bg-emerald-50 text-emerald-800 ring-emerald-100')}>
          {notice.alert ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />} {notice.text}
        </p>
      )}

      <div className="mt-5 flex border-b border-zinc-200" role="tablist" aria-label="Secciones">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => goTab(item.id)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-4 px-4 py-3 text-sm font-medium',
              tab === item.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-zinc-600 hover:bg-zinc-50',
            )}
          >
            <item.icon className="size-4" /> {item.label}
            {item.id === 'followups' && pendingCount > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] text-white">{pendingCount}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'students' && (
          <StudentsTab
            onReport={(student) => setReporting({ student })}
            onOpenStudent={(student) => {
              setStudentFilter(student);
              goTab('reports');
            }}
          />
        )}
        {tab === 'reports' && <ReportsTab studentFilter={studentFilter} onClearStudent={() => setStudentFilter(null)} />}
        {tab === 'followups' && <FollowupsTab />}
      </div>

      {reporting && (
        <NewReportDialog
          key={reporting.student?.id ?? 'new'}
          defaultStudentId={reporting.student?.id}
          onClose={() => setReporting(null)}
          onCreated={(result, student) => {
            setReporting(null);
            const name = student ? `${student.firstName} ${student.lastName}` : 'el estudiante';
            setNotice(
              result.followupOpened
                ? { alert: true, text: `Reporte enviado. ${name} llegó a ${result.reportCount} reportes: se abrió un seguimiento para la administración.` }
                : { alert: false, text: `Reporte enviado a la familia de ${name} (${result.reportCount} de ${result.threshold}).` },
            );
          }}
        />
      )}
    </div>
  );
}
