'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ContentCardProps {
  id: string;
  title: string;
  thumbnail: string;
  category: string;
  duration: string;
}

export function ContentCard({ id, title, thumbnail, category, duration }: ContentCardProps) {
  return (
    <Link
      href={`/content/${id}`}
      className={cn(
        'group block rounded-2xl border border-border bg-card overflow-hidden',
        'transition-shadow duration-200 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden">
        <Image
          src={thumbnail}
          alt={title}
          fill
          className="object-cover transition-transform duration-200 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      </div>
      <div className="p-4">
        <Badge variant="secondary" className="mb-2">
          {category}
        </Badge>
        <h3 className="text-base font-semibold text-foreground line-clamp-2 mb-2">
          {title}
        </h3>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{duration}</span>
        </div>
      </div>
    </Link>
  );
}
