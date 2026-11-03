import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, Inbox, Megaphone, PenSquare, Send } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/store';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useReply, useThread, useThreads } from './hooks';
import { FILTERS, ROLE_LABELS, lookOf, topicLabel } from './model';
import { NewMessageDialog } from './NewMessageDialog';

function TopicIcon({ thread, size = 'md' }) {
  const look = lookOf(thread);
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full text-white', size === 'md' ? 'size-10' : 'size-8')}
      style={{ backgroundColor: look.color }}
      aria-hidden
    >
      <look.icon className={size === 'md' ? 'size-5' : 'size-4'} />
    </span>
  );
}

/** "Ana López · 3ro B" o "Toda la sección 3ro B". */
const audienceOf = (thread) =>
  thread.scope === 'SECTION' ? `Toda la sección ${thread.section.name}` : `${thread.student.firstName} ${thread.student.lastName} · ${thread.section.name}`;

function ThreadRow({ thread, selected }) {
  return (
    <li>
      <Link
        to={`/messages/${thread.id}`}
        className={cn(
          'flex gap-3 px-4 py-3 transition-colors hover:bg-zinc-50',
          selected && 'bg-brand-50 hover:bg-brand-50',
        )}
      >
        <TopicIcon thread={thread} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className={cn('min-w-0 flex-1 truncate text-sm', thread.unread ? 'font-semibold text-zinc-900' : 'text-zinc-800')}>{thread.subject}</p>
            <span className="shrink-0 text-xs text-zinc-500">{formatRelative(thread.lastMessageAt)}</span>
          </div>
          <p className="truncate text-xs text-zinc-500">
            {topicLabel(thread)} · {audienceOf(thread)}
          </p>
          {thread.lastMessage && (
            <p className={cn('mt-0.5 truncate text-sm', thread.unread ? 'text-zinc-800' : 'text-zinc-500')}>
              {thread.lastMessage.authorFirstName}: {thread.lastMessage.preview}
            </p>
          )}
        </div>
        {thread.unread && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-600" aria-label="Sin leer" />}
      </Link>
    </li>
  );
}

function ThreadView({ threadId, onBack }) {
  const userId = useAuthStore((state) => state.user?.id);
  const { data, isLoading, isError, error } = useThread(threadId);
  const reply = useReply(threadId);
  const [text, setText] = useState('');
  const endRef = useRef(null);

  // Con llaves: en navegadores recientes scrollIntoView devuelve una promesa, y React la tomaría por la limpieza
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <AlertTriangle className="size-8 text-amber-500" />
        <p className="text-sm text-zinc-600">{error.message}</p>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="flex-1 space-y-3 p-6">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-3/4 rounded-xl" />
      </div>
    );
  }

  const { thread, messages } = data;
  const send = () => {
    const body = text.trim();
    if (!body) return;
    reply.mutate(body, { onSuccess: () => setText('') });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 sm:px-6">
        <button type="button" onClick={onBack} className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 lg:hidden" aria-label="Volver a la bandeja">
          <ArrowLeft className="size-5" />
        </button>
        <TopicIcon thread={thread} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg text-zinc-900">{thread.subject}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            <Badge tone={thread.topic === 'AUSENCIA' ? 'amber' : 'blue'}>{topicLabel(thread)}</Badge>
            <span>{audienceOf(thread)}</span>
          </div>
        </div>
      </header>

      <ol className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.map((message) => {
          const mine = message.author.id === userId;
          return (
            <li key={message.id} className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
              <Avatar firstName={message.author.firstName} lastName={message.author.lastName} size="sm" />
              <div className={cn('max-w-[80%] min-w-0', mine && 'text-right')}>
                <p className="text-xs text-zinc-500">
                  <span className="font-medium text-zinc-700">{mine ? 'Tú' : `${message.author.firstName} ${message.author.lastName}`}</span>
                  {!mine && ` · ${ROLE_LABELS[message.author.role]}`} · {formatDateTime(message.createdAt)}
                </p>
                <p
                  className={cn(
                    'mt-1 inline-block rounded-2xl px-3.5 py-2 text-left text-sm whitespace-pre-wrap break-words',
                    mine ? 'rounded-tr-sm bg-brand-600 text-white' : 'rounded-tl-sm bg-zinc-100 text-zinc-900',
                  )}
                >
                  {message.body}
                </p>
              </div>
            </li>
          );
        })}
        <li ref={endRef} aria-hidden />
      </ol>

      {thread.canReply ? (
        <form
          className="flex items-end gap-2 border-t border-zinc-200 px-4 py-3 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send();
            }}
            rows={2}
            maxLength={5000}
            placeholder="Escribe una respuesta"
            aria-label="Respuesta"
            className="block min-h-10 flex-1 resize-none rounded-2xl border border-zinc-300 px-4 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
          <Button type="submit" variant="primary" loading={reply.isPending} disabled={!text.trim()}>
            <Send className="size-4" /> Enviar
          </Button>
        </form>
      ) : (
        <p className="flex items-center gap-2 border-t border-zinc-200 px-6 py-3 text-xs text-zinc-500">
          <Megaphone className="size-4" /> Aviso para toda la sección: solo el personal del colegio responde aquí. Para algo de tu estudiante, escribe un mensaje nuevo.
        </p>
      )}
      {reply.error && <p className="px-6 pb-3 text-xs text-red-600">{reply.error.message}</p>}
    </div>
  );
}

export function MessagesPage() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const [filterId, setFilterId] = useState('ALL');
  const [composing, setComposing] = useState(false);
  const filter = FILTERS.find((item) => item.id === filterId) ?? FILTERS[0];
  const { data, isLoading, isError, error } = useThreads(filter.query);
  const threads = data?.threads ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('flex min-h-0 flex-1', threadId && 'max-lg:flex-col')}>
        <section className={cn('flex min-h-0 w-full flex-col border-zinc-200 lg:w-[400px] lg:shrink-0 lg:border-r', threadId && 'max-lg:hidden')}>
          <div className="px-4 pt-6 pb-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-normal text-zinc-900">Mensajes</h1>
              <Button variant="primary" onClick={() => setComposing(true)}>
                <PenSquare className="size-4" /> Nuevo
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por asunto">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === filterId}
                  onClick={() => setFilterId(item.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    item.id === filterId ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-zinc-100 overflow-y-auto border-t border-zinc-200">
            {isLoading &&
              Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="flex gap-3 px-4 py-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </li>
              ))}
            {isError && <li className="px-6 py-6 text-sm text-red-600">{error.message}</li>}
            {data && threads.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-zinc-500">
                <Inbox className="size-8 text-zinc-300" />
                {filter.id === 'ALL' ? 'Aún no hay mensajes.' : `No hay mensajes de «${filter.label}».`}
              </li>
            )}
            {threads.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} selected={String(thread.id) === threadId} />
            ))}
          </ul>
        </section>

        <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col', !threadId && 'max-lg:hidden')}>
          {threadId ? (
            <ThreadView key={threadId} threadId={threadId} onBack={() => navigate('/messages')} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-zinc-500">
              <Inbox className="size-10 text-zinc-300" />
              Elige una conversación o escribe un mensaje nuevo.
            </div>
          )}
        </section>
      </div>

      {composing && (
        <NewMessageDialog
          onClose={() => setComposing(false)}
          onCreated={(id) => {
            setComposing(false);
            navigate(`/messages/${id}`);
          }}
        />
      )}
    </div>
  );
}
