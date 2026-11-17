import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Paperclip, Send, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/store';
import { cn } from '@/lib/cn';
import { CHAT_EXTENSIONS, DropOverlay, MessageAttachments, PendingFiles, checkFiles } from './Attachments';
import {
  useDeleteStaffMessage,
  useMarkStaffChatRead,
  useSendStaffMessage,
  useSetMembership,
  useStaffChatMembers,
  useStaffChatMessages,
  useStaffChatRoster,
} from './hooks';

const ROLE = { ADMIN: 'Administración', TEACHER: 'Docente' };
const dayFormat = new Intl.DateTimeFormat('es-GT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const timeFormat = new Intl.DateTimeFormat('es-GT', {
  hour: 'numeric',
  minute: '2-digit',
});

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  const text = dayFormat.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Administración: todo el personal del colegio y si está en la sala.
 * Puede sacar o volver a incluir docentes (la administración siempre está).
 */
function RosterPanel() {
  const { data: roster = [], isLoading } = useStaffChatRoster(true);
  const setMembership = useSetMembership();
  const pendingId = setMembership.isPending ? setMembership.variables?.userId : null;
  const outside = roster.filter((person) => !person.included).length;

  return (
    <section className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 sm:px-6" aria-label="Miembros de la sala">
      <p className="mb-2 text-xs text-zinc-500">
        Los docentes nuevos entran solos. Puedes sacar o volver a incluir a cualquier docente de este colegio.
        {outside > 0 && ` Fuera de la sala: ${outside}.`}
      </p>
      {isLoading && <Skeleton className="h-10 w-full rounded-lg" />}
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {roster.map((person) => (
          <li
            key={person.id}
            className={cn(
              'flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-zinc-200',
              !person.included && 'opacity-70',
            )}
          >
            <Avatar firstName={person.firstName} lastName={person.lastName} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-zinc-900">
                {person.firstName} {person.lastName}
              </span>
              <span className="block truncate text-[11px] text-zinc-500">
                {ROLE[person.role]}
                {!person.included && ` · fuera de la sala${person.removedBy ? ` (lo sacó ${person.removedBy})` : ''}`}
              </span>
            </span>
            {person.role === 'TEACHER' &&
              (person.included ? (
                <Button
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  loading={pendingId === person.id}
                  onClick={() =>
                    window.confirm(`¿Sacar a ${person.firstName} ${person.lastName} de la sala de docentes? Dejará de ver los mensajes.`) &&
                    setMembership.mutate({ userId: person.id, included: false })
                  }
                >
                  <UserMinus className="size-3.5" /> Sacar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  loading={pendingId === person.id}
                  onClick={() => setMembership.mutate({ userId: person.id, included: true })}
                >
                  <UserPlus className="size-3.5" /> Incluir
                </Button>
              ))}
          </li>
        ))}
      </ul>
      {setMembership.error && <p className="mt-2 text-xs text-red-600">{setMembership.error.message}</p>}
    </section>
  );
}

