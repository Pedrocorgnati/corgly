import { prisma } from '@/lib/prisma';
import { hashPassword, comparePassword, signJWT } from '@/lib/auth';
import type { RegisterInput, LoginInput, UpdateProfileInput } from '@/schemas/auth.schema';

export class AuthService {
  async register(data: RegisterInput) {
    // TODO: Implementar via /auto-flow execute
    // 1. Check email uniqueness
    // 2. Hash password
    // 3. Generate emailConfirmToken (crypto.randomBytes(32).toString('hex'))
    // 4. Create user
    // 5. EmailService.send(CONFIRM_EMAIL, email, { confirmUrl, name })
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async login(data: LoginInput) {
    // TODO: Implementar via /auto-flow execute
    // 1. Find user by email
    // 2. Check emailConfirmed
    // 3. comparePassword
    // 4. signJWT({ sub: user.id, role: user.role, version: user.tokenVersion })
    // 5. Return { user, token }
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async confirmEmail(token: string) {
    // TODO: Implementar via /auto-flow execute
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async forgotPassword(email: string) {
    // TODO: Implementar via /auto-flow execute
    // Always return 200 (no email enumeration)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async resetPassword(token: string, newPassword: string) {
    // TODO: Implementar via /auto-flow execute
    // 1. Find user by resetPasswordToken where resetPasswordExpires > NOW()
    // 2. hashPassword
    // 3. Update: passwordHash, tokenVersion+1, clear reset fields
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async getMe(userId: string) {
    // TODO: Implementar via /auto-flow execute
    return null;
  }

  async updateProfile(userId: string, data: UpdateProfileInput) {
    // TODO: Implementar via /auto-flow execute
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async completeOnboarding(userId: string) {
    // TODO: Implementar via /auto-flow execute
    throw new Error('Not implemented - run /auto-flow execute');
  }
}

export const authService = new AuthService();
