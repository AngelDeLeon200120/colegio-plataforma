import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Lock, Plus, RefreshCw, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { ColumnDialog } from '../components/ColumnDialog';
import { GradeGrid } from '../components/GradeGrid';
import { ImportDialog } from '../components/ImportDialog';
import { ImproveDialog } from '../components/ImproveDialog';
import { SaveIndicator } from '../components/SaveIndicator';
import { gradebookKeys, useGradebookLiveUpdates, useGradebookSheet, usePaymentStatus } from '../hooks';
import { useGradeSheet } from '../useGradeSheet';

function UnitTabs({ units, currentId, onChange }) {
  return (
    <div role="tablist" aria-label="Unidad" className="flex flex-wrap gap-1.5">
      {units.map((unit) => (
        <button
          key={unit.id}
          type="button"
          role="tab"
          aria-selected={unit.id === currentId}
          onClick={() => onChange(unit.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
            unit.id === currentId ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
          )}
        >
          {unit.status === 'CLOSED' && <Lock className="size-3" aria-label="Cerrada" />}
          {unit.name}
          {unit.status === 'ACTIVE' && <span className="size-1.5 rounded-full bg-emerald-500" aria-label="Activa" />}
        </button>
      ))}
    </div>
  );
}

/** Hoja cargada. Se monta con key por unidad para que los cambios locales no se mezclen. */
function Sheet({ courseId, sheet, sheetKey }) {
  const grid = useGradeSheet({ courseId, sheet, sheetKey });
  const queryClient = useQueryClient();
  const [columnDialog, setColumnDialog] = useState(null); // { item } | { item: null }
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  useGradebookLiveUpdates(courseId, sheetKey);
  // Pagos pendientes de la unidad: al docente se le tachan esas notas (solo visual)
  const { data: paymentData } = usePaymentStatus(courseId, sheet.unit.id);
  const payment = useMemo(
    () => paymentData && { unpaid: new Set(paymentData.unpaidStudentIds), obscure: paymentData.obscureScores, details: paymentData.details ?? {} },
    [paymentData],
  );

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const weightSum = sheet.items.reduce((sum, item) => sum + item.weight, 0);

  // Celda seleccionada: a ella se aplica la "Mejora"
  const clampIndex = (value, length) => Math.min(Math.max(value, 0), length - 1);
  const activeStudent = sheet.students[clampIndex(grid.state.active.row, sheet.students.length)];
  const activeItem = sheet.items[clampIndex(grid.state.active.col, sheet.items.length)];
  const [improveTarget, setImproveTarget] = useState(null); // { student, item }
  const openImprove = () => {
    const cell = grid.getCell(activeStudent.id, activeItem.id);
    if (cell.dirty || cell.saving || cell.error) {
      setNotice(null);
      setImproveNotice('Espera a que la celda se guarde (o corrige el error) antes de registrar una mejora.');
      return;
    }
    setImproveNotice(null);
    setImproveTarget({ student: activeStudent, item: activeItem });
  };
  const [improveNotice, setImproveNotice] = useState(null);
  const improveScore = improveTarget ? (sheet.scores.find((score) => score.studentId === improveTarget.student.id && score.gradeItemId === improveTarget.item.id)?.score ?? null) : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 sm:px-6">
        <SaveIndicator
          status={grid.saveStatus}
          pendingCount={grid.pendingCount}
          errorCount={grid.errorCount}
          readOnly={sheet.readOnly}
          onRetry={grid.retry}
        />
        {notice && <span className="text-xs font-medium text-emerald-700">{notice}</span>}
        {improveNotice && <span className="text-xs font-medium text-amber-700">{improveNotice}</span>}
        {payment?.unpaid.size > 0 && (
          <span className="text-xs text-red-700" title="Se quita sola cuando la administración registra el pago">
            {payment.unpaid.size} estudiante{payment.unpaid.size === 1 ? '' : 's'} con pago pendiente en esta unidad
          </span>
        )}
        {!sheet.readOnly && (
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              onClick={openImprove}
              disabled={!activeStudent || !activeItem}
              title="Cambiar la nota de la celda seleccionada, aunque esté aprobada (queda en el historial)"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              <Sparkles className="size-3.5" /> Mejora
            </Button>
            <Button size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" /> Importar
            </Button>
            <Button size="sm" variant="primary" onClick={() => setColumnDialog({ item: null })}>
              <Plus className="size-3.5" /> Columna
            </Button>
          </div>
        )}
      </div>

      {sheet.readOnly && (
        <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6">
          <Lock className="size-4 shrink-0" />
          {sheet.unit.name} está cerrada: las notas son de solo lectura. Para corregir algo, pide a la administración que la reabra.
        </p>
      )}

      <GradeGrid
        sheet={sheet}
        grid={grid}
        onEditItem={(item) => setColumnDialog({ item })}
        onAddItem={() => setColumnDialog({ item: null })}
        payment={payment}
      />

      <footer className="hidden flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 bg-white px-6 py-1.5 text-[11px] text-zinc-500 lg:flex">
        {sheet.readOnly ? (
          <span>
            <Kbd>Shift</Kbd> + flechas para seleccionar · <Kbd>Ctrl C</Kbd> copiar a Excel
          </span>
        ) : (
          <>
            <span>
              Escribe para reemplazar · <Kbd>F2</Kbd> editar · <Kbd>Supr</Kbd> borrar
            </span>
            <span>
              <Kbd>Ctrl C</Kbd> / <Kbd>Ctrl V</Kbd> copiar y pegar desde Excel
            </span>
            <span>
              <Kbd>Ctrl Z</Kbd> deshacer · <Kbd>Shift</Kbd> + flechas para seleccionar
            </span>
            <span>Arrastra el cuadrito azul de la selección para rellenar (con vista previa)</span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-0 border-t-[7px] border-r-[7px] border-t-blue-600 border-r-transparent" /> nota mejorada
            </span>
          </>
        )}
      </footer>

      {columnDialog && (
        <ColumnDialog
          key={columnDialog.item?.id ?? 'new'}
          open
          onClose={() => setColumnDialog(null)}
          courseId={courseId}
          unitId={sheet.unit.id}
          item={columnDialog.item}
          remainingWeight={100 - weightSum}
        />
      )}

      {improveTarget && (
        <ImproveDialog
          courseId={courseId}
          unitId={sheet.unit.id}
          student={improveTarget.student}
          item={improveTarget.item}
          currentScore={improveScore}
          sheetKey={sheetKey}
          onClose={() => setImproveTarget(null)}
          onSaved={() => {
            setImproveTarget(null);
            setNotice('Mejora guardada (sin notificaciones)');
          }}
        />
      )}

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        courseId={courseId}
        unit={sheet.unit}
        hasPendingChanges={grid.pendingCount > 0}
        onApplied={(count) => {
          setImportOpen(false);
          setNotice(`Se importaron ${count} nota(s)`);
          // El aviso por socket de este cambio se ignora (es propio): recargar la hoja
          queryClient.invalidateQueries({ queryKey: sheetKey });
        }}
      />
    </>
  );
}

