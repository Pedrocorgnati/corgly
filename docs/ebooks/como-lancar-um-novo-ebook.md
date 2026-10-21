# Como lancar um novo ebook

O mecanismo de ebooks e unico: catalogo, pagina de venda, checkout, entrega e
recuperacao leem tudo de uma entrada de catalogo validada por schema. Lancar um
ebook novo e acrescentar dados (entrada, PDF, imagens e copy), nunca codigo de
pagina. Este guia basta para lancar sem ler o codigo.

## 1. Entrada de catalogo

Layout da pasta (detalhado em `content/ebooks/README.md`):

```
content/ebooks/
  index.ts          registro: um import + uma linha por ebook em `ebookRegistry`
  {slug}/
    ebook.ts        entrada do catalogo (EbookCatalogInput)
    copy.ts         textos da pagina de venda, e-mails e erros
    sales/          imagens publicas da venda (capa, galeria)
```

1. Crie `content/ebooks/{slug}/ebook.ts` exportando um `EbookCatalogInput`
   (tipo de `src/lib/ebooks/schema.ts`).
2. Importe essa entrada em `content/ebooks/index.ts` e acrescente-a ao array
   `ebookRegistry`. O registro e validado pelo schema: entrada invalida derruba
   o build em vez de publicar uma pagina quebrada.
3. Nao edite paginas, componentes nem `src/lib/ebooks/` para um ebook
   especifico. Se algo faltar no mecanismo, o ajuste e do mecanismo.

### Campos do schema

| Campo | Regra |
|---|---|
| `slug` | kebab-case minusculo, ate 64 caracteres, unico. Nao pode estar em `EBOOK_RESERVED_SLUGS` (hoje apenas `acesso`, a rota do link de acesso). Vira a URL `/ebooks/{slug}`. |
| `title` | Titulo interno da entrada. |
| `audience` | Publico do ebook, texto livre. |
| `locale` | `en`, `es` ou `it`. Define o idioma da pagina de venda, do botao, do consentimento e da pagina de sucesso. |
| `unitAmount` | Preco em centavos, inteiro positivo (1990 = US$ 19.90). Tem que bater com o Price do Stripe. |
| `currency` | Hoje so `usd`. Outra moeda e mudanca de mecanismo. |
| `stripePriceEnv` | `{ test, live }` com NOMES de variavel de ambiente (ver secao 5), nunca o price id. |
| `pdfFile` | Nome simples do PDF final, por exemplo `meu-ebook.pdf` (ver secao 2). |
| `images.cover` | Capa da venda: `{ src, width, height, alt }` (ver secao 3). |
| `images.gallery` | Opcional: lista de imagens no mesmo formato da capa. |
| `copy` | Todos os textos voltados ao comprador (ver secao 4). |

## 2. PDF no diretorio privado

- O PDF final NUNCA entra no repositorio nem em `public/`. Ele fica no
  diretorio absoluto definido por `EBOOKS_PRIVATE_DIR`, que o mecanismo resolve
  por `resolveEbooksPrivateDir` (em `src/lib/ebooks/private-dir.ts`).
- `EBOOKS_PRIVATE_DIR` e obrigatoria e precisa ser caminho absoluto. Ausente ou
  relativa, a entrega falha com erro de configuracao explicito, sem fallback.
- `pdfFile` guarda so o nome do arquivo (letras, numeros, `.`, `_`, `-`,
  terminando em `.pdf`), relativo a esse diretorio. Sem barras: subpasta e path
  traversal sao rejeitados pelo schema.
- Copie o PDF para `$EBOOKS_PRIVATE_DIR/{pdfFile}` em cada ambiente (dev,
  staging, producao) antes de abrir as vendas. Sem o arquivo, o acesso responde
  com `copy.errors.pdfUnavailable`.

## 3. Imagens publicas da venda

- Coloque capa e galeria em `content/ebooks/{slug}/sales/`. A pasta `content/`
  nunca e servida diretamente, por isso as imagens entram por import estatico:

  ```ts
  import cover from './sales/cover.webp';

  images: {
    cover: { src: cover.src, width: cover.width, height: cover.height, alt: '...' },
  },
  ```

- `src`, `width` e `height` vem do proprio import (`StaticImageData`); nao
  digite esses valores a mao.
- `alt` e obrigatorio e descreve a imagem no idioma do ebook. A pagina renderiza
  a capa com `next/image` e usa a mesma capa no openGraph.

## 4. Copy campo a campo

Tudo vive em `copy` (convencao: arquivo `content/ebooks/{slug}/copy.ts`), no
idioma do `locale`. Rotulos genericos de UI (botao, consentimento, estados da
pagina de sucesso) NAO sao copy do ebook: vem do namespace `ebooks` de
`i18n/messages/` e ja existem para `en`, `es` e `it`.

