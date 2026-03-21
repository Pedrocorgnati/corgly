import type { Metadata } from 'next';
import { CalendarSchedule } from '@/components/student/calendar-schedule';

export const metadata: Metadata = {
  title: 'Agendar Aula',
};

export default function SchedulePage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Agendar Aula</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Horários em {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
      </div>
      <CalendarSchedule />
    </div>
  );
}
