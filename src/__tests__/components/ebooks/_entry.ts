import { regressionEbookInput } from '@/__tests__/fixtures/ebooks/regression-ebook';
import { ebookCatalogEntrySchema } from '@/lib/ebooks/schema';

// Entrada ja validada pelo schema real, como o registro a entrega aos componentes.
export const regressionEntry = ebookCatalogEntrySchema.parse(regressionEbookInput);