| Campo | Onde aparece |
|---|---|
| `title`, `promise` | Hero da venda e card da vitrine `/ebooks`. |
| `summary[]` | Sumario da venda (minimo 1 item). |
| `faq[]` | FAQ da venda, cada item `{ question, answer }` (minimo 1). |
| `guarantee` | OPCIONAL. Bloco de garantia. Sem o campo, o bloco nao renderiza. So preencha quando a garantia for decisao confirmada. |
| `aiNotice` | OPCIONAL. Aviso de conteudo gerado com IA. Sem o campo, o bloco nao renderiza. |
| `seo.title`, `seo.description` | `generateMetadata` da venda (title, description, canonical e openGraph). |
| `emails.*` | E-mails de entrega, recuperacao, falha de pagamento assincrono e estorno total/parcial, mais os rotulos dos links de acesso, desistencia e nova tentativa e o aviso de renuncia. |
| `withdrawal.*` | Pagina `/ebooks/acesso/{token}/desistir` (detalhe em `content/ebooks/README.md`). |
| `errors.checkoutUnavailable`, `errors.checkoutFailed` | Erros do botao de compra (checkout indisponivel ou falha do gateway). |
| `errors.accessInvalid`, `accessRevoked`, `pdfUnavailable`, `accessRateLimited` | Erros da rota de acesso ao PDF. |

Os textos de erro sao a propria instrucao de suporte ou reenvio: o mecanismo
nao tem URL de suporte fixa.

### Renuncia ao prazo de desistencia

O botao de compra so habilita apos o aceite da renuncia, e o checkout envia
`withdrawalWaiver: true`. A versao do texto vive em
`EBOOK_WITHDRAWAL_WAIVER_VERSION` (hoje `2026-10-19.1`). Sempre que o texto do
consentimento mudar, atualize essa versao na mesma alteracao: a versao e a prova
de qual texto o comprador aceitou.

## 5. Product e Price no Stripe (test e live)

1. Defina dois nomes de env DISTINTOS em `stripePriceEnv`, por exemplo
   `STRIPE_PRICE_EBOOK_{SLUG}_TEST` e `STRIPE_PRICE_EBOOK_{SLUG}_LIVE`. O nome
   nao pode repetir o de outra entrada do catalogo.
2. Modo test: no Dashboard do Stripe em modo de teste, crie o Product do ebook e
   um Price `one_time`, ativo, com `unit_amount` igual a `unitAmount`, moeda
   igual a `currency` e `tax_behavior: inclusive` (o preco exibido e o preco
   final). Grave o price id na env `test` do ambiente de dev/staging.
3. Modo live: repita no modo live e grave o price id na env `live` do hosting de
   producao.
4. Os price ids ficam no secret manager do hosting ou no `.env` local, nunca em
   arquivo versionado. O modo usado em cada ambiente segue a chave secreta do
   Stripe configurada nele (chave live usa a env `live`; qualquer outra, a env
   `test`).
5. O checkout confere o Price antes de cobrar: ativo, `one_time`, valor, moeda e
   modo (test ou live). Qualquer divergencia bloqueia a compra e o botao mostra
   `copy.errors.checkoutUnavailable`, em vez de cobrar o valor errado.

## 6. Checagem local antes de publicar

1. Rodar type-check, lint e a suite de testes do repositorio.
2. Com o dev server, abrir `/ebooks` e conferir o card do ebook novo.
3. Abrir `/ebooks/{slug}`: idioma, capa com alt, preco final, FAQ, garantia e
   aviso de IA (se houver), botao desabilitado ate o aceite da renuncia.
4. Fazer uma compra em modo test com cartao de teste do Stripe e conferir a
   pagina `/ebooks/{slug}/sucesso`: pendente ate o pagamento confirmar, depois
   "entrega registrada", e o e-mail com o link de acesso.
5. Abrir o link de acesso do e-mail e baixar o PDF.
6. Confirmar que as duas variaveis de `stripePriceEnv` existem no ambiente alvo.

## 7. Entrega e recuperacao

Quando um pedido pago nao chega a entregue, reentregue pelo fulfillment
idempotente, nunca por envio direto de e-mail. O procedimento completo esta em
[Recuperacao de entrega e evidencia](../../content/ebooks/README.md#recuperacao-de-entrega-e-evidencia).
Resumo:

- O Stripe reenvia sozinho o evento nao confirmado por ate 3 dias em modo live.
- Reenvio manual do evento: ate 15 dias pelo Dashboard e ate 30 dias pela CLI
  (`stripe events resend <evt_id>`).
- Fora desses prazos, ou para varredura em lote:
  `npm run ebooks:delivery:reconcile` e `npm run ebooks:delivery:recover`.
- O artefato de `ebooks:evidence` contem dados pessoais (PII). Nunca versione,
  nunca cole em chat ou ticket publico.

## 8. Roteiro dos proximos lancamentos (itens 014, 018 e 022)

Cada um desses itens do loop de ebooks lanca um ebook real e so faz:

1. Pasta `content/ebooks/{slug}/` com `ebook.ts`, `copy.ts` e `sales/`
   (secoes 1, 3 e 4).
2. Uma linha no `ebookRegistry` de `content/ebooks/index.ts`.
3. PDF copiado para `$EBOOKS_PRIVATE_DIR/{pdfFile}` (secao 2).
4. Product/Price test e envs de `stripePriceEnv` (secao 5); o live fica com o
   item 023.
5. Checagem local da secao 6.

Nenhum desses itens cria codigo novo: as secoes de `src/components/ebooks/` ja
consomem a entrada de catalogo.
