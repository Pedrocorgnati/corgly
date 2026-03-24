import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword, comparePassword, signJWT } from '@/lib/auth';
import { emailService } from '@/services/email.service';
import { logAuthFailure, logAuthSuccess } from '@/lib/auth-logger';
import { EmailType, SupportedLanguage } from '@/types/enums';
import type {
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
  ResendConfirmationInput,
  DeleteAccountInput,
  CookieConsentInput,
} from '@/schemas/auth.schema';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://corgly.app';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  async register(data: RegisterInput): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new Error('EMAIL_ALREADY_EXISTS');

    const passwordHash = await hashPassword(data.password);
    const confirmToken = generateToken();
    const confirmTokenHash = hashToken(confirmToken); // RESOLVED: Email confirm tokens sem hash
    const confirmExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        timezone: data.timezone,
        country: data.country,
        termsAcceptedAt: new Date(),
        marketingOptIn: data.marketingOptIn ?? false,
        emailConfirmToken: confirmTokenHash,
        emailConfirmExpires: confirmExpires,
      },
    });

    const locale = (user.preferredLanguage as SupportedLanguage) ?? SupportedLanguage.PT_BR;
    await emailService.send({
      type: EmailType.CONFIRM_EMAIL,
      to: user.email,
      data: { name: user.name, link: `${BASE_URL}/auth/confirm-email?token=${confirmToken}` },
      locale,
    }).catch((err) => console.error('[AuthService] Failed to send confirm email:', err));
  }

  async login(data: LoginInput): Promise<{ user: { id: string; name: string; role: string; onboardingCompletedAt: Date | null; isFirstPurchase: boolean }; token: string }> {
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    if (!user) {
      await new Promise((r) => setTimeout(r, 200)); // timing attack protection
      logAuthFailure({ event: 'login.failed', email: data.email, reason: 'user_not_found' });
      throw new Error('INVALID_CREDENTIALS');
    }

    const valid = await comparePassword(data.password, user.passwordHash);
    if (!valid) {
      await new Promise((r) => setTimeout(r, 200));
      logAuthFailure({ event: 'login.failed', email: data.email, reason: 'wrong_password' });
      throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.emailConfirmed) throw new Error('EMAIL_NOT_CONFIRMED');
    if (user.deletionRequestedAt) throw new Error('ACCOUNT_PENDING_DELETION');

    const token = signJWT({ sub: user.id, role: user.role, version: user.tokenVersion });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logAuthSuccess({ event: 'login.success', userId: user.id });

    return {
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        onboardingCompletedAt: user.onboardingCompletedAt,
        isFirstPurchase: user.isFirstPurchase,
      },
      token,
    };
  }

  async confirmEmail(token: string): Promise<void> {
    const tokenHash = hashToken(token); // RESOLVED: compare hashed token
    const user = await prisma.user.findFirst({
      where: { emailConfirmToken: tokenHash },
    });

    if (!user || !user.emailConfirmExpires || user.emailConfirmExpires < new Date()) {
      throw new Error('INVALID_TOKEN');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailConfirmed: true,
        emailConfirmToken: null,
        emailConfirmExpires: null,
      },
    });

    logAuthSuccess({ event: 'email.confirmed', userId: user.id });
  }

  async forgotPassword(email: string): Promise<void> {
    // Always resolve (no user enumeration)
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const resetToken = generateToken();
    const resetTokenHash = hashToken(resetToken);
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetTokenHash,
        resetPasswordExpires: resetExpires,
      },
    });

    const locale = (user.preferredLanguage as SupportedLanguage) ?? SupportedLanguage.PT_BR;
    await emailService.send({
      type: EmailType.PASSWORD_RESET,
      to: user.email,
      data: { name: user.name, link: `${BASE_URL}/auth/reset-password?token=${resetToken}` },
      locale,
    }).catch((err) => console.error('[AuthService] Failed to send reset email:', err));
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: tokenHash,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) throw new Error('INVALID_TOKEN');

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 }, // invalida todos os tokens anteriores
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    logAuthSuccess({ event: 'password.reset', userId: user.id });
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        onboardingCompletedAt: true,
        isFirstPurchase: true,
        preferredLanguage: true,
        timezone: true,
        emailConfirmed: true,
        marketingOptIn: true,
        country: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return user;
  }

  async updateProfile(userId: string, data: UpdateProfileInput) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.preferredLanguage !== undefined && { preferredLanguage: data.preferredLanguage }),
        ...(data.marketingOptIn !== undefined && { marketingOptIn: data.marketingOptIn }),
        ...(data.country !== undefined && { country: data.country }),
      },
      select: {
        id: true, name: true, email: true, role: true, timezone: true,
        preferredLanguage: true, marketingOptIn: true, country: true,
      },
    });
    return user;
  }

  async completeOnboarding(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingCompletedAt: new Date(),
        isFirstPurchase: false,
      },
    });
  }

  async resendConfirmation(data: ResendConfirmationInput): Promise<void> {
    // Always resolve (no user enumeration)
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) return;
    if (user.emailConfirmed) return;

    // Se token ainda válido, não reenviar (anti-spam)
    if (user.emailConfirmExpires && user.emailConfirmExpires > new Date()) return;

    const confirmToken = generateToken();
    const confirmTokenHash = hashToken(confirmToken); // RESOLVED: store hash
    const confirmExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailConfirmToken: confirmTokenHash, emailConfirmExpires: confirmExpires },
    });

    const locale = (user.preferredLanguage as SupportedLanguage) ?? SupportedLanguage.PT_BR;
    await emailService.send({
      type: EmailType.CONFIRM_EMAIL,
      to: user.email,
      data: { name: user.name, link: `${BASE_URL}/auth/confirm-email?token=${confirmToken}` },
      locale,
    }).catch((err) => console.error('[AuthService] Failed to send confirm email:', err));
  }

  async deleteAccount(userId: string, data: DeleteAccountInput): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('USER_NOT_FOUND');

    const valid = await comparePassword(data.password, user.passwordHash);
    if (!valid) {
      logAuthFailure({ event: 'login.failed', userId, reason: 'wrong_password_for_deletion' });
      throw new Error('INVALID_CREDENTIALS');
    }

    // Verificar créditos ativos
    const activeCredits = await prisma.creditBatch.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
    });

    if (activeCredits.length > 0) {
      throw Object.assign(new Error('ACTIVE_CREDITS'), { credits: activeCredits });
    }

    const cancellationToken = generateToken();
    const cancellationTokenHash = hashToken(cancellationToken);
    const cancellationExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30d

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: new Date(),
        deletionCancellationToken: cancellationTokenHash,
        deletionCancellationExpires: cancellationExpires,
        tokenVersion: { increment: 1 },
      },
    });

    const locale = (user.preferredLanguage as SupportedLanguage) ?? SupportedLanguage.PT_BR;
    await emailService.send({
      type: EmailType.ACCOUNT_DELETION_REQUESTED,
      to: user.email,
      data: {
        name: user.name,
        cancelLink: `${BASE_URL}/auth/cancel-deletion?token=${cancellationToken}`,
      },
      locale,
    }).catch((err) => console.error('[AuthService] Failed to send deletion email:', err));

    logAuthFailure({ event: 'deletion.requested', userId, reason: 'user_requested' });
  }

  async cancelDeletion(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    const user = await prisma.user.findFirst({
      where: {
        deletionCancellationToken: tokenHash,
        deletionCancellationExpires: { gt: new Date() },
      },
    });

    if (!user) throw new Error('INVALID_TOKEN');

    await prisma.user.update({
      where: { id: user.id },
      data: {
        deletionRequestedAt: null,
        deletionCancellationToken: null,
        deletionCancellationExpires: null,
      },
    });

    logAuthFailure({ event: 'deletion.cancelled', userId: user.id, reason: 'user_cancelled' });
  }

  async exportData(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('USER_NOT_FOUND');

    // Em produção: enfileirar em queue (Bull, etc.)
    // Aqui: simular resposta assíncrona
    console.info('[AuthService] exportData job enqueued for user:', userId);

    // Não enviar email agora (seria enviado pelo worker ao concluir)
    // Em MVP: simular com link placeholder
  }

  async updateCookieConsent(params: {
    userId?: string;
    sessionFingerprint?: string;
    data: CookieConsentInput;
  }): Promise<void> {
    const existing = await prisma.cookieConsent.findFirst({
      where: {
        ...(params.userId ? { userId: params.userId } : {}),
        ...(params.sessionFingerprint ? { sessionFingerprint: params.sessionFingerprint } : {}),
      },
    });

    if (existing) {
      await prisma.cookieConsent.update({
        where: { id: existing.id },
        data: {
          analyticsAccepted: params.data.analytics,
          marketingAccepted: params.data.marketing,
        },
      });
    } else {
      await prisma.cookieConsent.create({
        data: {
          userId: params.userId,
          sessionFingerprint: params.sessionFingerprint,
          analyticsAccepted: params.data.analytics,
          marketingAccepted: params.data.marketing,
          essentialAccepted: true,
        },
      });
    }
  }

  async logout(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }
}

export const authService = new AuthService();
