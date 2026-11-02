import { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';
import { formatScore } from '@/lib/format';
import { gradebookApi } from '../api';

const MAX_BYTES = 2 * 1024 * 1024;

function TemplateButtons({ courseId, unitId }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  const download = async (format) => {
    setPending(format);
    setError(null);
    try {
      await gradebookApi.downloadTemplate(courseId, unitId, format);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-3">
      <p className="text-sm font-medium text-zinc-900">1. Descarga la plantilla</p>
      <p className="mt-0.5 text-xs text-zinc-500">Ya trae la lista de clase y las notas actuales. No cambies los códigos ni los encabezados.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => download('xlsx')} loading={pending === 'xlsx'} disabled={Boolean(pending)}>
          {pending !== 'xlsx' && <Download className="size-3.5" />} Excel (.xlsx)
        </Button>
        <Button size="sm" onClick={() => download('csv')} loading={pending === 'csv'} disabled={Boolean(pending)}>
          {pending !== 'csv' && <Download className="size-3.5" />} CSV
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function DropZone({ onFile, disabled }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const pick = (file) => file && onFile(file);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-900">2. Sube el archivo con las notas</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          pick(event.dataTransfer.files[0]);
        }}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors disabled:opacity-60',
          over ? 'border-blue-400 bg-blue-50' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50',
        )}
      >
        <Upload className="size-6 text-zinc-400" />
        <span className="text-sm text-zinc-700">
          Arrastra el archivo aquí o <span className="font-medium text-blue-700">elígelo</span>
        </span>
        <span className="text-xs text-zinc-500">.xlsx o .csv · máximo 2 MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(event) => {
          pick(event.target.files[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function Preview({ result }) {
  const blocking = result.errors.filter((error) => !error.warning);
  const warnings = result.errors.filter((error) => error.warning);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <FileSpreadsheet className="size-4 shrink-0 text-zinc-400" />
        <span className="truncate font-medium">{result.fileName}</span>
        <span className="shrink-0 text-zinc-500">· {result.totalRows} filas</span>
      </div>

      {blocking.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800 ring-1 ring-red-100">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {result.errorRows} fila(s) con errores. Corrige el archivo y vuelve a subirlo: no se aplica nada hasta que esté limpio.
        </p>
      ) : result.changeCount === 0 ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 ring-1 ring-zinc-200">
          El archivo no trae cambios: todas las notas coinciden con la hoja.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-100">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          Listo para aplicar: {result.changeCount} nota(s) cambian{result.unchangedCount > 0 && ` y ${result.unchangedCount} quedan igual`}.
        </p>
      )}

      {warnings.map((warning) => (
        <p key={`${warning.row}-${warning.column}`} className="text-xs text-amber-700">
          Columna “{warning.column}”: {warning.message}.
        </p>
      ))}

      {blocking.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Fila</th>
              <th className="py-1.5 pr-3 font-medium">Columna</th>
              <th className="py-1.5 font-medium">Problema</th>
            </tr>
          </thead>
          <tbody>
            {blocking.map((error, index) => (
              <tr key={index} className="border-t border-zinc-100">
                <td className="py-1.5 pr-3 tabular-nums text-zinc-500">{error.row}</td>
                <td className="max-w-40 truncate py-1.5 pr-3">{error.column}</td>
                <td className="py-1.5 text-red-700">{error.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {blocking.length === 0 && result.changes.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Estudiante</th>
              <th className="py-1.5 pr-3 font-medium">Columna</th>
              <th className="py-1.5 text-right font-medium">Cambio</th>
            </tr>
          </thead>
          <tbody>
            {result.changes.map((change) => (
              <tr key={`${change.studentId}-${change.gradeItemId}`} className="border-t border-zinc-100">
                <td className="max-w-44 truncate py-1.5 pr-3">{change.studentName}</td>
                <td className="max-w-36 truncate py-1.5 pr-3 text-zinc-600">{change.itemName}</td>
                <td className="py-1.5 text-right whitespace-nowrap tabular-nums">
                  <span className="text-zinc-400">{change.before === null ? 'vacía' : formatScore(change.before)}</span>
                  <ArrowRight className="mx-1 inline size-3 text-zinc-400" />
                  <span className="font-medium">{formatScore(change.score)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result.changeCount > result.changes.length && (
        <p className="text-xs text-zinc-500">Mostrando {result.changes.length} de {result.changeCount} cambios.</p>
      )}
    </div>
  );
}

export function ImportDialog({ open, onClose, courseId, unit, hasPendingChanges, onApplied }) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | uploading | applying
  const [error, setError] = useState(null);

  const reset = () => {
    setResult(null);
    setError(null);
  };

  const close = () => {
    // Una validación que no se aplicó se descarta para no dejarla pendiente
    if (result?.status === 'VALIDATED') gradebookApi.discardImport(result.id).catch(() => {});
    reset();
    onClose();
  };

  const upload = async (file) => {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('El archivo supera 2 MB.');
      return;
    }
    setStatus('uploading');
    try {
      setResult(await gradebookApi.uploadImport(courseId, unit.id, file));
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus('idle');
    }
  };

  const apply = async () => {
    setStatus('applying');
    setError(null);
    try {
      const applied = await gradebookApi.applyImport(result.id);
      reset();
      onApplied(applied.applied);
    } catch (err) {
      setError(err.message);
      if (err.code === 'IMPORT_STALE') setResult(null);
    } finally {
      setStatus('idle');
    }
  };

  const canApply = result?.status === 'VALIDATED' && result.changeCount > 0;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Importar notas"
      description={unit.name}
      className="max-w-xl"
      footer={
        result ? (
          <>
            <Button onClick={reset} disabled={status !== 'idle'} className="mr-auto">
              Subir otro archivo
            </Button>
            <Button onClick={close} disabled={status !== 'idle'}>
              Cancelar
            </Button>
            {canApply && (
              <Button variant="primary" onClick={apply} loading={status === 'applying'} disabled={hasPendingChanges}>
                Aplicar {result.changeCount} cambio(s)
              </Button>
            )}
          </>
        ) : (
          <Button onClick={close}>Cerrar</Button>
        )
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
        {canApply && hasPendingChanges && (
          <p className="text-xs text-amber-700">Espera a que se guarden tus cambios en la hoja antes de aplicar.</p>
        )}

        {result ? (
          <Preview result={result} />
        ) : (
          <>
            <TemplateButtons courseId={courseId} unitId={unit.id} />
            <DropZone onFile={upload} disabled={status === 'uploading'} />
            {status === 'uploading' && <p className="text-center text-sm text-zinc-500">Validando archivo…</p>}
          </>
        )}
      </div>
    </Dialog>
  );
}
