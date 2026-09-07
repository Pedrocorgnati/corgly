'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, ShieldBan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminCalendar } from '@/components/admin/AdminCalendar';
import { AvailabilityEditor } from '@/components/admin/AvailabilityEditor';
import { BulkBlockModal } from '@/components/admin/BulkBlockModal';
import { useAdminSchedule } from '@/hooks/useAdminSchedule';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

export function AdminScheduleClient() {
  const [showEditor, setShowEditor] = useState(false);
  const [showBulkBlock, setShowBulkBlock] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<{
    slot: AvailabilitySlot;
    session?: { id: string; status: string; studentName?: string };
  } | null>(null);

  // Fonte unica da tela: enxerga slot livre, bloqueado e vendido.
  const schedule = useAdminSchedule();

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    schedule.refresh();
  }, [schedule]);

  const handleSlotClick = useCallback(
    (slot: AvailabilitySlot, session?: { id: string; status: string; studentName?: string }) => {
      setSelectedSlot({ slot, session });
    },
    [],
  );

  return (
    <>
      <div data-testid="admin-schedule-header" className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie seus horários disponíveis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="admin-schedule-bulk-block-button" variant="outline" onClick={() => setShowBulkBlock(true)} className="gap-2">
            <ShieldBan className="h-4 w-4" />
            Bloquear período
          </Button>
          <Button data-testid="admin-schedule-create-button" onClick={() => setShowEditor(!showEditor)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo horário
          </Button>
        </div>
      </div>

      <div data-testid="admin-schedule-content" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AdminCalendar
            key={refreshKey}
            calendar={schedule}
            sessions={schedule.sessions}
            onSlotClick={handleSlotClick}
          />
        </div>

        <div className="space-y-6">
          {selectedSlot && (
            <div
              data-testid="admin-schedule-slot-detail"
              className="bg-card border border-border rounded-2xl p-6 shadow-sm"
            >
              <h2 className="font-semibold text-foreground mb-2">Horário selecionado</h2>
              <p data-testid="admin-schedule-slot-detail-time" className="text-sm text-foreground">
                {new Date(selectedSlot.slot.startAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' - '}
                {new Date(selectedSlot.slot.endAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <p data-testid="admin-schedule-slot-detail-state" className="text-sm text-muted-foreground mt-1">
                {selectedSlot.slot.isBlocked
                  ? 'Bloqueado'
                  : selectedSlot.session
                    ? 'Vendido'
                    : 'Livre'}
              </p>
              {selectedSlot.session?.studentName && (
                <p data-testid="admin-schedule-slot-detail-student" className="text-sm text-foreground mt-1">
                  {selectedSlot.session.studentName}
                </p>
              )}
            </div>
          )}

          {showEditor && (
            <AvailabilityEditor
              existingSlots={schedule.slots}
              onSlotsGenerated={() => {
                handleRefresh();
                setShowEditor(false);
              }}
            />
          )}

          {!showEditor && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold text-foreground mb-4">Próximas aulas</h2>
              <p className="text-sm text-muted-foreground">
                Selecione um dia no calendário para ver os detalhes.
              </p>
            </div>
          )}
        </div>
      </div>

      <BulkBlockModal
        open={showBulkBlock}
        onOpenChange={setShowBulkBlock}
        onComplete={handleRefresh}
      />
    </>
  );
}
