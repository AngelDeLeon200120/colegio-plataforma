import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const storageKey = (courseId) => `course-return:${courseId}`;

function readPlace(courseId) {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(courseId)));
  } catch {
    return null;
  }
}

function writePlace(courseId, place) {
  try {
    if (place) sessionStorage.setItem(storageKey(courseId), JSON.stringify(place));
    else sessionStorage.removeItem(storageKey(courseId));
  } catch {
    // Sin almacenamiento disponible solo se pierde la comodidad de volver al mismo lugar
  }
}

/** Enlace para volver al curso con el filtro que tenía al abrir una actividad. */
export function useCourseReturnPath(courseId) {
  const [search, setSearch] = useState('');
  // En un efecto: al dibujar por primera vez, la página del curso todavía no guardó su lugar
  useEffect(() => setSearch(courseId ? (readPlace(courseId)?.search ?? '') : ''), [courseId]);
  return `/courses/${courseId}${search}`;
}

const findRow = (container, activityId) => container.querySelector(`[data-activity-id="${activityId}"]`);
const offsetOf = (container, row) => row.getBoundingClientRect().top - container.getBoundingClientRect().top;

/** Marca la actividad de la que se vuelve: franja y fondo azul unos segundos, y se desvanece sola. */
function highlight(row) {
  const marked = { backgroundColor: 'var(--color-brand-100)', boxShadow: 'inset 4px 0 0 var(--color-brand-600)' };
  return row.animate([marked, { ...marked, offset: 0.7 }, { backgroundColor: 'transparent', boxShadow: 'inset 4px 0 0 transparent' }], {
    duration: 4000,
    easing: 'ease-out',
  });
}

/**
 * Al abrir las entregas de una actividad se recuerda dónde estaba su cuadro en la pantalla; al volver
 * al curso queda en el mismo sitio y marcada. Si se sale hacia otra página, la próxima visita empieza arriba.
 * Devuelve la ref del contenedor con scroll. `ready`: la lista ya está dibujada.
 */
export function useCourseReturn(courseId, search, ready) {
  const containerRef = useRef(null);
  const searchRef = useRef(search);
  useLayoutEffect(() => {
    searchRef.current = search;
  }, [search]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const place = ready && container ? readPlace(courseId) : null;
    let mark = null;
    if (place) {
      const row = findRow(container, place.activityId);
      // Se ubica por el cuadro y no por píxeles: la lista pudo cambiar mientras tanto
      if (row) {
        container.scrollTop += offsetOf(container, row) - place.offset;
        mark = highlight(row);
      } else container.scrollTop = place.scrollTop;
    }

    return () => {
      mark?.cancel();
      const path = window.location.pathname;
      // Sigue en la misma página (nueva carga de datos): no se toca lo recordado
      if (!ready || !container || path === `/courses/${courseId}`) return;
      const activityId = path.match(/^\/activities\/(\d+)\/review\/?$/)?.[1];
      const row = activityId && findRow(container, activityId);
      writePlace(courseId, row ? { activityId, offset: offsetOf(container, row), scrollTop: container.scrollTop, search: searchRef.current } : null);
    };
  }, [courseId, ready]);

  return containerRef;
}
