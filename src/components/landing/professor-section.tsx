'use client';

import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { AvatarInitials } from '@/components/ui/avatar-initials';

const CREDENTIAL_KEYS = ['international', 'method', 'live', 'feedback'] as const;

export function ProfessorSection() {
  const t = useTranslations('landing');

  return (
    <section className="py-20 bg-background" aria-labelledby="professor-heading">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Image */}
          <div className="flex justify-center">
            <div className="w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden border-4 border-primary/20 shadow-lg">
              <AvatarInitials name="Pedro Corgnati" size="xl" className="w-full h-full text-4xl rounded-full" />
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <Badge className="bg-accent text-accent-foreground hover:bg-accent">
              {t('professor.badge')}
            </Badge>
            <h2 id="professor-heading" className="text-3xl md:text-4xl font-bold text-foreground">
              {t('professor.title')}
            </h2>
            <p className="text-lg text-muted-foreground font-medium">
              {t('professor.subtitle')}
            </p>
            <p className="text-base text-muted-foreground leading-relaxed">
              {t('professor.bio')}
            </p>
            <ul className="space-y-3" aria-label="Credenciais do professor">
              {CREDENTIAL_KEYS.map((key) => (
                <li key={key} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  <span className="text-sm text-foreground">
                    {t(`professor.credentials.${key}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
