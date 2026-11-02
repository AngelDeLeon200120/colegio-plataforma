import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

/** Muestra una contraseña temporal UNA sola vez, para entregarla a la persona. */
export function TemporaryPasswordDialog({ name, email, password, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: la contraseña sigue visible para copiarla a mano
    }
  };

  return (
    <Dialog open onClose={onClose} title="Contraseña temporal" footer={<Button variant="primary" onClick={onClose}>Ya la entregué</Button>}>
      <div className="space-y-4 text-sm">
        <p className="text-zinc-600">
          Entrégasela a <span className="font-medium text-zinc-900">{name}</span> junto con su correo{' '}
          <span className="font-mono">{email}</span> y el código del colegio.
        </p>
        <div className="flex items-center gap-2 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <KeyRound className="size-4 shrink-0 text-zinc-400" />
          <code className="flex-1 font-mono text-base font-semibold tracking-wider select-all">{password}</code>
          <Button size="sm" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? 'Copiada' : 'Copiar'}
          </Button>
        </div>
        <p className="text-xs text-amber-700">
          Solo se muestra ahora. Si se pierde, restablécela de nuevo. Recomiéndale cambiarla desde su menú de usuario al entrar.
        </p>
      </div>
    </Dialog>
  );
}
