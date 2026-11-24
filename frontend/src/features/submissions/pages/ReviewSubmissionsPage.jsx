import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertTriangle, CalendarClock, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/format';
import { useCourseReturnPath } from '@/features/activities/courseReturn';
import { isUsingMocks } from '../api';
import { useActivitySubmissions, useReviewSubmission, useSubmissionLiveUpdates } from '../hooks';
import { DeliveryRoster } from '../components/DeliveryRoster';
import { SubmissionViewer } from '../components/SubmissionViewer';
import { SubmissionReviewPanel } from '../components/SubmissionReviewPanel';

const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function isTypingTarget(element) {
  return element instanceof HTMLElement && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
}

function PageHeader({ activity, summary }) {
  const coursePath = useCourseReturnPath(activity?.courseId);
  if (!activity) {
    return (
      <div className="space-y-2 border-b border-zinc-200 bg-white px-6 py-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-5 w-72" />
      </div>
    );
  }

  const reviewed = summary.APPROVED;
  const progress = summary.total ? Math.round((reviewed / summary.total) * 100) : 0;
  const overdue = new Date(activity.dueAt) < new Date();

  return (
    <header className="border-b border-zinc-200 bg-white px-4 py-4 sm:px-6">
      <nav className="flex items-center gap-1 text-xs text-zinc-500" aria-label="Ruta">
        <Link to="/courses" className="hover:text-zinc-900">
          Mis cursos
        </Link>
        <ChevronRight className="size-3" />
        <Link to={coursePath} className="hover:text-zinc-900">
          {activity.courseName}
        </Link>
      </nav>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-normal text-zinc-900">{activity.title}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500">
            <CalendarClock className="size-3.5" />
            {overdue ? 'Venció' : 'Vence'} {formatDateTime(activity.dueAt)} · {activity.maxScore} puntos
          </p>
        </div>

        <div className="flex items-center gap-6">
          <dl className="flex gap-5 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Por revisar</dt>
              <dd className="font-semibold text-blue-700 tabular-nums">{summary.SUBMITTED}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">En corrección</dt>
              <dd className="font-semibold text-amber-700 tabular-nums">{summary.REJECTED}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Sin entregar</dt>
              <dd className="font-semibold text-zinc-700 tabular-nums">{summary.PENDING}</dd>
            </div>
          </dl>
          <div className="hidden w-40 sm:block">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Aprobadas</span>
              <span className="tabular-nums">
                {reviewed}/{summary.total}
              </span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso de aprobación"
            >
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function ReviewSubmissionsPage() {
  const { activityId } = useParams();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const scrollTarget = useRef(null); // alumno que debe quedar a la vista al abrirse

  const { data, isLoading, isError, error, refetch } = useActivitySubmissions(activityId);
  const review = useReviewSubmission(activityId);
  const resetReview = review.reset;
  useSubmissionLiveUpdates(activityId, data?.activity.courseId);

  const items = useMemo(() => data?.items ?? [], [data]);
  const results = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return [];
    return items.filter(({ student }) => normalize(`${student.firstName} ${student.lastName} ${student.code}`).includes(term));
  }, [items, search]);
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  // Al entrar se muestra el primero de la lista (los que están por revisar van primero)
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  // El alumno elegido queda a la vista desde su nombre
  const showSelected = (id) => document.getElementById(`entrega-${id}`)?.scrollIntoView({ block: 'start' });
  useEffect(() => {
    if (selectedId !== null && scrollTarget.current === selectedId) showSelected(selectedId);
  }, [selectedId]);
  const onDetailReady = (id) => {
    if (scrollTarget.current !== id) return;
    scrollTarget.current = null;
    showSelected(id);
  };

  /** Muestra a un alumno: desde el listado de quienes entregaron y quienes no, o desde el buscador. */
  const open = (id) => {
    setSearch('');
    if (id === selectedId) {
      setTimeout(() => showSelected(id));
      return;
    }
    resetReview();
    scrollTarget.current = id;
    setSelectedId(id);
  };

  // Navegación con teclado estilo Linear: J/K o flechas
  useEffect(() => {
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[event.key];
      if (!step || items.length === 0) return;
      event.preventDefault();
      const index = items.findIndex((item) => item.id === selectedId);
      const next = items[Math.min(Math.max(index + step, 0), items.length - 1)];
      if (next.id !== selectedId) {
        resetReview();
        scrollTarget.current = next.id;
        setSelectedId(next.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, selectedId, resetReview]);

  const handleReview = (variables) => {
    // Se calcula antes de la actualización optimista
    const queue = items.filter((item) => item.status === 'SUBMITTED' && item.id !== variables.submissionId);
    review.mutate(variables, {
      onSuccess: () => {
        if (queue.length === 0) return;
        scrollTarget.current = queue[0].id;
        setSelectedId((current) => (current === variables.submissionId ? queue[0].id : current));
      },
    });
  };

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-8 text-amber-500" />
        <p className="text-sm text-zinc-600">{error.message}</p>
        <Button onClick={() => refetch()}>
          <RefreshCw className="size-3.5" /> Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader activity={data?.activity} summary={data?.summary} />

      <div className="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
        <SubmissionViewer
          className="shrink-0 lg:flex-1 lg:shrink"
          selected={selected}
          isLoading={isLoading}
          search={search}
          results={results}
          onSearchChange={setSearch}
          onSelect={open}
          renderDetail={(item) => (
            <SubmissionReviewPanel
              submissionId={item.id}
              onReview={handleReview}
              pendingDecision={review.isPending ? review.variables?.decision : null}
              reviewError={review.error}
              onReady={onDetailReady}
            />
          )}
        />
        <DeliveryRoster items={items} isLoading={isLoading} selectedId={selectedId} onSelect={open} />
      </div>

      <footer className="hidden items-center gap-4 border-t border-zinc-200 bg-white px-6 py-1.5 text-[11px] text-zinc-500 lg:flex">
        <span className="flex items-center gap-1.5">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> navegar
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Ctrl ↵</Kbd> aprobar
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Ctrl ⇧ ↵</Kbd> solicitar corrección
        </span>
        {isUsingMocks && <span className="ml-auto rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Datos de ejemplo</span>}
      </footer>
    </div>
  );
}
