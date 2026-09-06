import Link from 'next/link';
import { type VariantProps } from 'class-variance-authority';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

interface ButtonLinkProps extends VariantProps<typeof buttonVariants> {
  href: string;
  children: React.ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  external?: boolean;
  'data-testid'?: string;
}

export function ButtonLink({
  href,
  children,
  variant = 'default',
  size = 'default',
  className,
  target,
  rel,
  'data-testid': testId,
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      data-testid={testId}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {children}
    </Link>
  );
}
