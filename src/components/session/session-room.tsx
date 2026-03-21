'use client';

import { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, Settings, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

interface SessionRoomProps {
  sessionId: string;
}

export function SessionRoom({ sessionId }: SessionRoomProps) {
  const router = useRouter();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  const handleEndCall = async () => {
    try {
      // TODO: Implementar backend — POST /api/v1/sessions/{id}/end
      toast.info('Sessão encerrada');
      router.push(ROUTES.DASHBOARD);
    } catch {
      toast.error('Erro ao encerrar sessão.');
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Session header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#059669] animate-pulse" />
          <span className="text-sm font-medium text-foreground">Sessão ao vivo</span>
        </div>
        <div className="text-sm text-muted-foreground font-mono">
          ID: {sessionId.slice(0, 8)}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Chat"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Participantes"
          >
            <Users className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {/* Video panels */}
          <div className="flex-1 bg-[#111827] flex flex-col md:flex-row gap-2 p-2">
            {/* Remote video (professor) */}
            <div className="flex-1 relative bg-[#1F2937] rounded-xl overflow-hidden min-h-[200px]">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-[#6B7280]">
                  <Video className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  {/* @ASSET_PLACEHOLDER
                  name: professor-avatar
                  type: image
                  extension: svg
                  format: 1:1
                  dimensions: 120x120
                  description: Avatar do professor nativo em forma circular, expressão amigável e profissional. Fundo transparente para uso em sala de aula virtual.
                  context: Sala de aula virtual quando câmera não disponível
                  style: Ilustração vetorial, traços limpos, estilo moderno
                  colors: primary (#4F46E5), warm neutral
                  avoid: Fotos realistas, alta complexidade
                  */}
                  <p className="text-sm">Aguardando conexão...</p>
                  <p className="text-xs mt-1 opacity-60">O professor entrará em breve</p>
                </div>
              </div>
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/50 rounded-lg px-2 py-1">
                <span className="text-white text-xs font-medium">Professor</span>
              </div>
            </div>

            {/* Local video (student) */}
            <div className="w-full md:w-48 h-36 md:h-auto relative bg-[#374151] rounded-xl overflow-hidden">
              {!camOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#374151]">
                  <VideoOff className="h-8 w-8 text-[#6B7280]" />
                </div>
              )}
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 rounded px-1.5 py-0.5">
                <span className="text-white text-xs">Você</span>
                {!micOn && <MicOff className="h-3 w-3 text-red-400" />}
              </div>
            </div>
          </div>

          {/* Control bar */}
          <div className="bg-card border-t border-border px-4 py-4 flex items-center justify-center gap-4">
            <button
              onClick={() => setMicOn(!micOn)}
              className={cn(
                'h-12 w-12 rounded-full flex items-center justify-center transition-colors',
                micOn ? 'bg-muted hover:bg-muted/80' : 'bg-destructive hover:bg-destructive/90',
              )}
              aria-label={micOn ? 'Silenciar microfone' : 'Ativar microfone'}
            >
              {micOn ? <Mic className="h-5 w-5 text-foreground" /> : <MicOff className="h-5 w-5 text-white" />}
            </button>
            <button
              onClick={() => setCamOn(!camOn)}
              className={cn(
                'h-12 w-12 rounded-full flex items-center justify-center transition-colors',
                camOn ? 'bg-muted hover:bg-muted/80' : 'bg-destructive hover:bg-destructive/90',
              )}
              aria-label={camOn ? 'Desligar câmera' : 'Ligar câmera'}
            >
              {camOn ? <Video className="h-5 w-5 text-foreground" /> : <VideoOff className="h-5 w-5 text-white" />}
            </button>
            <button
              onClick={handleEndCall}
              className="h-12 w-12 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center transition-colors"
              aria-label="Encerrar chamada"
            >
              <PhoneOff className="h-5 w-5 text-white" />
            </button>
            <button
              className="h-12 w-12 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
              aria-label="Configurações"
            >
              <Settings className="h-5 w-5 text-foreground" />
            </button>
          </div>
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div className="w-72 border-l border-border bg-card flex flex-col">
            <div className="p-3 border-b border-border">
              <h3 className="font-medium text-sm text-foreground">Chat da sessão</h3>
            </div>
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-muted-foreground text-center">
                O chat será implementado em breve
              </p>
            </div>
            <div className="p-3 border-t border-border">
              <input
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Digite uma mensagem..."
                disabled
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
