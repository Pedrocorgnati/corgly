interface JsonLdProps {
  schemas: Record<string, unknown>[];
}

/**
 * Injects JSON-LD structured data into the page.
 *
 * SECURITY: Only pass schemas built from internal constants (buildLandingPageSchemas, etc.).
 * Never pass user-controlled data — dangerouslySetInnerHTML would allow XSS.
 */
export function JsonLd({ schemas }: JsonLdProps) {
  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
