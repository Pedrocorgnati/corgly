'use server';

// TODO: Implementar backend — run /auto-flow execute

export async function getCredits() {
  // TODO: Implementar backend — GET /api/v1/credits
  return { data: { balance: 0, batches: [] }, total: 0 };
}

export async function createCheckoutSession(_packageType: string) {
  // TODO: Implementar backend — POST /api/v1/checkout
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function verifyPayment(_sessionId: string) {
  // TODO: Implementar backend — GET /api/v1/payments/verify
  return { data: { processed: false } };
}
