'use client';

import { useState, useCallback, useRef } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const STARS = [1, 2, 3, 4, 5] as const;

export interface StarRatingProps {
  /** Which dimension this rating represents */
  dimension: string;
  /** Visible label for the rating group */
  label: string;
  /** Current value (1-5, or 0 for unset) */
  value: number;
  /** Called when user selects a star */
  onChange: (value: number) => void;
  /** Disables interaction */
  disabled?: boolean;
  /** Validation error message */
  error?: string;
}

export function StarRating({
  dimension,
  label,
  value,
  onChange,
  disabled = false,
  error,
}: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, star: number) => {
      if (disabled) return;

      let next: number | null = null;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          e.preventDefault();
          next = star < 5 ? star + 1 : 1;
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          e.preventDefault();
          next = star > 1 ? star - 1 : 5;
          break;
        case 'Home':
          e.preventDefault();
          next = 1;
          break;
        case 'End':
          e.preventDefault();
          next = 5;
          break;
      }

      if (next !== null) {
        onChange(next);
        // Focus the target star button
        const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        buttons?.[next - 1]?.focus();
      }
    },
    [disabled, onChange],
  );

  const groupId = `star-rating-${dimension}`;

  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-1" id={`${groupId}-label`}>
        {label}
      </p>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        aria-describedby={error ? `${groupId}-error` : undefined}
        className="flex gap-1"
      >
        {STARS.map((star) => {
          const isSelected = star === value;
          const isFilled = (hovered || value) >= star;

          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
              tabIndex={isSelected || (value === 0 && star === 1) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onKeyDown={(e) => handleKeyDown(e, star)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center disabled:cursor-not-allowed rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Star
                className={cn(
                  'h-6 w-6 transition-colors',
                  isFilled
                    ? 'fill-warning text-warning'
                    : 'text-muted-foreground',
                )}
              />
            </button>
          );
        })}
      </div>
      {error && (
        <p id={`${groupId}-error`} role="alert" className="text-xs text-destructive mt-1">{error}</p>
      )}
      <p className="text-xs text-muted-foreground mt-1">1 = Ruim | 3 = Bom | 5 = Excelente</p>
    </div>
  );
}
