import type { Metadata } from 'next';
import { Wrench } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sistema em manutenção — Corgly',
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
        <Wrench className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>

      <h1 className="text-2xl font-bold text-foreground mb-3">
        Sistema em manutenção
      </h1>

      <p className="text-muted-foreground max-w-sm">
        Voltamos em breve. Obrigado pela paciência!
      </p>
    </div>
  );
}
