'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES } from '@/lib/constants/routes';
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
} from '@/lib/support/ticket.schema';

/**
 * Barra de filtros da caixa de entrada admin (T-051 / AD-39).
 *
 * Filtra por status, prioridade, aluno (busca textual por nome/e-mail) e
 * intervalo de data. Os filtros são serializados na URL (searchParams) para que
 * o Server Component refaça a query, mantendo o estado compartilhável/recarregável
 * (Zero Estados Indefinidos: a URL é a fonte da verdade do filtro).
 */

const STATUS_LABELS: Record<(typeof SUPPORT_TICKET_STATUSES)[number], string> = {
  OPEN: 'Aberto',
  PENDING: 'Aguardando',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

const PRIORITY_LABELS: Record<(typeof SUPPORT_TICKET_PRIORITIES)[number], string> = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

interface FilterValues {
  status: string;
  priority: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

interface AdminSupportFiltersProps {
  initial: FilterValues;
}

const selectClassName =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40';

export function AdminSupportFilters({ initial }: AdminSupportFiltersProps) {
  const router = useRouter();
  const [values, setValues] = useState<FilterValues>(initial);

  const set = (key: keyof FilterValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const apply = () => {
    const qs = new URLSearchParams();
    qs.set('page', '1');
    if (values.status) qs.set('status', values.status);
    if (values.priority) qs.set('priority', values.priority);
    if (values.search.trim()) qs.set('search', values.search.trim());
    if (values.dateFrom) qs.set('dateFrom', values.dateFrom);
    if (values.dateTo) qs.set('dateTo', values.dateTo);
    router.push(`${ROUTES.ADMIN_SUPPORT}?${qs.toString()}`);
  };

  const clear = () => {
    setValues({ status: '', priority: '', search: '', dateFrom: '', dateTo: '' });
    router.push(ROUTES.ADMIN_SUPPORT);
  };

  const hasActiveFilters =
    Boolean(values.status) ||
    Boolean(values.priority) ||
    Boolean(values.search) ||
    Boolean(values.dateFrom) ||
    Boolean(values.dateTo);

  return (
    <form
      data-testid="admin-support-filter-bar"
      className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="lg:col-span-2">
        <Label htmlFor="support-search" className="text-xs text-muted-foreground">
          Aluno (nome ou e-mail)
        </Label>
        <Input
          data-testid="admin-support-filter-search-input"
          id="support-search"
          value={values.search}
          onChange={(e) => set('search')(e.target.value)}
          placeholder="Buscar aluno"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="support-status" className="text-xs text-muted-foreground">
          Status
        </Label>
        <select
          data-testid="admin-support-filter-status-select"
          id="support-status"
          value={values.status}
          onChange={(e) => set('status')(e.target.value)}
          className={`mt-1 ${selectClassName}`}
        >
          <option value="">Todos</option>
          {SUPPORT_TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="support-priority" className="text-xs text-muted-foreground">
          Prioridade
        </Label>
        <select
          data-testid="admin-support-filter-priority-select"
          id="support-priority"
          value={values.priority}
          onChange={(e) => set('priority')(e.target.value)}
          className={`mt-1 ${selectClassName}`}
        >
          <option value="">Todas</option>
          {SUPPORT_TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="support-date-from" className="text-xs text-muted-foreground">
          De
        </Label>
        <Input
          data-testid="admin-support-filter-date-from-input"
          id="support-date-from"
          type="date"
          value={values.dateFrom}
          onChange={(e) => set('dateFrom')(e.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="support-date-to" className="text-xs text-muted-foreground">
          Até
        </Label>
        <Input
          data-testid="admin-support-filter-date-to-input"
          id="support-date-to"
          type="date"
          value={values.dateTo}
          onChange={(e) => set('dateTo')(e.target.value)}
          className="mt-1"
        />
      </div>

      <div data-testid="admin-support-filter-actions" className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
        <Button data-testid="admin-support-filter-apply-button" type="submit" className="gap-2">
          <Search className="h-4 w-4" />
          Filtrar
        </Button>
        {hasActiveFilters && (
          <Button data-testid="admin-support-filter-clear-button" type="button" variant="outline" className="gap-2" onClick={clear}>
            <X className="h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>
    </form>
  );
}
