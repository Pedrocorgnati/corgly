'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Hit {
  id: string;
  rect: DOMRect;
}

function collectFirstDataTestIdHits(nodes: ArrayLike<Element>): Hit[] {
  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const el of Array.from(nodes)) {
    const id = el.getAttribute('data-testid');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    hits.push({ id, rect: el.getBoundingClientRect() });
  }
  return hits;
}

export function DevDataTestOverlay() {
  if (process.env.NODE_ENV !== 'development') return null;

  const [active, setActive] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [buttonPos, setButtonPos] = useState({ x: 16, y: 16 });
  const dragState = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  const refresh = useCallback(() => {
    const nodes = document.querySelectorAll('[data-testid]');
    setHits(collectFirstDataTestIdHits(nodes));
  }, []);

  useEffect(() => {
    if (!active) return;
    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    const interval = window.setInterval(refresh, 1000);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
      window.clearInterval(interval);
    };
  }, [active, refresh]);

  const handleCopy = useCallback((id: string) => {
    const text = `data-testid="${id}"`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1200);
  }, []);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      dragState.current = {
        dragging: true,
        offsetX: e.clientX - buttonPos.x,
        offsetY: e.clientY - buttonPos.y,
      };
    },
    [buttonPos]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current.dragging) return;
      setButtonPos({
        x: e.clientX - dragState.current.offsetX,
        y: e.clientY - dragState.current.offsetY,
      });
    };
    const onMouseUp = () => {
      dragState.current.dragging = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        data-test="data-test-overlay-toggle"
        onMouseDown={onDragStart}
        onClick={() => setActive((v) => !v)}
        style={{
          position: 'fixed',
          left: buttonPos.x,
          top: buttonPos.y,
          zIndex: 2147483647,
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid #ef4444',
          background: active ? '#ef4444' : '#111827',
          color: '#fff',
          fontSize: 12,
          fontFamily: 'monospace',
          cursor: 'move',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}
      >
        [data-test] {active ? 'ON' : 'OFF'}
      </button>

      {active &&
        hits.map((hit) => (
          <span
            key={hit.id}
            onClick={() => handleCopy(hit.id)}
            title="Clique para copiar o data-testid"
            style={{
              position: 'fixed',
              left: hit.rect.left,
              top: Math.max(0, hit.rect.top - 13),
              background: copiedId === hit.id ? '#16a34a' : '#ef4444',
              color: '#fff',
              fontSize: 10,
              lineHeight: '13px',
              fontFamily: 'monospace',
              padding: '0 4px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              zIndex: 2147483646,
              pointerEvents: 'auto',
            }}
          >
            {copiedId === hit.id ? 'copiado!' : hit.id}
          </span>
        ))}

    </>
  );
}
