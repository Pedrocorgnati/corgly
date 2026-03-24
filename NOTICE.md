# NOTICE — Atribuicoes de Software de Terceiros

**Projeto:** Corgly
**Gerado em:** 2026-03-22

Este projeto utiliza os seguintes componentes de software de terceiros:

---

## Licencas Permissivas (MIT, Apache, BSD, ISC, BlueOak, 0BSD)

O projeto utiliza **568 pacotes** com licencas permissivas. As principais:

| Pacote | Versao | Licenca | Uso |
|--------|--------|---------|-----|
| next | 16.2.1 | MIT | Framework web (producao) |
| react | 19.2.4 | MIT | UI library (producao) |
| react-dom | 19.2.4 | MIT | React DOM renderer (producao) |
| @prisma/client | ^5.22.0 | Apache-2.0 | ORM / database client (producao) |
| prisma | ^5.22.0 | Apache-2.0 | ORM CLI / migration engine (producao) |
| stripe | ^20.4.1 | MIT | Payment processing SDK (producao) |
| jsonwebtoken | ^9.0.3 | MIT | JWT authentication (producao) |
| bcryptjs | ^3.0.3 | BSD-3-Clause | Password hashing (producao) |
| resend | ^4.6.0 | MIT | Email service SDK (producao) |
| zod | ^4.3.6 | MIT | Schema validation (producao) |
| next-intl | ^4.8.3 | MIT | Internationalization (producao) |
| react-hook-form | ^7.71.2 | MIT | Form management (producao) |
| @hookform/resolvers | ^5.2.2 | MIT | Form validation resolvers (producao) |
| framer-motion | ^12.38.0 | MIT | Animation library (producao) |
| recharts | ^3.8.0 | MIT | Chart library (producao) |
| yjs | ^13.6.27 | MIT | CRDT collaboration (producao) |
| y-indexeddb | ^9.0.12 | MIT | Yjs IndexedDB adapter (producao) |
| @hocuspocus/provider | ^3.4.4 | MIT | Yjs WebSocket provider (producao) |
| @hocuspocus/server | ^2.13.5 | MIT | Yjs WebSocket server (producao) |
| @tiptap/react | ^3.20.4 | MIT | Rich text editor (producao) |
| tailwindcss | ^4 | MIT | CSS framework (dev) |
| typescript | ^5 | Apache-2.0 | Type system (dev) |
| vitest | ^3.2.4 | MIT | Test runner (dev) |
| @playwright/test | ^1.44.0 | Apache-2.0 | E2E testing (dev) |
| eslint | ^9 | MIT | Linter (dev) |
| lru-cache | ^11.0.2 | BlueOak-1.0.0 | In-memory cache (producao) |
| tslib | 2.8.1 | 0BSD | TypeScript helpers (producao) |
| caniuse-lite | 1.0.30001780 | CC-BY-4.0 | Browser compatibility data |
| argparse | 2.0.1 | Python-2.0 | Argument parsing (transitiva) |

Para a lista completa de 568 pacotes, execute:
```bash
cd output/workspace/corgly && npx license-checker --production --csv
```

---

## Licencas LGPL/MPL (Copyleft Fraco)

| Pacote | Versao | Licenca | Observacao |
|--------|--------|---------|------------|
| @img/sharp-libvips-linux-x64 | 1.2.4 | LGPL-3.0-or-later | Binario nativo de libvips, vinculacao dinamica via `sharp`. Modificacoes a biblioteca devem ser abertas. |
| @img/sharp-libvips-linuxmusl-x64 | 1.2.4 | LGPL-3.0-or-later | Variante musl do binario libvips. Mesmo enquadramento LGPL. |

**Nota:** Estes pacotes sao binarios pre-compilados usados via linkagem dinamica. O codigo do Corgly nao modifica nem redistribui estes binarios diretamente — sao dependencias de runtime do pacote `sharp` para processamento de imagens.

---

*Gerado automaticamente por /dependency-audit. Revisar antes de distribuicao publica.*
