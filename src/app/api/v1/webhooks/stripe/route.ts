import { NextRequest, NextResponse } from 'next/server';
import { stripeService } from '@/services/stripe.service';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const config = {
  api: { bodyParser: false },
};

/** POST /api/v1/webhooks/stripe */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = checkRateLimit(`webhook:${ip}`, RATE_LIMITS.WEBHOOK);
  if (!rl.allowed) {
    return NextResponse.json(apiResponse(null, 'Rate limit exceeded.'), { status: 429 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(apiResponse(null, 'Missing stripe-signature header.'), { status: 400 });
  }

  try {
    // Must read as buffer to verify Stripe signature
    const rawBody = Buffer.from(await request.arrayBuffer());
    await stripeService.handleWebhook(rawBody, signature);
    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('signature')) {
      return NextResponse.json(apiResponse(null, 'Invalid signature.'), { status: 400 });
    }
    return NextResponse.json(apiResponse(null, 'Webhook handling failed.'), { status: 500 });
  }
}
