import { ContentGrid } from '@/components/content/content-grid';

export const revalidate = 300; // ISR — revalidate every 5 minutes

// Placeholder content data for MVP
const CONTENT_ITEMS = [
  {
    id: 'greetings-intro',
    title: 'Cumprimentos em Português — Como se Apresentar',
    thumbnail: '/images/content/greetings.jpg',
    category: 'Gramática',
    duration: '12 min',
    publishedAt: '2026-03-01',
  },
  {
    id: 'verb-ser-estar',
    title: 'Ser vs Estar — Quando Usar Cada Um',
    thumbnail: '/images/content/ser-estar.jpg',
    category: 'Gramática',
    duration: '18 min',
    publishedAt: '2026-03-05',
  },
  {
    id: 'daily-routine-vocab',
    title: 'Vocabulário do Dia a Dia — Rotina',
    thumbnail: '/images/content/daily-routine.jpg',
    category: 'Vocabulário',
    duration: '10 min',
    publishedAt: '2026-03-08',
  },
  {
    id: 'pronunciation-nasal',
    title: 'Pronúncia — Sons Nasais do Português',
    thumbnail: '/images/content/pronunciation.jpg',
    category: 'Pronúncia',
    duration: '15 min',
    publishedAt: '2026-03-10',
  },
  {
    id: 'ordering-food',
    title: 'Conversação — Pedindo Comida no Restaurante',
    thumbnail: '/images/content/restaurant.jpg',
    category: 'Conversação',
    duration: '14 min',
    publishedAt: '2026-03-12',
  },
  {
    id: 'past-tense-basics',
    title: 'Pretérito Perfeito — Introdução ao Passado',
    thumbnail: '/images/content/past-tense.jpg',
    category: 'Gramática',
    duration: '20 min',
    publishedAt: '2026-03-15',
  },
];

export default function ContentPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="max-w-[1200px] mx-auto">
        <ContentGrid items={CONTENT_ITEMS} />
      </div>
    </div>
  );
}
