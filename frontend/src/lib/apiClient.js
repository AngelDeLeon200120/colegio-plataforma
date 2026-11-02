import { useAuthStore } from '@/features/auth/store';
import { refreshSession } from '@/features/auth/session';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(status, error = {}) {
    super(error.message ?? 'No se pudo completar la solicitud');
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code ?? 'UNKNOWN';
    this.details = error.details ?? [];
    this.requestId = error.requestId;
  }
}

// Con estos códigos la sesión ya no sirve: el router manda al login
const SESSION_ENDED = new Set(['UNAUTHENTICATED', 'INVALID_TOKEN', 'SESSION_REVOKED', 'TOKEN_EXPIRED']);

/** fetch autenticado: renueva el token una vez si expiró. Devuelve la Response. */
async function request(path, { method = 'GET', body, signal, retry = true, accept = 'application/json' } = {}) {
  const token = useAuthStore.getState().accessToken;
  const isForm = body instanceof FormData;

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    signal,
    credentials: 'include',
    headers: {
      Accept: accept,
      // Con FormData el navegador pone el Content-Type con su boundary
      ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined || isForm ? body : JSON.stringify(body),
  });

  if (res.status === 401) {
    const code = (await res.clone().json().catch(() => null))?.error?.code;
    if (code === 'TOKEN_EXPIRED' && retry && (await refreshSession())) {
      return request(path, { method, body, signal, retry: false, accept });
    }
    if (SESSION_ENDED.has(code)) useAuthStore.getState().clear();
  }
  return res;
}

async function toApiError(res) {
  const payload = await res.json().catch(() => null);
  return new ApiError(res.status, payload?.error);
}

export async function api(path, options) {
  const res = await request(path, options);
  if (res.status === 204) return null;
  if (!res.ok) throw await toApiError(res);
  return (await res.json().catch(() => null))?.data;
}

/**
 * POST multipart con progreso de subida (fetch no lo informa).
 * `onProgress` recibe un número de 0 a 1.
 */
export function apiUpload(path, formData, { onProgress, retry = true } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/v1${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    const token = useAuthStore.getState().accessToken;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);

    xhr.onload = async () => {
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        // respuesta sin cuerpo JSON
      }
      const code = payload?.error?.code;
      if (xhr.status === 401 && code === 'TOKEN_EXPIRED' && retry && (await refreshSession())) {
        resolve(apiUpload(path, formData, { onProgress, retry: false }));
        return;
      }
      if (xhr.status === 401 && SESSION_ENDED.has(code)) useAuthStore.getState().clear();
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload?.data);
      else reject(new ApiError(xhr.status, payload?.error));
    };
    xhr.onerror = () =>
      reject(new ApiError(0, { code: 'NETWORK_ERROR', message: 'Sin conexión. Revisa tu internet e intenta de nuevo.' }));

    xhr.send(formData);
  });
}

/**
 * Abre un archivo protegido en otra pestaña mediante una URL firmada de 5 minutos.
 * La pestaña se abre antes del await para que el navegador no la bloquee como popup.
 */
export async function openFile(fileId) {
  const tab = window.open('about:blank', '_blank');
  try {
    const { url } = await api(`/files/${fileId}/url`);
    if (tab) {
      tab.opener = null;
      tab.location.replace(`${API_URL}${url}`);
    } else {
      window.location.assign(`${API_URL}${url}`);
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/** Descarga un archivo protegido (no sirve un <a href>: necesita el token). */
export async function apiDownload(path) {
  const res = await request(path, { accept: '*/*' });
  if (!res.ok) throw await toApiError(res);

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'descarga';
  const url = URL.createObjectURL(await res.blob());

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
