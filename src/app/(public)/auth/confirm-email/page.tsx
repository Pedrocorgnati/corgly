import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Mail } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Confirme seu Email',
};

export default function ConfirmEmailPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-[#059669]/10 flex items-center justify-center">
              <Mail className="h-8 w-8 text-[#059669]" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Verifique seu email</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Enviamos um link de confirmação para o seu email.
            Clique no link para ativar sua conta.
          </p>
          <div className="bg-muted/50 rounded-xl p-4 mb-6 text-sm text-muted-foreground">
            <p>Não encontrou o email? Verifique sua pasta de spam ou solicite o reenvio abaixo.</p>
          </div>
          <Link href="#" className={cn(buttonVariants({ variant: 'outline' }), 'w-full mb-3')}>Reenviar email de confirmação</Link>
          <Link
            href={ROUTES.LOGIN}
            className="text-sm text-primary font-medium hover:underline"
          >
            ← Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
