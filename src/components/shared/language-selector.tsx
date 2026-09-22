'use client';

import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useLandingLocale } from '@/hooks/useLandingLocale';
import { type Locale } from '../../../i18n/config';
import { cn } from '@/lib/utils';

const LANGUAGES: { code: Locale; label: string; flag: string }[] = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'en-US', label: 'English', flag: '🇺🇸' },
  { code: 'es-ES', label: 'Español', flag: '🇪🇸' },
  { code: 'it-IT', label: 'Italiano', flag: '🇮🇹' },
];

export function LanguageSelector() {
  // Mesmo chokepoint das bandeiras: estado semeado pelo servidor + escrita
  // única (state + localStorage + cookie + perfil quando logado).
  const { locale, setLocale } = useLandingLocale();

  const currentLang = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  function handleLocaleChange(newLocale: Locale) {
    if (newLocale === locale) return;
    setLocale(newLocale);
  }

  return (
    <DropdownMenu>
      {/* base-ui compoe pelo prop `render`: o Trigger ja emite um <button>, entao
          passar <Button> como filho gerava <button> dentro de <button> (HTML
          invalido) e quebrava a hidratacao da pagina inteira. */}
      <DropdownMenuTrigger
        render={
          <Button
            data-testid="language-selector-trigger-button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground h-9"
            aria-label="Selecionar idioma"
          />
        }
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline text-sm">{currentLang.code.toUpperCase()}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-testid="language-selector-menu" align="end" className="min-w-[140px]">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            data-testid={`language-selector-option-${lang.code}`}
            className={cn(
              'gap-2 cursor-pointer',
              lang.code === locale && 'bg-accent font-medium'
            )}
            onClick={() => handleLocaleChange(lang.code)}
          >
            <span>{lang.flag}</span>
            <span className="text-sm">{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
