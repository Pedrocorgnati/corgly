'use client';

import dynamic from 'next/dynamic';

// Constante de compilacao: em build de producao vira `false` literal, o que
// permite ao bundler eliminar o branch inteiro — incluindo o `import()` do
// overlay. Sem isso o modulo continua no grafo (mesmo com o corpo removido por
// DCE) e o nome `DevDataTestOverlay` vaza para os chunks de producao.
const IS_DEV = process.env.NODE_ENV === 'development';

const LazyOverlay = IS_DEV
  ? dynamic(() => import('./DataTestOverlay').then((mod) => mod.DevDataTestOverlay), {
      ssr: false,
    })
  : null;

export function DevOverlayLoader() {
  if (!LazyOverlay) return null;
  return <LazyOverlay />;
}
