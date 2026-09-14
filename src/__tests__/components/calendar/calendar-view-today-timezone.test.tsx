/**
 * GAP-07 (item 028) - o "hoje" da grade e o dia civil do fuso do aluno.
 *
 * Ate o PRED o `CalendarView` calculava hoje e passado com `new Date()` no fuso
 * do runtime. Com o aluno num fuso diferente do navegador (ou do servidor, no
 * SSR), a grade marcava o dia errado como hoje e liberava ou bloqueava o dia
 * errado. Os instantes abaixo ficam dos dois lados de viradas de dia com DST
 * (Sydney, Auckland, Amman, Havana, Asuncion) e em fusos de offset extremo
 * (Kiritimati +14, Pago Pago -11). A tzdata usada fica registrada no RED.
 *
 * Os casos rodam sob `TZ=UTC` (comando da task); o ultimo controle, sem a
 * prop, depende disso para provar que a ausencia mantem o fuso do runtime.
 */
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import ptBR from '../../../../i18n/messages/pt-BR.json';
import { CalendarView } from '@/components/calendar/CalendarView';

const HOJE = ptBR.calendar.view.today;

interface Caso {
  fuso?: string;
  agora: string;
  hoje: string;
  desabilitado?: string;
}

const RED: Caso[] = [
  { fuso: 'Pacific/Kiritimati', agora: '2026-09-15T12:00:00.000Z', hoje: '2026-09-16', desabilitado: '2026-09-15' },
  { fuso: 'Australia/Sydney', agora: '2017-09-30T14:00:00.000Z', hoje: '2017-10-01' },
  { fuso: 'Pacific/Auckland', agora: '2018-03-31T11:00:00.000Z', hoje: '2018-04-01' },
  { fuso: 'Asia/Amman', agora: '2016-03-31T22:00:00.000Z', hoje: '2016-04-01' },
  { fuso: 'America/Havana', agora: '2020-11-01T03:59:59.999Z', hoje: '2020-10-31' },
  { fuso: 'America/Asuncion', agora: '2023-10-01T03:59:59.999Z', hoje: '2023-09-30' },
];

const CONTROLE: Caso[] = [
  { fuso: 'Pacific/Pago_Pago', agora: '2026-09-15T12:00:00.000Z', hoje: '2026-09-15' },
  { fuso: 'Australia/Sydney', agora: '2017-09-30T13:59:59.999Z', hoje: '2017-09-30' },
  { fuso: 'Australia/Sydney', agora: '2017-09-30T13:30:00.000Z', hoje: '2017-09-30' },
  { fuso: 'Pacific/Auckland', agora: '2018-03-31T10:59:59.999Z', hoje: '2018-03-31' },
  { fuso: 'Asia/Amman', agora: '2016-03-31T21:59:59.999Z', hoje: '2016-03-31' },
  { fuso: 'Asia/Amman', agora: '2016-03-31T21:30:00.000Z', hoje: '2016-03-31' },
  { fuso: 'America/Havana', agora: '2020-11-01T04:00:00.000Z', hoje: '2020-11-01' },
  { fuso: 'America/Asuncion', agora: '2023-10-01T04:00:00.000Z', hoje: '2023-10-01' },
];

/** Renderiza o mes da data esperada, com so o `Date` falsificado. */
function renderizar({ fuso, agora, hoje }: Caso) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(agora));
  const [ano, mes] = hoje.split('-').map(Number);
  // A prop `timeZone` nao existe no PRED: o objeto passa por `unknown` para o
  // arquivo compilar antes e depois do ST009.
  const props = {
    currentMonth: mes - 1,
    currentYear: ano,
    slotsByDate: {},
    selectedDate: null,
    onSelectDate: vi.fn(),
    onPrevMonth: vi.fn(),
    onNextMonth: vi.fn(),
    isLoading: false,
    ...(fuso ? { timeZone: fuso } : {}),
  } as unknown as ComponentProps<typeof CalendarView>;
  render(<CalendarView {...props} />);
}

/** Chaves dos dias cujo aria-label comeca com a copy de hoje do catalogo. */
function diasMarcadosComoHoje(): string[] {
  return screen
    .getAllByRole('gridcell')
    .filter((el) => (el.getAttribute('aria-label') ?? '').startsWith(`${HOJE}, `))
    .map((el) => (el.getAttribute('data-testid') ?? '').replace('calendar-view-day-', ''));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CalendarView - hoje civil pelo fuso (GAP-07)', () => {
  for (const caso of RED) {
    it(`RED 028 [ST009]: ${caso.fuso} em ${caso.agora} marca ${caso.hoje} como hoje`, () => {
      renderizar(caso);
      expect(diasMarcadosComoHoje()).toEqual([caso.hoje]);
      if (caso.desabilitado) {
        expect(screen.getByTestId(`calendar-view-day-${caso.desabilitado}`)).toBeDisabled();
        expect(screen.getByTestId(`calendar-view-day-${caso.hoje}`)).toBeEnabled();
      }
    });
  }

  for (const caso of CONTROLE) {
    it(`CONTROLE: ${caso.fuso} em ${caso.agora} marca ${caso.hoje} como hoje`, () => {
      renderizar(caso);
      expect(diasMarcadosComoHoje()).toEqual([caso.hoje]);
    });
  }

  it('CONTROLE: sem a prop, sob TZ=UTC, 2026-09-15T12:00Z marca 2026-09-15 como hoje', () => {
    renderizar({ agora: '2026-09-15T12:00:00.000Z', hoje: '2026-09-15' });
    expect(diasMarcadosComoHoje()).toEqual(['2026-09-15']);
  });
});
