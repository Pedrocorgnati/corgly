'use server';

// TODO: Implementar backend — run /auto-flow execute

export async function register(_data: unknown) {
  // TODO: Implementar backend — POST /api/v1/auth/register
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function login(_data: unknown) {
  // TODO: Implementar backend — POST /api/v1/auth/login
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function logout() {
  // TODO: Implementar backend — POST /api/v1/auth/logout
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function forgotPassword(_email: string) {
  // TODO: Implementar backend — POST /api/v1/auth/forgot-password
  return { success: false };
}

export async function resetPassword(_token: string, _password: string) {
  // TODO: Implementar backend — POST /api/v1/auth/reset-password
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function updateProfile(_data: unknown) {
  // TODO: Implementar backend — PATCH /api/v1/auth/profile
  throw new Error('Not implemented - run /auto-flow execute');
}

export async function getMe() {
  // TODO: Implementar backend — GET /api/v1/auth/me
  return { data: null };
}
