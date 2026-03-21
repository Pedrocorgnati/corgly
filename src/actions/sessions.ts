'use server';

// TODO: Implementar backend — run /auto-flow execute

export async function getSessions() {
  // TODO: Implementar backend — GET /api/v1/sessions
  return { data: [], total: 0 };
}

export async function getSession(_id: string) {
  // TODO: Implementar backend — GET /api/v1/sessions/{id}
  return { data: null };
}

export async function bookSession(_slotId: string) {
  // TODO: Implementar backend — POST /api/v1/schedule/book
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function cancelSession(_id: string) {
  // TODO: Implementar backend — POST /api/v1/sessions/{id}/cancel
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function submitFeedback(_sessionId: string, _data: unknown) {
  // TODO: Implementar backend — POST /api/v1/sessions/{id}/feedback
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function getAvailability(_month: string) {
  // TODO: Implementar backend — GET /api/v1/schedule/availability
  return { data: {} };
}
