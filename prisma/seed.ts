import {
  PrismaClient,
  UserRole,
  CreditType,
  SupportedLanguage,
  SessionStatus,
  PaymentStatus,
  SubscriptionStatus,
  ContentType,
  DataRequestType,
  DataRequestChannel,
  DataRequestStatus,
  DataRequestJobStatus,
  AssetType,
  AssetStorageProvider,
  AssetProcessingStatus,
  TranscriptStatus,
  CaptionFormat,
  CaptionStatus,
  EmailType,
  EmailChannel,
  EmailTemplateStatus,
  EmailDeliveryStatus,
  CurrencyCode,
  FxRateSource,
  FxRoundingPolicy,
  LegalDocType,
  LegalDocStatus,
  LegalAcceptanceSource,
  LanguageProficiencyLevel,
  OnboardingStep,
  LanguageGoalType,
  WebRtcConnectionState,
  SessionHealthEventType,
  JobType,
  JobStatus,
  AdminImpersonationEndReason,
} from '@prisma/client'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { addDays, subDays, setHours, setMinutes, setSeconds, startOfDay } from 'date-fns'

const prisma = new PrismaClient()

function sha256Hex(input: string) {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

async function main() {
  console.log('🌱 Iniciando seed...')

  // ─── Admin user (Pedro) ─────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@123!', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'pedro@corgly.app' },
    update: {},
    create: {
      email: 'pedro@corgly.app',
      passwordHash: adminHash,
      name: 'Pedro',
      role: UserRole.ADMIN,
      timezone: 'America/Sao_Paulo',
      emailConfirmed: true,
      preferredLanguage: SupportedLanguage.PT_BR,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0',
      // Admin nao passa pelo onboarding de aluno: nasce com o marco preenchido.
      onboardingCompletedAt: new Date(),
    },
  })

  // Backfill idempotente: admin criado antes deste marco continuaria parecendo
  // aluno sem onboarding. Preserva a data existente quando ja houver uma.
  if (!admin.onboardingCompletedAt) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { onboardingCompletedAt: new Date() },
    })
    console.log('✅ Admin onboarding backfilled:', admin.id)
  }
  console.log('✅ Admin created:', admin.id)

  // ─── Test student ────────────────────────────────────────────────────
  const studentHash = await bcrypt.hash('Student@123!', 12)
  const student = await prisma.user.upsert({
    where: { email: 'student@test.com' },
    update: {},
    create: {
      email: 'student@test.com',
      passwordHash: studentHash,
      name: 'Test Student',
      role: UserRole.STUDENT,
      timezone: 'Europe/Rome',
      emailConfirmed: true,
      preferredLanguage: SupportedLanguage.IT_IT,
      isFirstPurchase: false,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0',
    },
  })
  console.log('✅ Student created:', student.id)

  // ─── Availability slots (próximos 7 dias, 10h-17h UTC = 8 slots/dia) ─
  const today = startOfDay(new Date())
  let slotsCreated = 0
  for (let day = 1; day <= 7; day++) {
    const date = addDays(today, day)
    for (let hour = 10; hour <= 17; hour++) {
      const startAt = setSeconds(setMinutes(setHours(date, hour), 0), 0)
      const endAt = setSeconds(setMinutes(setHours(date, hour + 1), 0), 0)
      await prisma.availabilitySlot.create({
        data: { startAt, endAt },
      })
      slotsCreated++
    }
  }
  console.log(
    `✅ Availability slots created: 7 days × 8 slots = ${slotsCreated} slots`,
  )

  // ─── Test credit batch for student ──────────────────────────────────
  const existingCreditBatch = await prisma.creditBatch.findFirst({
    where: { userId: student.id, type: CreditType.PACK_5 },
  })
  if (!existingCreditBatch) {
    await prisma.creditBatch.create({
      data: {
        userId: student.id,
        type: CreditType.PACK_5,
        totalCredits: 5,
        usedCredits: 0,
        expiresAt: addDays(new Date(), 180),
        reason: 'Seed: test pack',
      },
    })
    console.log('✅ Credit batch created for student')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLEMENTO — Cobertura de todos os estados de enum + edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Usuários extras para edge cases ────────────────────────────────────
  const extraHash = await bcrypt.hash('Student@123!', 12)

  // edge case US-001 [EDGE]: link de confirmação expirado — login bloqueado
  const studentUnconfirmed = await prisma.user.upsert({
    where: { email: 'student-unconfirmed+seed@test.com' },
    update: {},
    create: {
      email: 'student-unconfirmed+seed@test.com',
      passwordHash: extraHash,
      name: 'Carlo Bianchi',
      role: UserRole.STUDENT,
      timezone: 'Europe/Rome',
      emailConfirmed: false,
      emailConfirmToken: 'seed-expired-confirm-token-abc',
      emailConfirmExpires: subDays(new Date(), 1),
      preferredLanguage: SupportedLanguage.IT_IT,
      termsAcceptedAt: subDays(new Date(), 2),
      termsVersion: '1.0',
    },
  })

  // edge case US-004 [SUCCESS]: primeiro login — verá modal de onboarding
  const studentFirst = await prisma.user.upsert({
    where: { email: 'student-first+seed@test.com' },
    update: {},
    create: {
      email: 'student-first+seed@test.com',
      passwordHash: extraHash,
      name: 'María García',
      role: UserRole.STUDENT,
      timezone: 'America/Mexico_City',
      emailConfirmed: true,
      isFirstPurchase: true,
      onboardingCompletedAt: null,
      preferredLanguage: SupportedLanguage.ES_ES,
      termsAcceptedAt: subDays(new Date(), 1),
      termsVersion: '1.0',
    },
  })

  // para cenários de assinatura (ACTIVE / PAST_DUE)
  const studentSub = await prisma.user.upsert({
    where: { email: 'student-sub+seed@test.com' },
    update: {},
    create: {
      email: 'student-sub+seed@test.com',
      passwordHash: extraHash,
      name: 'James Miller',
      role: UserRole.STUDENT,
      timezone: 'America/New_York',
      emailConfirmed: true,
      isFirstPurchase: false,
      marketingOptIn: true,
      onboardingCompletedAt: subDays(new Date(), 30),
      preferredLanguage: SupportedLanguage.EN_US,
      termsAcceptedAt: subDays(new Date(), 30),
      termsVersion: '1.0',
    },
  })

  // edge case US-005 [SUCCESS]: solicitação de exclusão — dentro do prazo de 30 dias
  const studentDeletion = await prisma.user.upsert({
    where: { email: 'student-deletion+seed@test.com' },
    update: {},
    create: {
      email: 'student-deletion+seed@test.com',
      passwordHash: extraHash,
      name: 'Anna Rossi',
      role: UserRole.STUDENT,
      timezone: 'Europe/Rome',
      emailConfirmed: true,
      isFirstPurchase: false,
      preferredLanguage: SupportedLanguage.IT_IT,
      deletionRequestedAt: subDays(new Date(), 5),
      termsAcceptedAt: subDays(new Date(), 90),
      termsVersion: '1.0',
    },
  })

  console.log(`✅ Extra users: ${[studentUnconfirmed, studentFirst, studentSub, studentDeletion].map((u) => u.email).join(', ')}`)

  // ─── Onboarding profile — nível, objetivos, idioma, fuso e preferências ──
  const onboardingProfile = await prisma.onboardingProfile.upsert({
    where: { userId: studentFirst.id },
    update: {
      currentLevel: LanguageProficiencyLevel.BEGINNER,
      preferredLanguage: SupportedLanguage.ES_ES,
      timezone: studentFirst.timezone,
      currentStep: OnboardingStep.GOALS,
      preferences: {
        lessonCadence: 'WEEKLY',
        preferredSessionLengthMinutes: 60,
        focusAreas: ['conversação', 'pronúncia', 'viagem'],
        wantsHomework: true,
        wantsConversationFirst: true,
      },
    },
    create: {
      userId: studentFirst.id,
      currentLevel: LanguageProficiencyLevel.BEGINNER,
      preferredLanguage: SupportedLanguage.ES_ES,
      timezone: studentFirst.timezone,
      currentStep: OnboardingStep.GOALS,
      preferences: {
        lessonCadence: 'WEEKLY',
        preferredSessionLengthMinutes: 60,
        focusAreas: ['conversação', 'pronúncia', 'viagem'],
        wantsHomework: true,
        wantsConversationFirst: true,
      },
      notes: 'Seed: aluno em onboarding antes da primeira compra.',
    },
  })

  const onboardingGoals = [
    {
      type: LanguageGoalType.CONVERSATION,
      label: 'Conversar com confiança em viagens',
      description: 'Praticar situações reais de chegada, restaurante, transporte e small talk.',
      priority: 1,
    },
    {
      type: LanguageGoalType.PRONUNCIATION,
      label: 'Melhorar pronúncia do português brasileiro',
      description: 'Foco inicial em vogais abertas, nasalização e ritmo de fala.',
      priority: 2,
    },
  ]

  for (const goal of onboardingGoals) {
    await prisma.languageGoal.upsert({
      where: {
        profileId_type: {
          profileId: onboardingProfile.id,
          type: goal.type,
        },
      },
      update: {
        label: goal.label,
        description: goal.description,
        priority: goal.priority,
      },
      create: {
        profileId: onboardingProfile.id,
        ...goal,
      },
    })
  }

  console.log(`✅ Onboarding profile seeded for ${studentFirst.email}`)

  // ─── Slots passados (para sessões com todos os status históricos) ─────────
  const buildPastSlot = (daysAgo: number) => {
    const base = subDays(startOfDay(new Date()), daysAgo)
    return {
      startAt: setSeconds(setMinutes(setHours(base, 10), 0), 0),
      endAt: setSeconds(setMinutes(setHours(base, 11), 0), 0),
    }
  }

  // pastSlots[0] = hoje 10h, [1] = ontem, ..., [6] = há 6 dias
  const pastSlots = await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map(async (daysAgo) => {
      const { startAt, endAt } = buildPastSlot(daysAgo)
      return prisma.availabilitySlot.upsert({
        where: { startAt },
        update: {},
        create: { startAt, endAt },
      })
    }),
  )

  // Slot bloqueado (dia +10 — admin bloqueou)
  const blockedStartAt = setSeconds(setMinutes(setHours(addDays(startOfDay(new Date()), 10), 10), 0), 0)
  await prisma.availabilitySlot.upsert({
    where: { startAt: blockedStartAt },
    update: {},
    create: {
      startAt: blockedStartAt,
      endAt: setSeconds(setMinutes(setHours(addDays(startOfDay(new Date()), 10), 11), 0), 0),
      isBlocked: true,
    },
  })

  // Slots futuros além do dia +7 (para SCHEDULED e RESCHEDULE_PENDING)
  const [futureSlot8, futureSlot9] = await Promise.all(
    [8, 9].map(async (d) => {
      const base = addDays(startOfDay(new Date()), d)
      const startAt = setSeconds(setMinutes(setHours(base, 10), 0), 0)
      const endAt = setSeconds(setMinutes(setHours(base, 11), 0), 0)
      return prisma.availabilitySlot.upsert({
        where: { startAt },
        update: {},
        create: { startAt, endAt },
      })
    }),
  )

  console.log(`✅ Availability slots: ${pastSlots.length} past + 1 blocked + 2 future (day 8-9)`)

  // ─── CreditBatches adicionais — cobrir SINGLE/PACK_10/MONTHLY/PROMO/MANUAL/REFUND ─
  const creditDefs = [
    { type: CreditType.SINGLE,  total: 1,  used: 1, expiry: addDays(new Date(), 180), reason: 'Seed: primeira aula 50% off — consumida',                   expiryWarn: null },
    { type: CreditType.PACK_10, total: 10, used: 3, expiry: addDays(new Date(), 60),  reason: 'Seed: pacote 10 aulas',                                       expiryWarn: subDays(new Date(), 7) },
    { type: CreditType.MONTHLY, total: 8,  used: 2, expiry: null,                     reason: 'Seed: créditos mensais — assinatura ACTIVE sem expiração',    expiryWarn: null },
    { type: CreditType.PROMO,   total: 2,  used: 0, expiry: addDays(new Date(), 90),  reason: 'Seed: créditos promocionais',                                  expiryWarn: null },
    { type: CreditType.MANUAL,  total: 1,  used: 0, expiry: addDays(new Date(), 60),  reason: 'Seed: crédito manual adicionado pelo admin',                   expiryWarn: null },
    { type: CreditType.REFUND,  total: 1,  used: 0, expiry: addDays(new Date(), 90),  reason: 'Seed: reembolso por cancelamento admin — US-009 [SUCCESS]',    expiryWarn: null },
  ] as const

  for (const def of creditDefs) {
    const existing = await prisma.creditBatch.findFirst({ where: { userId: student.id, type: def.type } })
    if (!existing) {
      await prisma.creditBatch.create({
        data: {
          userId: student.id,
          type: def.type,
          totalCredits: def.total,
          usedCredits: def.used,
          expiresAt: def.expiry,
          reason: def.reason,
          lastExpiryEmailSent: def.expiryWarn,
        },
      })
    }
  }

  // Lote mensal para studentSub (assinatura ativa)
  const existingSubBatch = await prisma.creditBatch.findFirst({ where: { userId: studentSub.id, type: CreditType.MONTHLY } })
  if (!existingSubBatch) {
    await prisma.creditBatch.create({
      data: { userId: studentSub.id, type: CreditType.MONTHLY, totalCredits: 10, usedCredits: 0, expiresAt: null, reason: 'Seed: créditos mensais studentSub' },
    })
  }

  // Buscar PACK_5 para referências nas sessões e pagamento
  const pack5 = await prisma.creditBatch.findFirst({ where: { userId: student.id, type: CreditType.PACK_5 } })

  console.log('✅ CreditBatches: SINGLE / PACK_10 / MONTHLY / PROMO / MANUAL / REFUND')

  // ─── RecurringPatterns ───────────────────────────────────────────────────
  let rpActive = await prisma.recurringPattern.findFirst({ where: { studentId: student.id, dayOfWeek: 1, startTime: '10:00' } })
  if (!rpActive) {
    rpActive = await prisma.recurringPattern.create({
      data: { studentId: student.id, dayOfWeek: 1, startTime: '10:00', isActive: true },
    })
  }
  const rpInactiveExists = await prisma.recurringPattern.findFirst({ where: { studentId: student.id, dayOfWeek: 3, startTime: '15:00' } })
  if (!rpInactiveExists) {
    await prisma.recurringPattern.create({
      data: { studentId: student.id, dayOfWeek: 3, startTime: '15:00', isActive: false },
    })
  }

  console.log('✅ RecurringPatterns: ativo (Seg 10h) + inativo (Qua 15h)')

  // ─── Sessões — todos os 9 status ─────────────────────────────────────────
  const interruptedAt = setSeconds(setMinutes(setHours(subDays(startOfDay(new Date()), 6), 10), 30), 0)

  const sessionDefs = [
    { slot: pastSlots[0], status: SessionStatus.IN_PROGRESS,          creditBatchId: pack5?.id ?? null, isRecurring: false, recurringPatternId: null, cancelledAt: null, cancelledBy: null, completedAt: null, interruptedAt: null, extendedBy: null, reminderSentAt: null, rescheduleRequestSlotId: null },
    { slot: pastSlots[1], status: SessionStatus.COMPLETED,             creditBatchId: pack5?.id ?? null, isRecurring: false, recurringPatternId: null, cancelledAt: null, cancelledBy: null, completedAt: pastSlots[1].startAt, interruptedAt: null, extendedBy: null, reminderSentAt: null, rescheduleRequestSlotId: null },
    { slot: pastSlots[2], status: SessionStatus.CANCELLED_BY_STUDENT,  creditBatchId: null, isRecurring: false, recurringPatternId: null, cancelledAt: pastSlots[2].startAt, cancelledBy: UserRole.STUDENT, completedAt: null, interruptedAt: null, extendedBy: null, reminderSentAt: null, rescheduleRequestSlotId: null },
    { slot: pastSlots[3], status: SessionStatus.CANCELLED_BY_ADMIN,    creditBatchId: null, isRecurring: false, recurringPatternId: null, cancelledAt: pastSlots[3].startAt, cancelledBy: UserRole.ADMIN,   completedAt: null, interruptedAt: null, extendedBy: null, reminderSentAt: null, rescheduleRequestSlotId: null },
    { slot: pastSlots[4], status: SessionStatus.NO_SHOW_STUDENT,       creditBatchId: pack5?.id ?? null, isRecurring: false, recurringPatternId: null, cancelledAt: null, cancelledBy: null, completedAt: null, interruptedAt: null, extendedBy: null, reminderSentAt: null, rescheduleRequestSlotId: null },
    { slot: pastSlots[5], status: SessionStatus.NO_SHOW_ADMIN,         creditBatchId: null, isRecurring: false, recurringPatternId: null, cancelledAt: null, cancelledBy: null, completedAt: null, interruptedAt: null, extendedBy: null, reminderSentAt: null, rescheduleRequestSlotId: null },
    { slot: pastSlots[6], status: SessionStatus.INTERRUPTED,           creditBatchId: pack5?.id ?? null, isRecurring: false, recurringPatternId: null, cancelledAt: null, cancelledBy: null, completedAt: null, interruptedAt, extendedBy: 15, reminderSentAt: null, rescheduleRequestSlotId: null },
    { slot: futureSlot8,  status: SessionStatus.SCHEDULED,             creditBatchId: pack5?.id ?? null, isRecurring: true,  recurringPatternId: rpActive.id, cancelledAt: null, cancelledBy: null, completedAt: null, interruptedAt: null, extendedBy: null, reminderSentAt: { '24h': addDays(futureSlot8.startAt, -1).toISOString() } as object, rescheduleRequestSlotId: null },
    { slot: futureSlot9,  status: SessionStatus.RESCHEDULE_PENDING,    creditBatchId: null, isRecurring: false, recurringPatternId: null, cancelledAt: null, cancelledBy: null, completedAt: null, interruptedAt: null, extendedBy: null, reminderSentAt: null, rescheduleRequestSlotId: null },
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createdSessions: Record<string, any> = {}

  for (const def of sessionDefs) {
    const upserted = await prisma.session.upsert({
      where: { availabilitySlotId: def.slot.id },
      update: {},
      create: {
        studentId: student.id,
        availabilitySlotId: def.slot.id,
        startAt: def.slot.startAt,
        endAt: def.slot.endAt,
        status: def.status,
        creditBatchId: def.creditBatchId,
        isRecurring: def.isRecurring,
        recurringPatternId: def.recurringPatternId,
        cancelledAt: def.cancelledAt,
        cancelledBy: def.cancelledBy,
        completedAt: def.completedAt,
        interruptedAt: def.interruptedAt,
        extendedBy: def.extendedBy,
        reminderSentAt: def.reminderSentAt as never,
        rescheduleRequestSlotId: def.rescheduleRequestSlotId,
      },
    })
    createdSessions[def.status] = upserted
  }

  console.log(`✅ Sessions (9 status): ${Object.keys(createdSessions).join(' | ')}`)

  // ─── SessionHealth - métricas WebRTC e reconnect por participante ────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const healthOccurredAt = (session: any, minutesAfterStart: number) =>
    new Date(new Date(session.startAt).getTime() + minutesAfterStart * 60_000)

  const sessionHealthDefs = [
    {
      session: createdSessions[SessionStatus.IN_PROGRESS],
      participantId: student.id,
      participantRole: UserRole.STUDENT,
      eventType: SessionHealthEventType.METRIC_SNAPSHOT,
      occurredAt: healthOccurredAt(createdSessions[SessionStatus.IN_PROGRESS], 10),
      latencyMs: 84,
      jitterMs: 12,
      packetLossPercent: 0.35,
      webrtcState: WebRtcConnectionState.CONNECTED,
      reconnectAttempt: 0,
      reconnectReason: null,
      reconnectSuccessful: null,
      metadata: { source: 'seed', browser: 'Chrome', network: 'wifi' },
    },
    {
      session: createdSessions[SessionStatus.IN_PROGRESS],
      participantId: admin.id,
      participantRole: UserRole.ADMIN,
      eventType: SessionHealthEventType.CONNECTION_STATE,
      occurredAt: healthOccurredAt(createdSessions[SessionStatus.IN_PROGRESS], 15),
      latencyMs: 61,
      jitterMs: 8,
      packetLossPercent: 0,
      webrtcState: WebRtcConnectionState.CONNECTED,
      reconnectAttempt: 0,
      reconnectReason: null,
      reconnectSuccessful: null,
      metadata: { source: 'seed', browser: 'Firefox', network: 'ethernet' },
    },
    {
      session: createdSessions[SessionStatus.INTERRUPTED],
      participantId: student.id,
      participantRole: UserRole.STUDENT,
      eventType: SessionHealthEventType.RECONNECT_FAILED,
      occurredAt: interruptedAt,
      latencyMs: 1430,
      jitterMs: 320,
      packetLossPercent: 18.75,
      webrtcState: WebRtcConnectionState.FAILED,
      reconnectAttempt: 3,
      reconnectReason: 'ICE disconnected after unstable mobile network',
      reconnectSuccessful: false,
      metadata: { source: 'seed', iceRestarts: 3, lastCandidateType: 'relay' },
    },
  ] as const

  for (const def of sessionHealthDefs) {
    if (!def.session) {
      continue
    }

    const exists = await prisma.sessionHealth.findFirst({
      where: {
        sessionId: def.session.id,
        participantId: def.participantId,
        eventType: def.eventType,
        occurredAt: def.occurredAt,
      },
    })

    if (!exists) {
      await prisma.sessionHealth.create({
        data: {
          sessionId: def.session.id,
          participantId: def.participantId,
          participantRole: def.participantRole,
          eventType: def.eventType,
          occurredAt: def.occurredAt,
          latencyMs: def.latencyMs,
          jitterMs: def.jitterMs,
          packetLossPercent: def.packetLossPercent,
          webrtcState: def.webrtcState,
          reconnectAttempt: def.reconnectAttempt,
          reconnectReason: def.reconnectReason,
          reconnectSuccessful: def.reconnectSuccessful,
          metadata: def.metadata,
        },
      })
    }
  }

  console.log('✅ SessionHealth: métricas WebRTC, packet loss e reconnect')

  // ─── Feedback para sessão COMPLETED ──────────────────────────────────────
  const completedSession = createdSessions[SessionStatus.COMPLETED]
  if (completedSession) {
    const existingFeedback = await prisma.feedback.findFirst({ where: { sessionId: completedSession.id } })
    if (!existingFeedback) {
      await prisma.feedback.create({
        data: {
          sessionId: completedSession.id,
          listeningScore: 5,
          speakingScore: 4,
          writingScore: 5,
          vocabularyScore: 5,
          overallFeedback: 'Aula excelente! Pedro explicou os tempos verbais com muita clareza. Já me sinto mais confiante.',
          adminId: admin.id,
          privateNote: 'Aluno demonstrou ótima evolução na pronúncia dos ditongos. Focar em subjuntivo na próxima.',
          reviewed: true,
          reviewedAt: subDays(new Date(), 1),
        },
      })
      console.log('✅ Feedback (sessão COMPLETED) criado')
    }
  }

  // ─── SessionDocument para sessão COMPLETED ───────────────────────────────
  if (completedSession) {
    const existingDoc = await prisma.sessionDocument.findFirst({ where: { sessionId: completedSession.id } })
    if (!existingDoc) {
      await prisma.sessionDocument.create({
        data: {
          sessionId: completedSession.id,
          plainTextSnapshot:
            'Aula 1 — Revisão do presente do indicativo\n\nConjugação dos verbos regulares: -ar, -er, -ir\nExemplos: falar, comer, partir\n\nTarefa de casa: conjugar 10 verbos irregulares (ser, estar, ter, haver, ir, fazer, poder, querer, trazer, vir)',
        },
      })
      console.log('✅ SessionDocument criado')
    }
  }

  // ─── Payments — todos os 4 status ────────────────────────────────────────
  const paymentDefs = [
    { piId: 'pi_seed_succeeded_001', amount: 11000, status: PaymentStatus.SUCCEEDED, creditBatchId: pack5?.id ?? null, createdAt: subDays(new Date(), 14) },
    { piId: 'pi_seed_failed_001',    amount: 11000, status: PaymentStatus.FAILED,    creditBatchId: null,               createdAt: subDays(new Date(), 10) },
    { piId: 'pi_seed_refunded_001',  amount: 2500,  status: PaymentStatus.REFUNDED,  creditBatchId: null,               createdAt: subDays(new Date(), 7)  },
    { piId: 'pi_seed_pending_001',   amount: 19900, status: PaymentStatus.PENDING,   creditBatchId: null,               createdAt: subDays(new Date(), 1)  },
  ]

  for (const p of paymentDefs) {
    await prisma.payment.upsert({
      where: { stripePaymentIntentId: p.piId },
      update: {},
      create: {
        userId: student.id,
        stripePaymentIntentId: p.piId,
        amount: p.amount,
        currency: 'usd',
        status: p.status,
        creditBatchId: p.creditBatchId,
        createdAt: p.createdAt,
        updatedAt: p.createdAt,
      },
    })
  }

  console.log('✅ Payments: SUCCEEDED / FAILED / REFUNDED / PENDING')

  // ─── Subscriptions — todos os 4 status ───────────────────────────────────
  type SubDef = { stripeId: string; userId: string; status: SubscriptionStatus; freq: number; start: Date; end: Date; cancelledAt?: Date }
  const subDefs: SubDef[] = [
    { stripeId: 'sub_seed_active_001',   userId: studentSub.id,  status: SubscriptionStatus.ACTIVE,    freq: 2, start: subDays(new Date(), 5),  end: addDays(new Date(), 25) },
    { stripeId: 'sub_seed_cancelled_001',userId: student.id,     status: SubscriptionStatus.CANCELLED, freq: 1, start: subDays(new Date(), 35), end: subDays(new Date(), 5), cancelledAt: subDays(new Date(), 5) },
    { stripeId: 'sub_seed_past_due_001', userId: studentSub.id,  status: SubscriptionStatus.PAST_DUE,  freq: 3, start: subDays(new Date(), 10), end: addDays(new Date(), 20) },
    { stripeId: 'sub_seed_paused_001',   userId: student.id,     status: SubscriptionStatus.PAUSED,    freq: 1, start: subDays(new Date(), 20), end: addDays(new Date(), 10) },
  ]

  for (const s of subDefs) {
    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: s.stripeId },
      update: {},
      create: {
        userId: s.userId,
        stripeSubscriptionId: s.stripeId,
        status: s.status,
        weeklyFrequency: s.freq,
        currentPeriodStart: s.start,
        currentPeriodEnd: s.end,
        cancelledAt: s.cancelledAt ?? null,
      },
    })
  }

  console.log('✅ Subscriptions: ACTIVE / CANCELLED / PAST_DUE / PAUSED')

  // ─── Content — VIDEO e ARTICLE em todos os idiomas ───────────────────────
  const contentDefs = [
    { title: 'Introdução ao Corgly Method',        type: ContentType.VIDEO,   youtubeUrl: 'https://www.youtube.com/watch?v=seed-pt-001', description: 'Entenda os 4 pilares do Corgly Method: fluidez, gramática contextual, cultura e pronúncia.', language: SupportedLanguage.PT_BR, isPublished: true,  sortOrder: 1 },
    { title: 'Introduction to the Corgly Method',  type: ContentType.VIDEO,   youtubeUrl: 'https://www.youtube.com/watch?v=seed-en-001', description: 'Discover the 4 pillars of the Corgly Method: fluency, contextual grammar, culture, and pronunciation.', language: SupportedLanguage.EN_US, isPublished: true,  sortOrder: 1 },
    { title: 'Come funziona il Corgly Method',     type: ContentType.ARTICLE, youtubeUrl: 'https://www.youtube.com/watch?v=seed-it-001', description: 'Scopri come il Corgly Method trasforma l\'apprendimento del portoghese.', language: SupportedLanguage.IT_IT, isPublished: true,  sortOrder: 2 },
    { title: 'Cómo funciona el Corgly Method',     type: ContentType.VIDEO,   youtubeUrl: 'https://www.youtube.com/watch?v=seed-es-001', description: 'Próximamente: descubre los 4 pilares del método Corgly.', language: SupportedLanguage.ES_ES, isPublished: false, sortOrder: 3 },
  ]

  for (const c of contentDefs) {
    const existing = await prisma.content.findFirst({ where: { title: c.title, language: c.language } })
    if (!existing) await prisma.content.create({ data: c })
  }

  console.log('✅ Content: VIDEO (PT, EN, ES rascunho) + ARTICLE (IT)')

  // ─── Assets, transcripts e captions — vídeo com legenda pt-BR (§12.4.2 / §12.4.4) ──
  const assetContent = await prisma.content.findFirst({
    where: { title: 'Introdução ao Corgly Method', language: SupportedLanguage.PT_BR },
  })
  const assetSession = createdSessions[SessionStatus.COMPLETED]
  const demoVideo = await prisma.asset.upsert({
    where: { storageKey: 'seed/assets/corgly-method-intro-pt-br.mp4' },
    update: {},
    create: {
      ownerId: student.id,
      sessionId: assetSession?.id ?? null,
      contentId: assetContent?.id ?? null,
      type: AssetType.VIDEO,
      storageProvider: AssetStorageProvider.LOCAL,
      storageKey: 'seed/assets/corgly-method-intro-pt-br.mp4',
      originalFilename: 'corgly-method-intro-pt-br.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: BigInt(24_576_000),
      checksumSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      publicUrl: 'https://cdn.corgly.example/assets/corgly-method-intro-pt-br.mp4',
      durationSeconds: 184,
      language: SupportedLanguage.PT_BR,
      processingStatus: AssetProcessingStatus.READY,
      processedAt: new Date(),
      metadata: {
        seededBy: 'prisma/seed.ts',
        scenario: 'video asset with transcript and pt-BR caption',
      },
    },
  })

  const demoTranscript = await prisma.transcript.upsert({
    where: {
      assetId_language: {
        assetId: demoVideo.id,
        language: SupportedLanguage.PT_BR,
      },
    },
    update: {},
    create: {
      assetId: demoVideo.id,
      language: SupportedLanguage.PT_BR,
      status: TranscriptStatus.READY,
      provider: 'seed',
      rawText:
        'Bem-vindo ao Corgly Method. Nesta aula apresentamos fluidez, gramática contextual, cultura e pronúncia em uma rotina prática de estudo.',
      normalizedText:
        'Bem-vindo ao Corgly Method. Nesta aula apresentamos fluidez, gramática contextual, cultura e pronúncia em uma rotina prática de estudo.',
      confidence: 0.98,
      startedAt: subDays(new Date(), 1),
      completedAt: new Date(),
      metadata: {
        seededBy: 'prisma/seed.ts',
      },
    },
  })

  await prisma.caption.upsert({
    where: {
      assetId_language_format: {
        assetId: demoVideo.id,
        language: SupportedLanguage.PT_BR,
        format: CaptionFormat.VTT,
      },
    },
    update: {},
    create: {
      assetId: demoVideo.id,
      transcriptId: demoTranscript.id,
      language: SupportedLanguage.PT_BR,
      format: CaptionFormat.VTT,
      status: CaptionStatus.READY,
      storageKey: 'seed/captions/corgly-method-intro-pt-br.vtt',
      publicUrl: 'https://cdn.corgly.example/captions/corgly-method-intro-pt-br.vtt',
      content:
        'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nBem-vindo ao Corgly Method.\n\n00:00:05.000 --> 00:00:12.000\nNesta aula apresentamos fluidez, gramática contextual, cultura e pronúncia.',
      generatedAt: new Date(),
      metadata: {
        seededBy: 'prisma/seed.ts',
        sourceTranscriptId: demoTranscript.id,
      },
    },
  })

  console.log('✅ Asset: vídeo demo com transcript e caption pt-BR')

  // ─── CookieConsent ────────────────────────────────────────────────────────
  const cookieDefs = [
    { userId: student.id,  sessionFingerprint: null,                  essentialAccepted: true, analyticsAccepted: true,  marketingAccepted: true  },
    { userId: null,        sessionFingerprint: 'fp_seed_anon_001',    essentialAccepted: true, analyticsAccepted: false, marketingAccepted: false },
    { userId: null,        sessionFingerprint: 'fp_seed_anon_002',    essentialAccepted: true, analyticsAccepted: true,  marketingAccepted: false },
  ]

  for (const cc of cookieDefs) {
    const existing = cc.userId
      ? await prisma.cookieConsent.findFirst({ where: { userId: cc.userId } })
      : await prisma.cookieConsent.findFirst({ where: { sessionFingerprint: cc.sessionFingerprint! } })
    if (!existing) await prisma.cookieConsent.create({ data: cc })
  }

  console.log('✅ CookieConsent: user (tudo aceito) + anon (essencial) + anon (analytics)')

  // ─── SupportTicket — exemplo de thread aluno/admin (§12.4.4) ──────────────
  const supportSubject = 'Não consigo entrar na sala virtual'
  const existingTicket = await prisma.supportTicket.findFirst({ where: { subject: supportSubject } })
  if (!existingTicket) {
    await prisma.supportTicket.create({
      data: {
        subject: supportSubject,
        status: 'OPEN',
        priority: 'HIGH',
        userId: student.id,
        messages: {
          create: [
            {
              authorId: student.id,
              authorRole: 'STUDENT',
              body: 'Cliquei em entrar na sala mas a tela fica carregando. O que faço?',
              isInternal: false,
            },
            {
              authorId: admin.id,
              authorRole: 'ADMIN',
              body: 'Oi! Pode tentar atualizar a página e verificar a câmera/microfone? Já vou acompanhar por aqui.',
              isInternal: false,
            },
            {
              authorId: admin.id,
              authorRole: 'ADMIN',
              body: 'Nota interna: verificar se o token do Hocuspocus expirou para este aluno.',
              isInternal: true,
            },
          ],
        },
      },
    })
  }

  console.log('✅ SupportTicket: ticket exemplo (aluno) com 2 mensagens públicas + 1 nota interna')

  // ─── Referral — programa do aluno com 1 convite aceito + crédito concedido (§12.4.3/§12.4.4) ──
  const referralCode = 'CORGLY-REF-DEMO'
  const existingReferral = await prisma.referral.findUnique({ where: { code: referralCode } })
  if (!existingReferral) {
    const referral = await prisma.referral.create({
      data: {
        code: referralCode,
        referrerId: student.id,
        status: 'ACTIVE',
        invites: {
          create: [
            {
              invitedEmail: 'amigo.convidado@example.com',
              invitedUserId: studentFirst.id,
              status: 'ACCEPTED',
              acceptedAt: new Date(),
            },
            {
              invitedEmail: 'pendente.convidado@example.com',
              status: 'PENDING',
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          ],
        },
      },
      include: { invites: true },
    })

    const acceptedInvite = referral.invites.find((i) => i.status === 'ACCEPTED')
    if (acceptedInvite) {
      await prisma.referralCredit.create({
        data: {
          referralId: referral.id,
          inviteId: acceptedInvite.id,
          beneficiaryUserId: student.id,
          amount: 1,
          status: 'GRANTED',
          grantedAt: new Date(),
        },
      })
    }
  }

  console.log('✅ Referral: programa do aluno (1 convite aceito + 1 pendente) com crédito concedido')

  // ─── Feature flags — realtime (sala), billing portal e onboarding v2 (§12.4.2) ──
  const featureFlagSeeds = [
    {
      key: 'realtime-room',
      description: 'Habilita a sala em tempo real (signaling/áudio-vídeo) durante o rollout gradual.',
      enabled: true,
      rolloutPercentage: 25,
      scope: 'GLOBAL' as const,
    },
    {
      key: 'billing-portal',
      description: 'Expõe o portal de billing do aluno (gestão de assinatura e métodos de pagamento).',
      enabled: true,
      rolloutPercentage: 100,
      scope: 'GLOBAL' as const,
    },
    {
      key: 'onboarding-v2',
      description: 'Novo fluxo de onboarding v2 — liberado apenas para o coorte de beta testers.',
      enabled: true,
      rolloutPercentage: 100,
      scope: 'COHORT' as const,
      targetCohort: 'beta',
    },
  ]

  for (const ff of featureFlagSeeds) {
    const existing = await prisma.featureFlag.findUnique({ where: { key: ff.key } })
    if (!existing) {
      const created = await prisma.featureFlag.create({ data: ff })
      await prisma.featureFlagAudit.create({
        data: {
          flagId: created.id,
          actorId: admin.id,
          action: 'CREATED',
          fromEnabled: null,
          toEnabled: created.enabled,
          metadata: {
            seededBy: 'prisma/seed.ts',
            rolloutPercentage: created.rolloutPercentage,
            scope: created.scope,
          },
        },
      })
    }
  }

  console.log('✅ FeatureFlag: realtime-room (25%), billing-portal (100%), onboarding-v2 (coorte beta) + auditoria CREATED')

  const leadSeeds = [
    {
      origin: 'LANDING' as const,
      email: 'lead.landing@corgly.demo',
      name: 'Visitante Landing',
      message: null,
      locale: SupportedLanguage.PT_BR,
      consentGiven: true,
      consentAt: new Date(),
    },
    {
      origin: 'CONTACT' as const,
      email: 'lead.contato@corgly.demo',
      name: 'Visitante Contato',
      message: 'Gostaria de saber mais sobre as aulas e os planos disponíveis.',
      locale: SupportedLanguage.PT_BR,
      consentGiven: true,
      consentAt: new Date(),
    },
  ]

  for (const lead of leadSeeds) {
    const existing = await prisma.lead.findFirst({
      where: { email: lead.email, origin: lead.origin },
    })
    if (!existing) {
      await prisma.lead.create({ data: lead })
    }
  }

  console.log('✅ Lead: captação demo landing + contato (idempotente por email/origem)')

  // ─── DataRequest — DSR pendente e concluído (§12.4.1 / §12.4.4) ─────────
  const pendingDataRequest = await prisma.dataRequest.upsert({
    where: { referenceCode: 'DSR-SEED-PENDING-001' },
    update: {},
    create: {
      referenceCode: 'DSR-SEED-PENDING-001',
      userId: student.id,
      type: DataRequestType.EXPORT,
      channel: DataRequestChannel.WEB_PORTAL,
      requesterEmail: student.email,
      requesterEmailVerifiedAt: new Date(),
      status: DataRequestStatus.PENDING,
      slaDueAt: addDays(new Date(), 15),
      metadata: {
        seededBy: 'prisma/seed.ts',
        scenario: 'pending export request inside SLA',
      },
      job: {
        create: {
          status: DataRequestJobStatus.QUEUED,
          scheduledAt: new Date(),
        },
      },
    },
  })

  const completedDataRequest = await prisma.dataRequest.upsert({
    where: { referenceCode: 'DSR-SEED-COMPLETED-001' },
    update: {},
    create: {
      referenceCode: 'DSR-SEED-COMPLETED-001',
      userId: studentDeletion.id,
      type: DataRequestType.DELETION,
      channel: DataRequestChannel.SUPPORT,
      requesterEmail: studentDeletion.email,
      requesterEmailVerifiedAt: subDays(new Date(), 10),
      status: DataRequestStatus.COMPLETED,
      signedArchiveUrl: 'https://downloads.corgly.example/dsr/DSR-SEED-COMPLETED-001.zip?signature=seed',
      signedArchiveSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      signedArchiveExpiresAt: addDays(new Date(), 7),
      slaDueAt: addDays(new Date(), 20),
      completedAt: subDays(new Date(), 1),
      metadata: {
        seededBy: 'prisma/seed.ts',
        scenario: 'completed deletion request with signed archive',
      },
      job: {
        create: {
          status: DataRequestJobStatus.SUCCEEDED,
          attempts: 1,
          scheduledAt: subDays(new Date(), 2),
          startedAt: subDays(new Date(), 2),
          finishedAt: subDays(new Date(), 1),
        },
      },
    },
  })

  console.log('✅ DataRequest: pendente + concluído com job e arquivo assinado')

  // ─── Job — fila assíncrona genérica para DSR export e transcrição (§12.4.4) ──
  const existingDataExportJob = await prisma.job.findFirst({
    where: {
      type: JobType.DATA_EXPORT,
      queueName: 'privacy.data-export',
      createdById: admin.id,
    },
  })
  if (!existingDataExportJob) {
    await prisma.job.create({
      data: {
        type: JobType.DATA_EXPORT,
        queueName: 'privacy.data-export',
        payload: {
          dataRequestId: pendingDataRequest.id,
          referenceCode: pendingDataRequest.referenceCode,
          requesterEmail: pendingDataRequest.requesterEmail,
          includeSignedArchive: true,
          seededBy: 'prisma/seed.ts',
        },
        status: JobStatus.QUEUED,
        attempts: 0,
        maxAttempts: 5,
        priority: 20,
        scheduledAt: new Date(),
        createdById: admin.id,
      },
    })
  }

  const existingTranscriptionJob = await prisma.job.findFirst({
    where: {
      type: JobType.TRANSCRIPTION,
      queueName: 'media.transcription',
      createdById: admin.id,
    },
  })
  if (!existingTranscriptionJob) {
    await prisma.job.create({
      data: {
        type: JobType.TRANSCRIPTION,
        queueName: 'media.transcription',
        payload: {
          assetId: demoVideo.id,
          language: SupportedLanguage.PT_BR,
          provider: 'seed',
          generateCaptions: true,
          seededBy: 'prisma/seed.ts',
        },
        status: JobStatus.SUCCEEDED,
        attempts: 1,
        maxAttempts: 3,
        priority: 10,
        scheduledAt: subDays(new Date(), 1),
        startedAt: subDays(new Date(), 1),
        completedAt: new Date(),
        createdById: admin.id,
      },
    })
  }

  console.log(`✅ Job: exportação DSR (${pendingDataRequest.referenceCode}) + transcrição (${demoVideo.storageKey}); DSR concluído ${completedDataRequest.referenceCode}`)

  // ─── AdminImpersonationSession — auditoria de suporte com TTL (§12.5) ──
  const activeImpersonation = await prisma.adminImpersonationSession.findFirst({
    where: {
      adminId: admin.id,
      endedAt: null,
    },
  })

  if (!activeImpersonation) {
    await prisma.adminImpersonationSession.create({
      data: {
        adminId: admin.id,
        studentId: student.id,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        reason: 'Seed: suporte reproduzindo problema de acesso à sala virtual do aluno.',
        ipAddress: '127.0.0.1',
        userAgent: 'CorglySeed/1.0 admin-impersonation',
        activeAdminKey: admin.id,
        activeStudentKey: student.id,
        metadata: {
          seededBy: 'prisma/seed.ts',
          scenario: 'active admin impersonation inside TTL',
        },
      },
    })
  }

  const endedImpersonation = await prisma.adminImpersonationSession.findFirst({
    where: {
      adminId: admin.id,
      studentId: studentFirst.id,
      endReason: AdminImpersonationEndReason.ADMIN_ENDED,
    },
  })

  if (!endedImpersonation) {
    const endedStartedAt = subDays(new Date(), 1)
    await prisma.adminImpersonationSession.create({
      data: {
        adminId: admin.id,
        studentId: studentFirst.id,
        startedAt: endedStartedAt,
        expiresAt: new Date(endedStartedAt.getTime() + 20 * 60 * 1000),
        endedAt: new Date(endedStartedAt.getTime() + 12 * 60 * 1000),
        endedById: admin.id,
        endReason: AdminImpersonationEndReason.ADMIN_ENDED,
        reason: 'Seed: suporte validou preferências de onboarding e encerrou a sessão auditável.',
        ipAddress: '127.0.0.1',
        userAgent: 'CorglySeed/1.0 admin-impersonation-ended',
        activeAdminKey: null,
        activeStudentKey: null,
        metadata: {
          seededBy: 'prisma/seed.ts',
          scenario: 'ended admin impersonation with audit trail',
        },
      },
    })
  }

  console.log('✅ AdminImpersonationSession: ativa com TTL + encerrada com motivo e auditoria')

  // ─── EmailTemplate / EmailDelivery — templates versionados + log (§12.4.4) ──
  const emailTemplateSeeds = [
    {
      type: EmailType.CONFIRM_EMAIL,
      locale: SupportedLanguage.PT_BR,
      version: 1,
      subject: 'Confirme seu email na Corgly',
      preheader: 'Seu link de confirmação expira em 24 horas.',
      htmlBody:
        '<p>Olá {{name}},</p><p>Confirme seu email para acessar sua conta Corgly.</p><p><a href="{{confirmUrl}}">Confirmar email</a></p>',
      textBody: 'Olá {{name}}, confirme seu email em {{confirmUrl}}.',
      variables: ['name', 'confirmUrl'],
    },
    {
      type: EmailType.SUBSCRIPTION_PAYMENT_FAILED,
      locale: SupportedLanguage.PT_BR,
      version: 1,
      subject: 'Falha no pagamento da sua assinatura',
      preheader: 'Atualize seu método de pagamento para manter suas aulas ativas.',
      htmlBody:
        '<p>Não conseguimos processar o pagamento da sua assinatura.</p><p><a href="{{billingUrl}}">Atualizar pagamento</a></p>',
      textBody: 'Não conseguimos processar o pagamento. Atualize em {{billingUrl}}.',
      variables: ['billingUrl'],
    },
    {
      type: EmailType.FEEDBACK_AVAILABLE,
      locale: SupportedLanguage.PT_BR,
      version: 1,
      subject: 'Seu feedback de aula está disponível',
      preheader: 'Veja os comentários e próximos passos da sua aula.',
      htmlBody:
        '<p>Olá {{name}},</p><p>Seu feedback da aula de {{sessionDate}} está disponível.</p><p><a href="{{feedbackUrl}}">Ver feedback</a></p>',
      textBody: 'Olá {{name}}, seu feedback da aula de {{sessionDate}} está disponível em {{feedbackUrl}}.',
      variables: ['name', 'sessionDate', 'feedbackUrl'],
    },
  ] as const

  const createdEmailTemplates = new Map<EmailType, { id: string; subject: string; htmlBody: string }>()

  for (const template of emailTemplateSeeds) {
    const upserted = await prisma.emailTemplate.upsert({
      where: {
        type_locale_channel_version: {
          type: template.type,
          locale: template.locale,
          channel: EmailChannel.EMAIL,
          version: template.version,
        },
      },
      update: {
        status: EmailTemplateStatus.ACTIVE,
        subject: template.subject,
        preheader: template.preheader,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
        variables: template.variables,
        publishedAt: new Date(),
        archivedAt: null,
      },
      create: {
        type: template.type,
        locale: template.locale,
        channel: EmailChannel.EMAIL,
        version: template.version,
        status: EmailTemplateStatus.ACTIVE,
        subject: template.subject,
        preheader: template.preheader,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
        variables: template.variables,
        publishedAt: new Date(),
      },
    })
    createdEmailTemplates.set(template.type, {
      id: upserted.id,
      subject: upserted.subject,
      htmlBody: upserted.htmlBody,
    })
  }

  const confirmTemplate = createdEmailTemplates.get(EmailType.CONFIRM_EMAIL)
  const paymentFailedTemplate = createdEmailTemplates.get(EmailType.SUBSCRIPTION_PAYMENT_FAILED)
  const feedbackTemplate = createdEmailTemplates.get(EmailType.FEEDBACK_AVAILABLE)

  const emailDeliverySeeds = [
    {
      providerMessageId: 'seed-email-confirm-001',
      template: confirmTemplate,
      type: EmailType.CONFIRM_EMAIL,
      toEmail: studentFirst.email,
      userId: studentFirst.id,
      status: EmailDeliveryStatus.SENT,
      data: { name: studentFirst.name, confirmUrl: 'https://corgly.example/auth/confirm-email?token=seed' },
      sentAt: subDays(new Date(), 1),
      failedAt: null,
      errorCode: null,
      errorMessage: null,
    },
    {
      providerMessageId: 'seed-email-payment-failed-001',
      template: paymentFailedTemplate,
      type: EmailType.SUBSCRIPTION_PAYMENT_FAILED,
      toEmail: studentSub.email,
      userId: studentSub.id,
      status: EmailDeliveryStatus.FAILED,
      data: { billingUrl: 'https://corgly.example/billing' },
      sentAt: null,
      failedAt: new Date(),
      errorCode: 'PROVIDER_402',
      errorMessage: 'Seed: provider recusou envio de teste',
    },
    {
      providerMessageId: 'seed-email-feedback-available-001',
      template: feedbackTemplate,
      type: EmailType.FEEDBACK_AVAILABLE,
      toEmail: student.email,
      userId: student.id,
      status: EmailDeliveryStatus.SENT,
      data: {
        name: student.name,
        sessionDate: completedSession?.startAt.toISOString() ?? new Date().toISOString(),
        feedbackUrl: 'https://corgly.example/dashboard/feedback',
      },
      sentAt: new Date(),
      failedAt: null,
      errorCode: null,
      errorMessage: null,
    },
  ] as const

  for (const delivery of emailDeliverySeeds) {
    if (!delivery.template) continue
    await prisma.emailDelivery.upsert({
      where: { providerMessageId: delivery.providerMessageId },
      update: {
        templateId: delivery.template.id,
        status: delivery.status,
        data: delivery.data,
        sentAt: delivery.sentAt,
        failedAt: delivery.failedAt,
        errorCode: delivery.errorCode,
        errorMessage: delivery.errorMessage,
      },
      create: {
        templateId: delivery.template.id,
        type: delivery.type,
        locale: SupportedLanguage.PT_BR,
        channel: EmailChannel.EMAIL,
        toEmail: delivery.toEmail,
        userId: delivery.userId,
        provider: 'seed',
        providerMessageId: delivery.providerMessageId,
        status: delivery.status,
        subject: delivery.template.subject,
        renderedHtml: delivery.template.htmlBody,
        data: delivery.data,
        attempts: delivery.status === EmailDeliveryStatus.FAILED ? 3 : 1,
        sentAt: delivery.sentAt,
        failedAt: delivery.failedAt,
        errorCode: delivery.errorCode,
        errorMessage: delivery.errorMessage,
      },
    })
  }

  console.log('✅ EmailTemplate: confirmação, pagamento falho e feedback disponível + deliveries seed')

  // ─── FX multi-moeda — taxas base USD + politica de arredondamento (§12.4.2) ──
  const fxSeedTimestamp = new Date('2026-05-27T00:00:00.000Z')
  const fxValidUntil = addDays(fxSeedTimestamp, 30)
  const fxRates = [
    {
      quoteCurrency: CurrencyCode.USD,
      rate: '1.00000000',
      roundingPolicy: FxRoundingPolicy.HALF_UP,
    },
    {
      quoteCurrency: CurrencyCode.BRL,
      rate: '5.12000000',
      roundingPolicy: FxRoundingPolicy.HALF_UP,
    },
    {
      quoteCurrency: CurrencyCode.EUR,
      rate: '0.92000000',
      roundingPolicy: FxRoundingPolicy.HALF_EVEN,
    },
    {
      quoteCurrency: CurrencyCode.USDC,
      rate: '1.00000000',
      roundingPolicy: FxRoundingPolicy.HALF_UP,
    },
  ] as const

  for (const fx of fxRates) {
    await prisma.fxRate.upsert({
      where: {
        baseCurrency_quoteCurrency_source_validFrom: {
          baseCurrency: CurrencyCode.USD,
          quoteCurrency: fx.quoteCurrency,
          source: FxRateSource.SEED,
          validFrom: fxSeedTimestamp,
        },
      },
      update: {
        rate: fx.rate,
        roundingPolicy: fx.roundingPolicy,
        validUntil: fxValidUntil,
        collectedAt: fxSeedTimestamp,
      },
      create: {
        baseCurrency: CurrencyCode.USD,
        quoteCurrency: fx.quoteCurrency,
        rate: fx.rate,
        source: FxRateSource.SEED,
        roundingPolicy: fx.roundingPolicy,
        validFrom: fxSeedTimestamp,
        validUntil: fxValidUntil,
        collectedAt: fxSeedTimestamp,
      },
    })
  }

  console.log('✅ FxRate: USD, BRL, EUR e USDC com timestamp e política de arredondamento')

  // ─── LegalDoc / TermAcceptance: documentos versionados e aceite bloqueante ──
  const legalEffectiveAt = new Date('2026-05-27T00:00:00.000Z')
  const legalDocSeeds = [
    {
      type: LegalDocType.TERMS,
      slug: 'terms-of-use',
      title: 'Termos de Uso Corgly',
      version: '2026.05.27',
      requiresAcceptance: true,
      bodyMarkdown:
        '# Termos de Uso Corgly\n\nAo usar a Corgly, o aluno concorda com as regras de acesso, agendamento, cancelamento, créditos, conduta em aula e uso aceitável da plataforma.',
    },
    {
      type: LegalDocType.PRIVACY,
      slug: 'privacy-policy',
      title: 'Política de Privacidade Corgly',
      version: '2026.05.27',
      requiresAcceptance: true,
      bodyMarkdown:
        '# Política de Privacidade Corgly\n\nExplica as bases legais, categorias de dados pessoais, retenção, direitos LGPD/GDPR, fornecedores essenciais e canais de contato do DPO.',
    },
    {
      type: LegalDocType.COOKIES,
      slug: 'cookies-policy',
      title: 'Política de Cookies Corgly',
      version: '2026.05.27',
      requiresAcceptance: true,
      bodyMarkdown:
        '# Política de Cookies Corgly\n\nDetalha cookies essenciais, analytics e marketing, incluindo finalidade, duração, revogação de consentimento e impacto nas preferências do usuário.',
    },
    {
      type: LegalDocType.DPA,
      slug: 'data-processing-addendum',
      title: 'Data Processing Addendum Corgly',
      version: '2026.05.27',
      requiresAcceptance: false,
      bodyMarkdown:
        '# Data Processing Addendum Corgly\n\nDefine papéis de controlador e operador, subprocessadores, transferências internacionais, medidas técnicas e suporte a incidentes de segurança.',
    },
  ] as const

  const activeLegalDocs = []
  for (const doc of legalDocSeeds) {
    const contentHashSha256 = sha256Hex(doc.bodyMarkdown)
    const legalDoc = await prisma.legalDoc.upsert({
      where: {
        type_locale_version: {
          type: doc.type,
          locale: SupportedLanguage.PT_BR,
          version: doc.version,
        },
      },
      update: {
        status: LegalDocStatus.ACTIVE,
        title: doc.title,
        slug: doc.slug,
        bodyMarkdown: doc.bodyMarkdown,
        contentHashSha256,
        effectiveAt: legalEffectiveAt,
        publishedAt: legalEffectiveAt,
        archivedAt: null,
        requiresAcceptance: doc.requiresAcceptance,
      },
      create: {
        type: doc.type,
        locale: SupportedLanguage.PT_BR,
        version: doc.version,
        status: LegalDocStatus.ACTIVE,
        title: doc.title,
        slug: doc.slug,
        bodyMarkdown: doc.bodyMarkdown,
        contentHashSha256,
        effectiveAt: legalEffectiveAt,
        publishedAt: legalEffectiveAt,
        requiresAcceptance: doc.requiresAcceptance,
      },
    })
    activeLegalDocs.push(legalDoc)
  }

  const acceptanceUsers = [admin, student] as const
  for (const legalDoc of activeLegalDocs.filter((doc) => doc.requiresAcceptance)) {
    for (const user of acceptanceUsers) {
      await prisma.termAcceptance.upsert({
        where: {
          userId_legalDocId: {
            userId: user.id,
            legalDocId: legalDoc.id,
          },
        },
        update: {
          type: legalDoc.type,
          version: legalDoc.version,
          source: LegalAcceptanceSource.ADMIN_IMPORT,
          acceptedAt: legalEffectiveAt,
          metadata: {
            seed: true,
            source: 'prisma/seed.ts',
          },
        },
        create: {
          userId: user.id,
          legalDocId: legalDoc.id,
          type: legalDoc.type,
          version: legalDoc.version,
          source: LegalAcceptanceSource.ADMIN_IMPORT,
          acceptedAt: legalEffectiveAt,
          metadata: {
            seed: true,
            source: 'prisma/seed.ts',
          },
        },
      })
    }
  }

  console.log('✅ LegalDoc: terms, privacy, cookies e DPA ativos + TermAcceptance para usuários seed')

  console.log('🎉 Seed concluído!')
}

main()
  .catch((e) => {
    console.error('❌ Seed falhou:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
