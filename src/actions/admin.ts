'use server';

// TODO: Implementar backend — run /auto-flow execute

export async function getAdminStats() {
  // TODO: Implementar backend — GET /api/v1/admin/stats
  return { data: null };
}

export async function getAdminStudents() {
  // TODO: Implementar backend — GET /api/v1/admin/students
  return { data: [], total: 0 };
}

export async function getAdminSessions() {
  // TODO: Implementar backend — GET /api/v1/admin/sessions
  return { data: [], total: 0 };
}

export async function getAdminSlots() {
  // TODO: Implementar backend — GET /api/v1/admin/schedule/slots
  return { data: [] };
}

export async function createSlot(_data: unknown) {
  // TODO: Implementar backend — POST /api/v1/admin/schedule/slots
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function deleteSlot(_id: string) {
  // TODO: Implementar backend — DELETE /api/v1/admin/schedule/slots/{id}
  throw new Error('Not implemented - run /auto-flow execute');
}
