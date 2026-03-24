'use client';
import { API } from '@/lib/constants/routes';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GenerateSlotsSchema, type GenerateSlotsInput } from '@/schemas/availability.schema';
import { toast } from 'sonner';
import { apiClient, ApiError } from '@/lib/api-client';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface ExistingSlot {
  id: string;
  startAt: string;
  endAt: string;
  isBlocked: boolean;
}

interface AvailabilityEditorProps {
  existingSlots?: ExistingSlot[];
  onSlotsGenerated?: () => void;
}

export function AvailabilityEditor({
  existingSlots = [],
  onSlotsGenerated,
}: AvailabilityEditorProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [skippedAlert, setSkippedAlert] = useState<{ created: number; skipped: number } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<GenerateSlotsInput>({
    resolver: zodResolver(GenerateSlotsSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      days: [],
      ranges: [{ start: '09:00', end: '17:00' }],
      weeksAhead: 4,
      timezone: 'America/Sao_Paulo',
    },
  });

  const selectedDays = watch('days');
  const ranges = watch('ranges');

  const toggleDay = (day: number) => {
    const current = selectedDays ?? [];
    const updated = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    setValue('days', updated, { shouldValidate: true });
  };

  const addRange = () => {
    setValue('ranges', [...(ranges ?? []), { start: '09:00', end: '17:00' }], {
      shouldValidate: true,
    });
  };

  const removeRange = (index: number) => {
    const updated = (ranges ?? []).filter((_, i) => i !== index);
    setValue('ranges', updated, { shouldValidate: true });
  };

  const onSubmit = async (data: GenerateSlotsInput) => {
    setIsSubmitting(true);
    try {
      const json = await apiClient.post<{ data: { created: number; skipped: number } }>(API.AVAILABILITY, data);
      const created = json.data?.created ?? 0;
      const skipped = json.data?.skipped ?? 0;
      if (skipped > 0) {
        // Inline alert para slots ignorados (FE-007f)
        setSkippedAlert({ created, skipped });
      } else {
        setSkippedAlert(null);
        toast.success(`${created} horário(s) criado(s).`);
      }
      onSlotsGenerated?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao gerar horários. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBlockToggle = async (slot: ExistingSlot) => {
    setActionLoading(slot.id);
    const action = slot.isBlocked ? 'unblock' : 'block';
    try {
      await apiClient.patch(API.AVAILABILITY_BLOCK(slot.id).replace('block', action), {});
      toast.success(action === 'block' ? 'Slot bloqueado.' : 'Slot desbloqueado.');
      onSlotsGenerated?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro na operação. Tente novamente.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (slotId: string) => {
    setActionLoading(slotId);
    try {
      await apiClient.delete(API.AVAILABILITY_SLOT(slotId));
      toast.success('Slot removido.');
      onSlotsGenerated?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao remover. Tente novamente.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Generate form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Gerar horários</h3>

        {/* Days of week */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">
            Dias da semana
          </label>
          <div className="flex gap-2 flex-wrap">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                aria-pressed={selectedDays?.includes(i) ?? false}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  selectedDays?.includes(i)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {errors.days && (
            <p className="text-xs text-destructive mt-1">{errors.days.message}</p>
          )}
        </div>

        {/* Time ranges */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">
            Faixas de horário
          </label>
          <div className="space-y-2">
            {(ranges ?? []).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  aria-label={`Hora início da faixa ${i + 1}`}
                  {...register(`ranges.${i}.start`)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <span className="text-muted-foreground text-sm">até</span>
                <input
                  type="time"
                  aria-label={`Hora fim da faixa ${i + 1}`}
                  {...register(`ranges.${i}.end`)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                {(ranges?.length ?? 0) > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRange(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover faixa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addRange}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Adicionar faixa
            </button>
          </div>
          {errors.ranges && (
            <p className="text-xs text-destructive mt-1">{errors.ranges.message}</p>
          )}
        </div>

        {/* Weeks ahead */}
        <div>
          <label htmlFor="weeksAhead" className="text-sm font-medium text-foreground block mb-1">
            Semanas à frente
          </label>
          <input
            id="weeksAhead"
            type="number"
            min={1}
            max={12}
            {...register('weeksAhead', { valueAsNumber: true })}
            className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          {errors.weeksAhead && (
            <p className="text-xs text-destructive mt-1">{errors.weeksAhead.message}</p>
          )}
        </div>

        {skippedAlert && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {skippedAlert.created} slot(s) criado(s).{' '}
              {skippedAlert.skipped} ignorado(s) (já existiam ou conflitavam).
            </span>
          </div>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Gerando...
            </>
          ) : (
            'Gerar horários'
          )}
        </Button>
      </form>

      {/* Existing slots list */}
      {existingSlots.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-4">
            Slots existentes ({existingSlots.length})
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {existingSlots.map((slot) => (
              <div
                key={slot.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {new Date(slot.startAt).toLocaleDateString('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                    })}{' '}
                    {new Date(slot.startAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' - '}
                    {new Date(slot.endAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {slot.isBlocked && (
                    <span className="text-xs text-destructive">Bloqueado</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBlockToggle(slot)}
                    disabled={actionLoading === slot.id}
                    aria-label={slot.isBlocked ? 'Desbloquear' : 'Bloquear'}
                  >
                    {slot.isBlocked ? (
                      <Unlock className="h-4 w-4" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(slot.id)}
                    disabled={actionLoading === slot.id}
                    aria-label="Remover slot"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
