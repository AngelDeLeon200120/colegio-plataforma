import { Printer } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { CATEGORIES, STAGES } from './model';

/** Las 3 etapas, marcando hasta dónde llegó (count = reportes vigentes en el ciclo). */
export function StageSteps({ count, className }) {
  const current = count === 0 ? 0 : ((count - 1) % 3) + 1;
  return (
    <ol className={cn('flex flex-wrap items-center gap-1.5 text-xs', className)} aria-label="Etapas de los reportes">
      {Object.values(STAGES).map((stage, index) => {
        const done = stage.step <= current;
        return (
          <li key={stage.step} className="flex items-center gap-1.5">
            {index > 0 && <span className={cn('h-px w-4', done ? 'bg-zinc-500' : 'bg-zinc-300')} aria-hidden />}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ring-1 ring-inset',
                stage.step === current
                  ? { blue: 'bg-blue-600 text-white ring-blue-600', amber: 'bg-amber-500 text-white ring-amber-500', red: 'bg-red-600 text-white ring-red-600' }[stage.tone]
                  : done
                    ? 'bg-zinc-100 text-zinc-700 ring-zinc-300'
                    : 'bg-white text-zinc-400 ring-zinc-200',
              )}
            >
              <span className="tabular-nums">{stage.step}</span> {stage.long}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function StageBadge({ stage }) {
  if (!stage || !STAGES[stage]) return null;
  return <Badge tone={STAGES[stage].tone}>{STAGES[stage].label}</Badge>;
}

const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/**
 * Abre el reporte escrito en una ventana lista para imprimir o guardar como PDF
 * (constancia formal para la familia y el expediente).
 */
export function printWrittenReport({ report, schoolName }) {
  const win = window.open('', '_blank', 'width=820,height=960');
  if (!win) return;
  const category = CATEGORIES[report.category]?.label ?? 'Otro';
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte escrito · ${escape(report.student.firstName)} ${escape(report.student.lastName)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #18181b; margin: 48px; line-height: 1.55; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 15px; font-weight: normal; color: #52525b; margin: 4px 0 28px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0 24px; font-size: 14px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e4e4e7; vertical-align: top; } td:first-child { width: 170px; color: #52525b; }
  .box { border: 1px solid #a1a1aa; padding: 14px 16px; white-space: pre-wrap; min-height: 90px; }
  .note { font-size: 13px; color: #3f3f46; margin-top: 24px; }
  .signs { display: flex; gap: 48px; margin-top: 72px; } .signs div { flex: 1; border-top: 1px solid #18181b; padding-top: 6px; font-size: 13px; text-align: center; }
  @media print { .noprint { display: none; } body { margin: 24px; } }
</style></head><body>
  <button class="noprint" onclick="window.print()" style="float:right;padding:8px 14px;font-size:14px;cursor:pointer">Imprimir / guardar PDF</button>
  <h1>${escape(schoolName)}</h1>
  <h2>Reporte escrito de conducta</h2>
  <table>
    <tr><td>Estudiante</td><td><strong>${escape(report.student.firstName)} ${escape(report.student.lastName)}</strong>${report.student.code ? ` · ${escape(report.student.code)}` : ''}</td></tr>
    ${report.section ? `<tr><td>Sección</td><td>${escape(report.section.name)}</td></tr>` : ''}
    <tr><td>Fecha del hecho</td><td>${escape(formatDate(report.incidentDate, { day: 'numeric', month: 'long', year: 'numeric' }))}</td></tr>
    <tr><td>Tipo</td><td>${escape(category)}</td></tr>
    <tr><td>Reportado por</td><td>${escape(report.reportedBy.name)}</td></tr>
  </table>
  <p><strong>Descripción de lo ocurrido</strong></p>
  <div class="box">${escape(report.description)}</div>
  <p class="note">Este es el segundo reporte de conducta del estudiante en el ciclo y queda registrado como reporte escrito en su expediente.
  De presentarse un nuevo reporte, la institución citará a una reunión con los tutores o la familia.</p>
  <div class="signs"><div>Firma del docente / Dirección</div><div>Firma del padre, madre o encargado</div></div>
</body></html>`);
  win.document.close();
}

export function PrintWrittenButton({ report, schoolName }) {
  if (report.stage !== 'ESCRITO') return null;
  return (
    <button
      type="button"
      onClick={() => printWrittenReport({ report, schoolName })}
      className="inline-flex h-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
    >
      <Printer className="size-3.5" /> Reporte escrito
    </button>
  );
}