/** Sala del personal: la administración y todos los docentes del colegio conversan en un solo chat. */
export function StaffChatPage() {
  const me = useAuthStore((state) => state.user);
  const { data, isLoading, isError, error, fetchPreviousPage, hasPreviousPage, isFetchingPreviousPage } = useStaffChatMessages();
  // La administración sacó a esta persona de la sala: se ve el aviso y no el cuadro para escribir
  const removed = isError && error?.status === 403;
  const { data: members = [] } = useStaffChatMembers();
  const send = useSendStaffMessage();
  const remove = useDeleteStaffMessage();
  const markRead = useMarkStaffChatRead();
  const [text, setText] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [files, setFiles] = useState([]);
  const [fileProblem, setFileProblem] = useState(null);
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const addFiles = (incoming) => {
    const { accepted, problem } = checkFiles(files, [...incoming]);
    setFileProblem(problem);
    if (accepted.length) setFiles((current) => [...current, ...accepted]);
  };
  const scroller = useRef(null);
  const stickToBottom = useRef(true);
  const previousHeight = useRef(null);

  const messages = data?.pages.flatMap((page) => page.messages) ?? [];
  const canModerate = data?.pages[0]?.canModerate ?? false;
  const lastId = messages.at(-1)?.id;

  // Al llegar mensajes nuevos se baja al final (salvo que la persona esté leyendo más arriba);
  // al cargar anteriores se conserva la posición.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (previousHeight.current !== null) {
      el.scrollTop = el.scrollHeight - previousHeight.current;
      previousHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  // Leer la sala marca hasta el último mensaje (y baja el contador del menú)
  useEffect(() => {
    if (lastId && document.visibilityState === 'visible') markRead.mutate(lastId);
  }, [lastId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = () => {
    previousHeight.current = scroller.current?.scrollHeight ?? null;
    fetchPreviousPage();
  };

  const submit = () => {
    const body = text.trim();
    if ((!body && !files.length) || send.isPending) return;
    stickToBottom.current = true;
    setProgress(files.length ? 0 : null);
    send.mutate(
      { body, files, onProgress: setProgress },
      {
        onSuccess: () => {
          setText('');
          setFiles([]);
          setFileProblem(null);
        },
        onSettled: () => setProgress(null),
      },
    );
  };

  let previousDay = null;
  let previousAuthor = null;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      {dragging && <DropOverlay />}
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-600 text-white">
          <Users className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg text-zinc-900">Sala de docentes</h1>
          <p className="truncate text-xs text-zinc-500">Administración y todos los docentes del colegio · solo el personal la ve</p>
        </div>
        <button
          type="button"
          onClick={() => setShowMembers((open) => !open)}
          className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          aria-expanded={showMembers}
        >
          <Users className="size-3.5" /> {members.length} {members.length === 1 ? 'miembro' : 'miembros'}
        </button>
      </header>

      {showMembers && me.role === 'ADMIN' && <RosterPanel />}
      {showMembers && me.role !== 'ADMIN' && (
        <ul className="flex flex-wrap gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 sm:px-6">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-xs ring-1 ring-zinc-200">
              <Avatar firstName={member.firstName} lastName={member.lastName} size="sm" />
              {member.firstName} {member.lastName}
              <span className="text-zinc-400">· {ROLE[member.role]}</span>
            </li>
          ))}
        </ul>
      )}

      <div
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 px-4 py-4 sm:px-6"
      >
        {isError && (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="size-4" /> {error.message}
          </p>
        )}
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3 rounded-xl" />
            <Skeleton className="ml-auto h-12 w-1/2 rounded-xl" />
          </div>
        )}
        {hasPreviousPage && (
          <div className="mb-3 flex justify-center">
            <Button size="sm" onClick={loadOlder} loading={isFetchingPreviousPage}>
              Ver mensajes anteriores
            </Button>
          </div>
        )}
        {data && messages.length === 0 && (
          <p className="py-16 text-center text-sm text-zinc-500">Aún no hay mensajes. Escribe el primero para todo el personal.</p>
        )}

        <ol className="space-y-1">
          {messages.map((message) => {
            const date = new Date(message.createdAt);
            const day = date.toDateString();
            const newDay = day !== previousDay;
            const grouped = !newDay && previousAuthor === message.author.id;
            previousDay = day;
            previousAuthor = message.author.id;
            const mine = message.author.id === me.id;
            const canDelete = !message.deleted && (mine || canModerate);
            return (
              <li key={message.id}>
                {newDay && (
                  <p className="my-3 text-center">
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-200">
                      {dayLabel(date)}
                    </span>
                  </p>
                )}
                <div className={cn('group flex gap-2.5', mine && 'flex-row-reverse', !grouped && 'mt-3')}>
                  <span className="w-8 shrink-0">
                    {!grouped && !mine && <Avatar firstName={message.author.firstName} lastName={message.author.lastName} size="sm" />}
                  </span>
                  <div className={cn('flex max-w-[78%] min-w-0 flex-col', mine && 'items-end')}>
                    {!grouped && !mine && (
                      <p className="mb-0.5 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-700">
                          {message.author.firstName} {message.author.lastName}
                        </span>
                        {message.author.role === 'ADMIN' && <span className="ml-1 text-brand-700">· Administración</span>}
                      </p>
                    )}
                    <div className={cn('flex items-end gap-1.5', mine && 'flex-row-reverse')}>
                      <span className={cn('flex min-w-0 flex-col gap-1.5', mine && 'items-end')}>
                        {!message.deleted && <MessageAttachments attachments={message.attachments} mine={mine} />}
                        {(message.deleted || message.body) && (
                          <p
                            className={cn(
                              'rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap',
                              message.deleted
                                ? 'bg-transparent text-zinc-400 italic ring-1 ring-zinc-200'
                                : mine
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-white text-zinc-900 ring-1 ring-zinc-200',
                            )}
                          >
                            {message.deleted ? 'Mensaje eliminado' : message.body}
                          </p>
                        )}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-400" title={date.toLocaleString('es-GT')}>
                        {timeFormat.format(date)}
                      </span>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => window.confirm('¿Eliminar este mensaje para todos?') && remove.mutate(message.id)}
                          className="rounded p-1 text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-200 hover:text-red-600 focus-visible:opacity-100"
                          aria-label="Eliminar mensaje"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {!removed && (
        <>
          <PendingFiles
            files={files}
            disabled={send.isPending}
            onRemove={(index) => setFiles((current) => current.filter((_, i) => i !== index))}
          />
          {progress !== null && (
            <div className="bg-white px-4 pt-2 sm:px-6">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-zinc-200"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">Subiendo… {Math.round(progress * 100)}%</p>
            </div>
          )}
          {fileProblem && <p className="bg-white px-4 pt-2 text-xs text-red-600 sm:px-6">{fileProblem}</p>}
          <form
            className={cn('flex items-end gap-2 bg-white px-4 py-3 sm:px-6', !files.length && 'border-t border-zinc-200')}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={CHAT_EXTENSIONS.map((extension) => `.${extension}`).join(',') + ',image/*,video/*'}
              className="hidden"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current.click()}
              disabled={send.isPending}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
              aria-label="Adjuntar fotos, videos o archivos"
              title="Adjuntar fotos, videos o archivos (hasta 5, de 50 MB)"
            >
              <Paperclip className="size-5" />
            </button>
            <textarea
              onPaste={(event) => {
                // Pegar una captura o foto la adjunta
                if (event.clipboardData.files.length) {
                  event.preventDefault();
                  addFiles(event.clipboardData.files);
                }
              }}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                // Enter envía; Shift+Enter hace un salto de línea
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={files.length ? 'Agrega un comentario (opcional)' : 'Escribe un mensaje o adjunta fotos, videos o archivos'}
              aria-label="Mensaje"
              className="block max-h-40 min-h-10 flex-1 resize-y rounded-2xl border border-zinc-300 px-4 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
            <Button type="submit" variant="primary" disabled={!text.trim() && !files.length} loading={send.isPending}>
              <Send className="size-4" /> Enviar
            </Button>
          </form>
          {send.error && <p className="bg-white px-6 pb-2 text-xs text-red-600">{send.error.message}</p>}
        </>
      )}
    </div>
  );
}
