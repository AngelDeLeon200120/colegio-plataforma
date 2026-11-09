import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { signedFileUrl } from '@/lib/apiClient';
import { getSocket } from '@/lib/socket';
import { feedApi } from './api';

export const feedKeys = {
  all: ['feed'],
  list: ['feed', 'list'],
  comments: (postId) => ['feed', 'comments', String(postId)],
};

export function useFeed() {
  return useInfiniteQuery({
    queryKey: feedKeys.list,
    queryFn: ({ pageParam }) => feedApi.list({ cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** Lo que publica, comenta o reacciona otra persona refresca el muro abierto. */
export function useFeedLive() {
  const myId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const onChanged = ({ data }) => {
      if (data.by === myId) return;
      queryClient.invalidateQueries({ queryKey: feedKeys.all });
    };
    socket.on('feed:changed', onChanged);
    return () => socket.off('feed:changed', onChanged);
  }, [myId, queryClient]);
}

function useFeedMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }) });
}

export const useCreatePost = () => useFeedMutation(feedApi.create);
export const useUpdatePost = () => useFeedMutation(({ postId, ...body }) => feedApi.update(postId, body));
export const useDeletePost = () => useFeedMutation(feedApi.remove);
export const useReact = () => useFeedMutation(({ postId, on }) => feedApi.react(postId, on));
export const useComment = () => useFeedMutation(({ postId, body }) => feedApi.comment(postId, body));
export const useDeleteComment = () => useFeedMutation(feedApi.removeComment);

export function useAllComments(postId, enabled) {
  return useQuery({ queryKey: feedKeys.comments(postId), queryFn: () => feedApi.comments(postId), enabled });
}

/** La URL firmada dura 5 minutos: basta para cargar la imagen. */
export function useImageUrl(fileId) {
  return useQuery({ queryKey: ['file-url', fileId], queryFn: () => signedFileUrl(fileId), enabled: Boolean(fileId), staleTime: 4 * 60_000 });
}
