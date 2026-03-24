import { ImageResponse } from 'next/og';

export const alt = 'Corgly — Learn Brazilian Portuguese';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#312E81',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          fontFamily: 'system-ui, sans-serif',
          padding: '80px',
          position: 'relative',
        }}
      >
        {/* Logo */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: '#FFFFFF',
            letterSpacing: '-0.02em',
          }}
        >
          Corgly
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            color: '#C7D2FE',
            textAlign: 'center',
            maxWidth: '800px',
          }}
        >
          Learn Brazilian Portuguese with a Native Teacher
        </div>

        {/* Discount badge */}
        <div
          style={{
            background: '#4F46E5',
            color: '#FFFFFF',
            borderRadius: '9999px',
            padding: '14px 36px',
            fontSize: 22,
            fontWeight: 600,
          }}
        >
          First lesson 50% OFF — $12.50
        </div>

        {/* Bottom accent bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #4F46E5, #818CF8)',
          }}
        />
      </div>
    ),
    { ...size },
  );
}
