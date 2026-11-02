import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertTriangle, CalendarClock, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { isUsingMocks } from '../api';
import { useActivitySubmissions, useReviewSubmission, useSubmissionLiveUpdates } from '../hooks';
import { SubmissionList } from '../components/SubmissionList';
import { SubmissionReviewPanel } from '../components/SubmissionReviewPanel';

const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function isTypingTarget(element) {
  return element instanceof HTMLElement && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
}

function PageHeader({ activity, summary }) {
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
        <Link to="/activities" className="hover:text-zinc-900">
          Actividades
        </Link>
        <ChevronRight className="size-3" />
        <Link to={`/activities?course=${activity.courseId}`} className="hover:text-zinc-900">
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
  const [filter, setFilter] = useState('SUBMITTED');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false); // solo afecta pantallas pequeñas

  const { data, isLoading, isError, error, refetch } = useActivitySubmissions(activityId);
  const review = useReviewSubmission(activityId);
  const resetReview = review.reset;
  useSubmissionLiveUpdates(activityId, data?.activity.courseId);

  const visibleItems = useMemo(() => {
    if (!data) return [];
    const term = normalize(search.trim());
    return data.items.filter((item) => {
      if (filter !== 'ALL' && item.status !== filter) return false;
      if (!term) return true;
      const { firstName, lastName, code } = item.student;
      return normalize(`${firstName} ${lastName} ${code}`).includes(term);
    });
  }, [data, filter, search]);

  // Seleccionar automáticamente la primera entrega visible
  useEffect(() => {
    if (selectedId === null && visibleItems.length > 0) setSelectedId(visibleItems[0].id);
  }, [selectedId, visibleItems]);

  const select = (id) => {
    resetReview();
    setSelectedId(id);
    setDetailOpen(true);
  };

  // Navegación con teclado estilo Linear: J/K o flechas
  useEffect(() => {
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[event.key];
      if (!step || visibleItems.length === 0) return;
      event.preventDefault();
      const index = visibleItems.findIndex((item) => item.id === selectedId);
      const next = visibleItems[Math.min(Math.max(index + step, 0), visibleItems.length - 1)];
      if (next) {
        resetReview();
        setSelectedId(next.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visibleItems, selectedId, resetReview]);

  const handleReview = (variables) => {
    // Se calcula antes de que la actualización optimista saque al alumno del filtro
    const queue = visibleItems.filter((item) => item.status === 'SUBMITTED' && item.id !== variables.submissionId);
    review.mutate(variables, {
      onSuccess: () => {
        if (queue.length > 0) setSelectedId(queue[0].id);
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

      <div className="flex min-h-0 flex-1">
        <SubmissionList
          className={cn('w-full lg:w-[360px] lg:shrink-0', detailOpen && 'hidden lg:flex')}
          items={visibleItems}
          summary={data?.summary}
          isLoading={isLoading}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          selectedId={selectedId}
          onSelect={select}
        />
        <SubmissionReviewPanel
          className={cn(!detailOpen && 'hidden lg:flex')}
          submissionId={selectedId}
          onBack={() => setDetailOpen(false)}
          onReview={handleReview}
          pendingDecision={review.isPending ? review.variables?.decision : null}
          reviewError={review.error}
        />
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
