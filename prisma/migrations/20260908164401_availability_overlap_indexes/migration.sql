-- Indices de suporte a consulta de sobreposicao (item 017).
--
-- O predicado de sobreposicao canonico e meio-aberto nos dois lados:
-- `startAt < fim AND endAt > inicio`. Sem indice que cubra as duas colunas do
-- intervalo, toda consulta de ocupacao que intersecta uma janela cai em scan
-- cheio da tabela e o item 017 passa a emitir essa consulta na geracao de
-- slots, no caminho quente do POST /api/v1/availability.
--
-- `IDX_availability_blocked_overlap` (isBlocked, startAt, endAt): slots
-- bloqueados ou com sessao viva que intersectam a janela de geracao. A
-- igualdade na primeira coluna isola os bloqueados; startAt e endAt atendem
-- o predicado de sobreposicao.
--
-- `IDX_external_busy_overlap` (startAt, endAt): ocupacoes vigentes do ledger
-- que intersectam a janela, cobertura total da consulta do repositorio. O
-- indice antigo (revokedAt, startAt) segue util ao resumo por vigencia e nao
-- e tocado.

-- CreateIndex
CREATE INDEX `IDX_availability_blocked_overlap` ON `availability_slots`(`isBlocked`, `startAt`, `endAt`);

-- CreateIndex
CREATE INDEX `IDX_external_busy_overlap` ON `external_busy_intervals`(`startAt`, `endAt`);
