import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="text-center max-w-sm">
        <p className="text-8xl font-bold text-primary mb-4">404</p>
        <h1 className="text-2xl font-bold text-foreground mb-2">Página não encontrada</h1>
        <p className="text-muted-foreground mb-8">
          A página que você está procurando não existe ou foi movida.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={ROUTES.HOME} className={cn(buttonVariants())}>Voltar ao início</Link>
          <Link href={ROUTES.DASHBOARD} className={cn(buttonVariants({ variant: 'outline' }))}>Ir para o Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