export function GradebookPage() {
  const { courseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const unitParam = searchParams.get('unit');
  const { data: sheet, isLoading, isError, error, refetch } = useGradebookSheet(courseId, unitParam);
  const sheetKey = gradebookKeys.sheet(courseId, unitParam);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 sm:px-6">
        <nav className="flex items-center gap-1 text-xs text-zinc-500" aria-label="Ruta">
          <Link to="/gradebook" className="hover:text-zinc-900">
            Cuadro de notas
          </Link>
          <ChevronRight className="size-3" />
          <span>{sheet?.course.name ?? '…'}</span>
        </nav>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          {sheet ? (
            <h1 className="text-2xl font-normal text-zinc-900">{sheet.course.name}</h1>
          ) : (
            <Skeleton className="h-6 w-56" />
          )}
          {sheet && (
            <UnitTabs
              units={sheet.units}
              currentId={sheet.unit.id}
              onChange={(id) => id !== sheet.unit.id && setSearchParams({ unit: String(id) })}
            />
          )}
        </div>
      </header>

      {isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="size-8 text-amber-500" />
          <p className="text-sm text-zinc-600">{error.message}</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="size-3.5" /> Reintentar
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2 p-6">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <Sheet key={`${courseId}:${sheet.unit.id}`} courseId={courseId} sheet={sheet} sheetKey={sheetKey} />
      )}
    </div>
  );
}
