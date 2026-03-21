import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SessionRoom } from '@/components/session/session-room';

export const metadata: Metadata = {
  title: 'Sala de Aula',
  robots: 'noindex',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params;

  if (!id) notFound();

  return <SessionRoom sessionId={id} />;
}
