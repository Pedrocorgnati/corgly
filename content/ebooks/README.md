# content/ebooks

Conteudo dos ebooks vendidos na aba Ebooks. O mecanismo (`src/lib/ebooks/`) nao
conhece nenhum ebook pelo nome: tudo o que e especifico de um ebook mora aqui.

## Layout

```
content/ebooks/
  index.ts              registro: um import + uma linha por ebook em `ebookRegistry`
  {slug}/
    ebook.ts            entrada do catalogo (EbookCatalogInput)
    copy.ts             textos da pagina de venda, e-mails e erros
    sales/              imagens da vitrine (capa, galeria), importadas estaticamente
    manuscript/         texto-fonte do livro
    layout/             arquivos de diagramacao
    illustrations/      ilustracoes do miolo
    _originals/         originais recebidos, sem tratamento
```

## Regras

- Lancar ebook = nova pasta + uma linha no `index.ts`. Nenhuma mudanca em
  `src/lib/ebooks/`.
- `sales/` entra por import estatico: `content/` nunca e servido diretamente.
  Fora do bundler do Next (CLIs `npm run ebooks:*` via tsx), esse import so
  funciona com o loader `scripts/ebooks-image-stub.mjs`, ja registrado nos
  scripts do `package.json`; script novo que importe o catalogo deve usar
  `tsx --import ./scripts/ebooks-image-stub.mjs`. O loader usa o handler de
  extensao do CommonJS (o pacote nao e `"type": "module"`), entao roda no
  node:20 do Dockerfile e em versoes mais novas, sem module hooks.
- O PDF final fica fora do repo, no diretorio absoluto `EBOOKS_PRIVATE_DIR`;
  `ebook.ts` guarda so o nome simples do arquivo em `pdfFile`.
- `stripePriceEnv` guarda NOMES de variavel de ambiente, nunca o price ID.

## Chaves de copy usadas pelo acesso e pela desistencia

- `copy.errors.accessInvalid`: 404, token malformado ou inexistente.
- `copy.errors.accessRevoked`: 410, acesso revogado (estorno, disputa, limite de
  downloads).
- `copy.errors.pdfUnavailable`: 503, PDF indisponivel no momento.
- `copy.errors.accessRateLimited`: 429, limite de tentativas atingido
  (obrigatoria).
- `copy.withdrawal` (bloco obrigatorio, pagina `/ebooks/acesso/{token}/desistir`):
  - `title`, `body`, `confirmLabel`: pagina inicial da desistencia.
  - `acceptedBody`: estorno solicitado com sucesso.
  - `reviewBody`: pedido em analise manual (ex.: download ja iniciado).
  - `expiredBody`: fora dos 14 dias de prazo.
  - `errorBody`: falha ao solicitar o estorno.

Os textos de erro sao a propria instrucao de suporte ou reenvio: o mecanismo nao
tem URL de suporte fixa.

## Recuperacao de entrega e evidencia

Quando um pedido pago nao chega ao estado entregue, o caminho e sempre o mesmo:
reentregar pelo fulfillment idempotente do mecanismo, nunca por envio direto de
email. Os tres tempos do procedimento: reenvio automatico do Stripe, reenvio
manual do evento e reconciliacao/recuperacao em lote.

### Reenvio automatico do Stripe

- Em modo live, o Stripe reenvia o evento de webhook nao confirmado
  automaticamente por ate 3 dias, com backoff exponencial entre tentativas.
- Em modo teste, o reenvio automatico dura poucas horas: nao confie nele para
  validar recuperacao depois de um fim de semana.
- O fulfillment e idempotente por `checkoutSessionId` (claim com lease de 5
  minutos), entao a reentrega do mesmo evento nunca duplica o envio.

### Reenvio manual de evento

Use quando o webhook falhou e o evento ainda esta dentro do prazo:

- Ate 15 dias pelo Dashboard do Stripe: Workbench > Events / Webhooks, abrir o
  evento e usar o botao de reenvio do evento.
- Ate 30 dias pela CLI: `stripe events resend <evt_id>`. Para reenviar somente
  para um endpoint, acrescente `--webhook-endpoint <we_id>`.
- Depois desses prazos o evento nao e mais reenviavel: parta para reconcile e
  recover.

### Reconcile e recover

Para recuperacao fora do prazo de reenvio ou para varredura em lote, use os
comandos npm:

- `npm run ebooks:delivery:reconcile -- --from AAAA-MM-DD --to AAAA-MM-DD --timezone <IANA> [--out <path>]`
  - Sempre dry-run: `--execute` e recusado com exit 1.
  - Janela `[from, to)` de no maximo 90 dias e timezone IANA valida.
  - Lista as sessions pagas com marcador de ebook e classifica cada uma em
    `affected` / `reconcile_status` / `manual_review` / `excluded`.
  - Grava um manifesto JSON imutavel, sem PII, fora de qualquer repositorio git
    (por default no diretorio temporario do sistema; `--out` dentro de um repo
    e recusado) e imprime so o caminho, o sha256 e as contagens por classe.
- `npm run ebooks:delivery:recover -- --manifest <path> --sha256 <hash> --approve-count <n> --allowlist <id1,id2,...> --circuit-breaker-revision g6-v1 [--execute]`
  - Sem `--execute` so imprime o plano (ids e acao por id) e sai 0.
  - Exige hash identico ao do reconcile, manifesto canonico, aprovacao de 1 a 25
    ids listados na allowlist (todos `affected` ou `reconcile_status` no
    manifesto) e a revisao do breaker igual a do manifesto.
  - Executa em lotes de 5 e rele cada pedido imediatamente antes de agir:
    pedido ja entregue ou com envio em andamento e pulado.
  - Para com exit 1 se mais de 10% dos itens processados falharem; retomar e
    rodar de novo com um manifesto novo.
  - Repetir o recover sobre ids ja entregues nao reenvia.
- `manual_review` fica fora do recover: tratar caso a caso.

### Evidencia para contestacao

- `npm run ebooks:evidence -- --order <orderId> [--out <path>]` gera um
  documento JSON unico (ate 4.5 MB) com dados da compra, eventos de entrega,
  acessos com data, hora e IP e contadores de download. O hash do token nunca e
  incluido.
- ATENCAO: o arquivo CONTEM o email do comprador e o IP (dados pessoais).
  - Nao versionar, nao anexar em issue ou chat.
  - Gravar fora do repositorio (o comando recusa `--out` dentro de um repo git).
  - Apagar o arquivo apos o uso.
