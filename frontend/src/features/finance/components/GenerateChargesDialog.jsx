import { useId, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useConcepts, useGenerateCharges } from '../hooks';

const inputClass =
  'h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function nextMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1, 1);
  const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return { period, monthName: MONTHS[date.getMonth()], dueDate: `${period}-05` };
}

/** Cobro masivo: un cargo por estudiante inscrito. Repetirlo no duplica. */
export function GenerateChargesDialog({ onClose }) {
  const { data: concepts = [] } = useConcepts();
  const generate = useGenerateCharges();
  const defaults = nextMonth();

  const [conceptId, setConceptId] = useState('');
  const [period, setPeriod] = useState(defaults.period);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(defaults.dueDate);
  const [result, setResult] = useState(null);
  const ids = { concept: useId(), period: useId(), description: useId(), amount: useId(), due: useId() };

  const active = concepts.filter((concept) => concept.isActive);
  const concept = active.find((item) => String(item.id) === conceptId) ?? active.find((item) => item.code === 'COLEG') ?? active[0];
  const effectiveDescription = description || (concept ? `${concept.name} ${defaults.monthName}` : '');
  const effectiveAmount = amount === '' ? concept?.defaultAmount : Number(amount.replace(',', '.'));
  const valid = concept && period.trim() && effectiveDescription.trim() && effectiveAmount > 0 && dueDate;

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    try {
      setResult(
        await generate.mutateAsync({
          feeConceptId: concept.id,
          periodLabel: period.trim(),
          description: effectiveDescription.trim(),
          amount: effectiveAmount,
          dueDate,
        }),
      );
    } catch {
      // el error se muestra desde la mutación
    }
  };

  if (result) {
    return (
      <Dialog open onClose={onClose} title="Cargos generados" footer={<Button variant="primary" onClick={onClose}>Listo</Button>}>
        <p className="flex items-start gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          Se crearon {result.created} cargo(s).
          {result.skipped > 0 && ` ${result.skipped} estudiante(s) ya tenían este cargo y no se duplicó.`}
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Generar cargos"
      description="Crea el cargo para todos los estudiantes inscritos en el ciclo activo."
      footer={
        <>
          <Button onClick={onClose} disabled={generate.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="charges-form" variant="primary" loading={generate.isPending} disabled={!valid}>
            Generar
          </Button>
        </>
      }
    >
      <form id="charges-form" onSubmit={submit} className="space-y-4">
        {generate.error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {generate.error.message}
          </p>
        )}
        <div className="space-y-1.5">
          <label htmlFor={ids.concept} className="block text-sm font-medium text-zinc-700">
            Concepto
          </label>
          <select id={ids.concept} value={concept ? String(concept.id) : ''} onChange={(e) => setConceptId(e.target.value)} className={inputClass}>
            {active.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.period} className="block text-sm font-medium text-zinc-700">
              Periodo
            </label>
            <input id={ids.period} value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={20} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.due} className="block text-sm font-medium text-zinc-700">
              Vence
            </label>
            <input id={ids.due} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.description} className="block text-sm font-medium text-zinc-700">
              Descripción
            </label>
            <input id={ids.description} value={description} placeholder={effectiveDescription} onChange={(e) => setDescription(e.target.value)} maxLength={200} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.amount} className="block text-sm font-medium text-zinc-700">
              Monto
            </label>
            <input id={ids.amount} value={amount} placeholder={concept ? String(concept.defaultAmount) : ''} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-zinc-500">El periodo identifica el cargo: si ya existe para un estudiante con ese concepto y periodo, no se vuelve a crear.</p>
      </form>
    </Dialog>
  );
}
