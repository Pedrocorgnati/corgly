'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ContentCard } from './content-card';
import { cn } from '@/lib/utils';

interface ContentItem {
  id: string;
  title: string;
  thumbnail: string;
  category: string;
  duration: string;
  publishedAt: string;
}

interface ContentGridProps {
  items: ContentItem[];
}

export function ContentGrid({ items }: ContentGridProps) {
  const t = useTranslations('content');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(items.map((item) => item.category)));
    return unique.sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!activeCategory) return items;
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  return (
    <div>
      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 mb-8" role="group" aria-label={t('filterLabel')}>
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
            !activeCategory
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
          )}
        >
          {t('filterAll')}
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              activeCategory === category
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <ContentCard
              key={item.id}
              id={item.id}
              title={item.title}
              thumbnail={item.thumbnail}
              category={item.category}
              duration={item.duration}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg">{t('emptyFilter')}</p>
        </div>
      )}
    </div>
  );
}
