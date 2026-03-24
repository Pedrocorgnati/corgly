'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, ShieldBan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminCalendar } from '@/components/admin/AdminCalendar';
import { AvailabilityEditor } from '@/components/admin/AvailabilityEditor';
import { BulkBlockModal } from '@/components/admin/BulkBlockModal';

export function AdminScheduleClient() {
  const [showEditor, setShowEditor] = useState(false);
  const [showBulkBlock, setShowBulkBlock] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie seus horários disponíveis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowBulkBlock(true)} className="gap-2">
            <ShieldBan className="h-4 w-4" />
            Bloquear período
          </Button>
          <Button onClick={() => setShowEditor(!showEditor)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo horário
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AdminCalendar key={refreshKey} />
        </div>

        <div className="space-y-6">
          {showEditor && (
            <AvailabilityEditor
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
