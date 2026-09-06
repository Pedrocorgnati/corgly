'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useLandingLocale } from '@/hooks/useLandingLocale';
import { apiClient } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import { localeToSupportedLanguage, type Locale } from '../../../i18n/config';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type PersistMode = 'cookie' | 'profile';
type DisplayVariant = 'flags' | 'compact';

type FlagConfig = {
  locale: Locale;
  src: string;
  ariaLabel: string;
  short: string;
  label: string;
};

const FLAGS: FlagConfig[] = [
  { locale: 'en-US', src: '/flags/us.svg', ariaLabel: 'Switch to English', short: 'EN', label: 'English' },
  { locale: 'it-IT', src: '/flags/it.svg', ariaLabel: "Passa all'Italiano", short: 'IT', label: 'Italiano' },
  { locale: 'pt-BR', src: '/flags/br.svg', ariaLabel: 'Mudar para Português', short: 'PT', label: 'Português' },
  { locale: 'es-ES', src: '/flags/es.svg', ariaLabel: 'Cambiar al Español', short: 'ES', label: 'Español' },
];

export function LanguageFlags({
  persist = 'cookie',
  variant = 'flags',
  className,
  inverted = false,
}: {
  persist?: PersistMode;
  variant?: DisplayVariant;
  className?: string;
  inverted?: boolean;
}) {
  const intlLocale = useLocale() as Locale;
  const { locale: landingLocale, setLocale } = useLandingLocale();
  const router = useRouter();
  const current = persist === 'profile' ? intlLocale : landingLocale;
  const currentFlag = FLAGS.find((flag) => flag.locale === current) ?? FLAGS[0];

  async function handleSelect(next: Locale) {
    if (next === current) return;
    if (persist === 'cookie') {
      setLocale(next);
      return;
    }
    try {
      await apiClient.patch(API.PROFILE, {
        preferredLanguage: localeToSupportedLanguage(next),
      });
      document.cookie = `corgly_locale=${next};path=/;max-age=31536000;SameSite=Lax`;
      router.refresh();
    } catch {
      toast.error('Could not save language. Try again.');
    }
  }

  if (variant === 'compact') {
    return (
      <div data-testid="language-flags" className={cn(className)}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                data-testid="language-selector-trigger-button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-9 min-h-[36px] gap-1 px-2 font-semibold',
                  inverted ? 'text-white hover:bg-white/10 hover:text-white' : 'text-foreground',
                )}
                aria-label="Select language"
              />
            }
          >
            <span>{currentFlag.short}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          </DropdownMenuTrigger>
          <DropdownMenuContent data-testid="language-selector-menu" align="end" className="min-w-[160px]">
            {FLAGS.map((flag) => (
              <DropdownMenuItem
                key={flag.locale}
                data-testid={`flag-${flag.locale}`}
                className={cn('gap-2 cursor-pointer', flag.locale === current && 'bg-accent font-medium')}
                onClick={() => {
                  void handleSelect(flag.locale);
                }}
              >
                <Image src={flag.src} alt="" width={20} height={14} className="h-3.5 w-5 object-cover rounded-[10px]" />
                <span>{flag.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div
      data-testid="language-flags"
      role="radiogroup"
      aria-label="Select language"
      className={cn('flex items-center gap-1', className)}
    >
      {FLAGS.map((flag) => {
        const isSelected = current === flag.locale;
        return (
          <button
            key={flag.locale}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={flag.ariaLabel}
            data-testid={`flag-${flag.locale}`}
            onClick={() => {
              void handleSelect(flag.locale);
            }}
            className={cn(
              'h-7 w-9 overflow-hidden rounded-[10px] border border-black/10 bg-white p-[1px] min-h-[28px] min-w-[36px]',
              isSelected && 'ring-2 ring-[#7c5cbf] ring-offset-1',
            )}
          >
            <Image
              src={flag.src}
              alt={flag.ariaLabel}
              width={32}
              height={22}
              className="h-full w-full object-cover"
            />
          </button>
        );
      })}
    </div>
  );
}
