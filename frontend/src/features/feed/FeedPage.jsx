import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  CalendarDays,
  ImagePlus,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Newspaper,
  Pin,
  PinOff,
  Send,
  ThumbsUp,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/store';
import { useAgenda } from '@/features/calendar/hooks';
import { CATEGORY_LOOK } from '@/features/calendar/model';
import { ROLE_LABELS } from '@/features/messages/model';
import { cn } from '@/lib/cn';
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format';
import {
  useAllComments,
  useComment,
  useCreatePost,
  useDeleteComment,
  useDeletePost,
  useFeed,
  useFeedLive,
  useImageUrl,
  useReact,
  useUpdatePost,
} from './hooks';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function Composer() {
  const user = useAuthStore((state) => state.user);
  const create = useCreatePost();
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);
  const [isPinned, setIsPinned] = useState(false);
  const [problem, setProblem] = useState(null);
  const fileInput = useRef(null);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (file) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setProblem('Usa una imagen JPG, PNG, GIF o WEBP.');
    if (file.size > MAX_IMAGE_BYTES) return setProblem(`La imagen pesa ${formatBytes(file.size)}; el máximo es 8 MB.`);
    setProblem(null);
    setImage(file);
  };

  const publish = () => {
    if (!body.trim()) return setProblem('Escribe algo para publicar.');
    create.mutate(
      { body: body.trim(), image, isPinned },
      {
        onSuccess: () => {
          setBody('');
          setImage(null);
          setIsPinned(false);
          setProblem(null);
        },
      },
    );
  };

  return (
    <section className="rounded-lg border border-zinc-300 bg-white p-4" aria-label="Nueva publicación">
      <div className="flex gap-3">
        <Avatar firstName={user.firstName} lastName={user.lastName} size="lg" />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={body ? 4 : 2}
          maxLength={5000}
          placeholder="Comparte un aviso con toda la comunidad del colegio"
          aria-label="Texto de la publicación"
          className="block min-h-12 flex-1 resize-y rounded-2xl bg-zinc-100 px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </div>
      {preview && (
        <div className="relative mt-3 ml-13 w-fit">
          <img src={preview} alt="Vista previa" className="max-h-60 rounded-lg border border-zinc-200 object-contain" />
          <button
            type="button"
            onClick={() => setImage(null)}
            className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-zinc-900/70 text-white hover:bg-zinc-900"
            aria-label="Quitar imagen"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {(problem || create.error) && (
        <p role="alert" className="mt-2 ml-13 text-xs text-red-600">
          {problem ?? create.error.message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
        <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={(event) => pick(event.target.files[0])} />
        <Button variant="ghost" size="sm" onClick={() => fileInput.current.click()}>
          <ImagePlus className="size-4 text-emerald-600" /> Foto
        </Button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100">
          <input type="checkbox" checked={isPinned} onChange={(event) => setIsPinned(event.target.checked)} className="accent-brand-600" />
          <Pin className="size-3.5 text-amber-600" /> Fijar arriba
        </label>
        <Button variant="primary" className="ml-auto" onClick={publish} loading={create.isPending}>
          Publicar
        </Button>
      </div>
    </section>
  );
}

function PostImage({ image }) {
  const { data: url, isLoading } = useImageUrl(image.id);
  if (isLoading) return <Skeleton className="h-64 w-full rounded-none" />;
  if (!url) return null;
  return <img src={url} alt={image.name} className="max-h-[520px] w-full bg-zinc-100 object-contain" loading="lazy" />;
}

function Comment({ comment, canDelete }) {
  const remove = useDeleteComment();
  return (
    <li className="group flex gap-2">
      <Avatar firstName={comment.author.firstName} lastName={comment.author.lastName} size="sm" />
      <div className="min-w-0">
        <div className="rounded-2xl bg-zinc-100 px-3 py-2">
          <p className="text-xs font-semibold text-zinc-900">
            {comment.author.firstName} {comment.author.lastName}
            <span className="ml-1.5 font-normal text-zinc-500">{ROLE_LABELS[comment.author.role]}</span>
          </p>
          <p className="text-sm whitespace-pre-wrap break-words text-zinc-800">{comment.body}</p>
        </div>
        <p className="mt-0.5 flex gap-3 px-3 text-[11px] text-zinc-500">
          <span title={formatDateTime(comment.createdAt)}>{formatRelative(comment.createdAt)}</span>
          {canDelete && (
            <button type="button" onClick={() => remove.mutate(comment.id)} className="font-medium hover:text-red-600" disabled={remove.isPending}>
              Eliminar
            </button>
          )}
        </p>
      </div>
    </li>
  );
}

function PostCard({ post, focused }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user.role === 'ADMIN';
  const react = useReact();
  const comment = useComment();
  const update = useUpdatePost();
  const remove = useDeletePost();
  const [text, setText] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const commentInput = useRef(null);
  const all = useAllComments(post.id, showAll);
  const comments = showAll && all.data ? all.data : post.comments;

  // Respuesta inmediata: el "Me gusta" cambia antes de que conteste el servidor
  const [optimistic, setOptimistic] = useState(null);
  const liked = optimistic?.liked ?? post.reactedByMe;
  const likes = optimistic?.count ?? post.reactionCount;
  const toggleLike = () => {
    const next = !liked;
    setOptimistic({ liked: next, count: likes + (next ? 1 : -1) });
    react.mutate({ postId: post.id, on: next }, { onSettled: () => setOptimistic(null) });
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    comment.mutate({ postId: post.id, body }, { onSuccess: () => setText('') });
  };

  return (
    <article
      id={`post-${post.id}`}
      className={cn(
        'scroll-mt-4 overflow-hidden rounded-lg border bg-white transition-shadow',
        post.isPinned ? 'border-amber-300' : 'border-zinc-300',
        focused && 'ring-2 ring-brand-500 ring-offset-2',
      )}
    >
      {post.isPinned && (
        <p className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-800">
          <Pin className="size-3.5" /> Publicación fijada
        </p>
      )}
      <header className="flex items-start gap-3 px-4 pt-4">
        <Avatar firstName={post.author.firstName} lastName={post.author.lastName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">
            {post.author.firstName} {post.author.lastName}
          </p>
          <p className="text-xs text-zinc-500">
            {ROLE_LABELS[post.author.role]} · <span title={formatDateTime(post.createdAt)}>{formatRelative(post.createdAt)}</span>
          </p>
        </div>
        {isAdmin && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex size-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
              aria-label="Opciones de la publicación"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="size-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50"
                  onClick={() => {
                    setMenuOpen(false);
                    update.mutate({ postId: post.id, isPinned: !post.isPinned });
                  }}
                >
                  {post.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />} {post.isPinned ? 'Desfijar' : 'Fijar arriba'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setMenuOpen(false);
                    if (window.confirm('¿Eliminar esta publicación? Dejará de verse en el Inicio de todos.')) remove.mutate(post.id);
                  }}
                >
                  <Trash2 className="size-4" /> Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <p className="px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-zinc-900">{post.body}</p>
      {post.image && <PostImage image={post.image} />}

      {(likes > 0 || post.commentCount > 0) && (
        <div className="flex items-center justify-between px-4 py-2 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            {likes > 0 && (
              <>
                <span className="flex size-4 items-center justify-center rounded-full bg-brand-600 text-white">
                  <ThumbsUp className="size-2.5" />
                </span>
                {likes}
              </>
            )}
          </span>
          {post.commentCount > 0 && (
            <button type="button" className="hover:underline" onClick={() => setShowAll(true)}>
              {post.commentCount} comentario{post.commentCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      <div className="mx-4 flex border-y border-zinc-200 py-1">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100',
            liked ? 'text-brand-700' : 'text-zinc-600',
          )}
        >
          <ThumbsUp className={cn('size-4', liked && 'fill-current')} /> Me gusta
        </button>
        <button
          type="button"
          onClick={() => commentInput.current?.focus()}
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
        >
          <MessageCircle className="size-4" /> Comentar
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        {!showAll && post.commentCount > post.comments.length && (
          <button type="button" className="text-xs font-medium text-zinc-600 hover:underline" onClick={() => setShowAll(true)}>
            Ver los {post.commentCount} comentarios
          </button>
        )}
        {all.isFetching && <Loader2 className="size-4 animate-spin text-zinc-400" />}
        {comments.length > 0 && (
          <ul className="space-y-2.5">
            {comments.map((item) => (
              <Comment key={item.id} comment={item} canDelete={isAdmin || item.author.id === user.id} />
            ))}
          </ul>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
          <input
            ref={commentInput}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={1000}
            placeholder="Escribe un comentario"
            aria-label="Comentario"
            className="h-9 min-w-0 flex-1 rounded-full bg-zinc-100 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || comment.isPending}
            className="flex size-9 items-center justify-center rounded-full text-brand-700 hover:bg-brand-50 disabled:text-zinc-300"
            aria-label="Enviar comentario"
          >
            {comment.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
        {comment.error && <p className="text-xs text-red-600">{comment.error.message}</p>}
      </div>
    </article>
  );
}

/** Columna lateral: lo que viene en las próximas dos semanas, desde el calendario. */
function UpcomingPanel() {
  const [range] = useState(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);
    return { from: from.toISOString(), to: to.toISOString() };
  });
  const { data, isLoading } = useAgenda(range);
  const items = [
    ...(data?.events ?? []).map((event) => ({ key: `e${event.id}`, at: event.startsAt, title: event.title, color: CATEGORY_LOOK[event.category].color, icon: CalendarDays })),
    ...(data?.meetings ?? []).map((meeting) => ({ key: `m${meeting.id}`, at: meeting.startsAt, title: meeting.title, color: '#7c3aed', icon: Video, sub: meeting.course.name })),
  ]
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .slice(0, 6);

  return (
    <aside className="hidden w-80 shrink-0 xl:block">
      <section className="sticky top-6 rounded-lg border border-zinc-300 bg-white">
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Próximamente</h2>
          <Link to="/calendar" className="text-xs font-medium text-brand-700 hover:underline">
            Ver calendario
          </Link>
        </header>
        <ul className="divide-y divide-zinc-100">
          {isLoading && (
            <li className="p-4">
              <Skeleton className="h-10 w-full" />
            </li>
          )}
          {data && items.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-500">Nada programado en las próximas dos semanas.</li>}
          {items.map((item) => (
            <li key={item.key} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: item.color }}>
                <item.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
                <p className="truncate text-xs text-zinc-500">
                  {formatDateTime(item.at)}
                  {item.sub && ` · ${item.sub}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

export function FeedPage() {
  const user = useAuthStore((state) => state.user);
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeed();
  useFeedLive();
  // Al abrir una notificación (?post=ID) se lleva a esa publicación y se resalta
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('post');
  const loaded = Boolean(data);
  useEffect(() => {
    if (!focusId || !loaded) return;
    document.getElementById(`post-${focusId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focusId, loaded]);

  const first = data?.pages[0];
  const pinned = first?.pinned ?? [];
  const posts = data?.pages.flatMap((page) => page.posts) ?? [];
  const canPublish = first?.canPublish ?? user.role === 'ADMIN';

  return (
    <div className="w-full overflow-y-auto bg-zinc-50">
      <div className="mx-auto flex max-w-5xl gap-6 px-4 py-6 sm:px-6">
        <div className="min-w-0 flex-1 space-y-4">
          <header>
            <h1 className="text-2xl font-normal text-zinc-900">Inicio</h1>
            <p className="mt-0.5 text-sm text-zinc-500">Avisos y novedades del colegio. Reacciona y comenta.</p>
          </header>

          {canPublish && <Composer />}

          {isError && (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="size-4" /> {error.message}
            </p>
          )}
          {isLoading && Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-48 w-full rounded-lg" />)}
          {data && !pinned.length && !posts.length && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white py-14 text-center">
              <Newspaper className="size-8 text-zinc-300" />
              <p className="text-sm text-zinc-500">
                {canPublish ? 'Aún no hay publicaciones. Escribe la primera arriba.' : 'Aún no hay publicaciones del colegio.'}
              </p>
            </div>
          )}

          {[...pinned, ...posts].map((post) => (
            <PostCard key={post.id} post={post} focused={String(post.id) === focusId} />
          ))}

          {hasNextPage && (
            <div className="flex justify-center">
              <Button onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                Ver publicaciones anteriores
              </Button>
            </div>
          )}
        </div>
        <UpcomingPanel />
      </div>
    </div>
  );
}
