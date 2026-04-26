import 'server-only';
import { prisma } from '@/lib/prisma';

export type ReportType = 'financial' | 'sessions' | 'users' | 'feedback';

export interface ReportFilters {
  from?:     Date;
  to?:       Date;
  status?:   string;
  language?: string;
}

export interface ReportData {
  filename: string;
  sheet:    string;
  headers:  string[];
  rows:     Array<Record<string, unknown>>;
}

async function financialRows(f: ReportFilters): Promise<ReportData> {
  const rows = await prisma.payment.findMany({
    where: {
      createdAt: { gte: f.from, lte: f.to },
      ...(f.status ? { status: f.status as never } : {}),
    },
    select: {
      id: true, createdAt: true, amount: true, currency: true, status: true,
      stripePaymentIntentId: true,
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50000,
  });
  return {
    filename: 'financial',
    sheet:    'Financial',
    headers:  ['id', 'createdAt', 'userEmail', 'userName', 'amountCents', 'currency', 'status', 'stripeIntent'],
    rows:     rows.map((r) => ({
      id:           r.id,
      createdAt:    r.createdAt,
      userEmail:    r.user.email,
      userName:     r.user.name,
      amountCents:  r.amount,
      currency:     r.currency,
      status:       r.status,
      stripeIntent: r.stripePaymentIntentId,
    })),
  };
}

async function sessionsRows(f: ReportFilters): Promise<ReportData> {
  const rows = await prisma.session.findMany({
    where: {
      startAt: { gte: f.from, lte: f.to },
      ...(f.status ? { status: f.status as never } : {}),
    },
    select: {
      id: true, startAt: true, endAt: true, status: true, completedAt: true,
      student: { select: { email: true, name: true } },
    },
    orderBy: { startAt: 'desc' },
    take: 50000,
  });
  return {
    filename: 'sessions',
    sheet:    'Sessions',
    headers:  ['id', 'studentEmail', 'studentName', 'startAt', 'endAt', 'status', 'completedAt'],
    rows:     rows.map((r) => ({
      id:           r.id,
      studentEmail: r.student.email,
      studentName:  r.student.name,
      startAt:      r.startAt,
      endAt:        r.endAt,
      status:       r.status,
      completedAt:  r.completedAt,
    })),
  };
}

async function usersRows(f: ReportFilters): Promise<ReportData> {
  const rows = await prisma.user.findMany({
    where: {
      createdAt: { gte: f.from, lte: f.to },
      ...(f.language ? { preferredLanguage: f.language as never } : {}),
    },
    select: {
      id: true, email: true, name: true, role: true,
      preferredLanguage: true, country: true, createdAt: true, lastLoginAt: true,
      emailConfirmed: true, marketingOptIn: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50000,
  });
  return {
    filename: 'users',
    sheet:    'Users',
    headers:  ['id', 'email', 'name', 'role', 'language', 'country', 'createdAt', 'lastLoginAt', 'emailConfirmed', 'marketingOptIn'],
    rows:     rows.map((r) => ({
      id:              r.id,
      email:           r.email,
      name:            r.name,
      role:            r.role,
      language:        r.preferredLanguage,
      country:         r.country,
      createdAt:       r.createdAt,
      lastLoginAt:     r.lastLoginAt,
      emailConfirmed:  r.emailConfirmed,
      marketingOptIn:  r.marketingOptIn,
    })),
  };
}

async function feedbackRows(f: ReportFilters): Promise<ReportData> {
  const rows = await prisma.feedback.findMany({
    where: { createdAt: { gte: f.from, lte: f.to } },
    select: {
      id: true, createdAt: true, sessionId: true, reviewed: true,
      listeningScore: true, speakingScore: true, writingScore: true, vocabularyScore: true,
      overallFeedback: true,
      session: { select: { student: { select: { email: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50000,
  });
  return {
    filename: 'feedback',
    sheet:    'Feedback',
    headers:  ['id', 'createdAt', 'sessionId', 'studentEmail', 'studentName', 'listening', 'speaking', 'writing', 'vocabulary', 'reviewed', 'overall'],
    rows:     rows.map((r) => ({
      id:           r.id,
      createdAt:    r.createdAt,
      sessionId:    r.sessionId,
      studentEmail: r.session.student.email,
      studentName:  r.session.student.name,
      listening:    r.listeningScore,
      speaking:     r.speakingScore,
      writing:      r.writingScore,
      vocabulary:   r.vocabularyScore,
      reviewed:     r.reviewed,
      overall:      r.overallFeedback,
    })),
  };
}

export async function loadReport(type: ReportType, filters: ReportFilters): Promise<ReportData> {
  switch (type) {
    case 'financial': return financialRows(filters);
    case 'sessions':  return sessionsRows(filters);
    case 'users':     return usersRows(filters);
    case 'feedback':  return feedbackRows(filters);
  }
}
