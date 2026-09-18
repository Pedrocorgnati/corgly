# GAP-10 - Decisoes (carimbo de status)

Loop: `blacksmith/loop-archives/09-15-corgly-saas-coverage-audit-ponto-parada`
Task: `tasks/items/task-007-gap-010-carimbo-status.md`
Registrado em: 2026-09-16

## Decisao

`Q0=nao se aplica; Dmax=10; SLO=1 (130/190); Sink=1; Cadencia=1`

## Proveniencia

A decisao existia apenas no scratchpad da varredura (`SC/relatorio-final-notas.md:29`
e copia em `SC/deep/grupo-D.md:102`), sem `GAP-10-DECISOES.md` nem registro em
L06, L13 ou no PA. Este arquivo e o lugar canonico: se o scratchpad sumir, a
decisao sobrevive aqui.

## Efeito na implementacao

- `src/app/api/v1/google/calendar/status/route.ts` devolve
  `lastSuccessfulSyncAt` real, lido de `GoogleCalendarCredential.lastSyncAt`
  (gravado pelo push service em `src/services/google-calendar-push.service.ts`,
  nos dois `update` que persistem `lastSyncAt: syncStartedAt` — o do inicio da
  sincronizacao e o que grava o novo `syncToken`), em vez de `null` fixo para
  `connected` e `expired`. Referencia por simbolo, nao por linha: as linhas
  deslocam a cada edicao do servico.
- `src/app/api/v1/google/calendar/status/route.test.ts` ratifica o carimbo
  real (GAP-020 parcial apontava o `null` fixo como o bug desta cobertura).
