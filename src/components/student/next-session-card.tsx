'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

interface Session {
  date: string;
  time: string;
  sessionId: string;
}

interface NextSessionCardProps {
  session: Session | null;
}

function Countdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Sessão ao vivo!');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const isLive = timeLeft === 'Sessão ao vivo!';

  return (
    <p className={isLive ? 'text-[#059669] font-semibold animate-pulse text-center' : 'text-2xl font-mono text-primary text-center'}>
      {timeLeft}
    </p>
  );
}

export function NextSessionCard({ session }: NextSessionCardProps) {
  if (!session) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col">
        <p className="text-sm font-medium text-muted-foreground mb-3">Próxima Aula</p>
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-muted-foreground">
          <Calendar className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm text-center">Nenhuma aula agendada</p>
        </div>
        <Link href={ROUTES.SCHEDULE} className={cn(buttonVariants(), 'w-full mt-3')}>+ Agendar nova aula</Link>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground mb-3">Próxima Aula</p>
      <p className="text-lg font-semibold text-foreground">{session.date}</p>
      <p className="text-sm text-muted-foreground mb-3">{session.time}</p>
      <Countdown targetDate={`${session.date}T${session.time}`} />
      <p className="text-xs text-muted-foreground text-center mb-4">até a aula</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1">
          Cancelar
        </Button>
        <Link href={ROUTES.SESSION(session.sessionId)} className={cn(buttonVariants({ size: 'sm' }), 'flex-1')}>Entrar →</Link>
      </div>
    </div>
  );
}
