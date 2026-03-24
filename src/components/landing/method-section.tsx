'use client';

import { Target, Clock, RefreshCw, Users, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const PILLARS = [
  { key: 'commitment', icon: Target },
  { key: 'time_boxed', icon: Clock },
  { key: 'cycle_based', icon: RefreshCw },
  { key: 'shared_context', icon: Users },
  { key: 'feedback_loop', icon: MessageCircle },
] as const;

export function MethodSection() {
  const t = useTranslations('landing');

  return (
    <section className="py-20 bg-surface" id="metodo" aria-labelledby="method-heading">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <Badge className="bg-accent text-accent-foreground hover:bg-accent mb-4">
            {t('method.badge')}
          </Badge>
          <h2 id="method-heading" className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t('method.title')}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('method.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PILLARS.map(({ key, icon: Icon }) => (
            <Card key={key} className="border-border hover:shadow-md transition-shadow duration-[180ms]">
              <CardContent className="p-6 space-y-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {t(`method.pillars.${key}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`method.pillars.${key}.description`)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
