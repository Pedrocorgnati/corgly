import {
  PrismaClient,
  UserRole,
  CreditType,
  SupportedLanguage,
  SessionStatus,
  PaymentStatus,
  SubscriptionStatus,
  ContentType,
} from '@prisma/client'
import bcrypt from 'bcryptjs'
import { addDays, subDays, setHours, setMinutes, setSeconds, startOfDay } from 'date-fns'

const prisma = new PrismaClient()

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
    },
  })
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
      data: { userId: studentSub.id, type: CreditType.MONTHLY, totalCredits: 8, usedCredits: 0, expiresAt: null, reason: 'Seed: créditos mensais studentSub' },
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

  // ─── Feedback para sessão COMPLETED ──────────────────────────────────────
  const completedSession = createdSessions[SessionStatus.COMPLETED]
  if (completedSession) {
    const existingFeedback = await prisma.feedback.findFirst({ where: { sessionId: completedSession.id } })
    if (!existingFeedback) {
      await prisma.feedback.create({
        data: {
          sessionId: completedSession.id,
          clarityScore: 5,
          didacticsScore: 4,
          punctualityScore: 5,
          engagementScore: 5,
          comment: 'Aula excelente! Pedro explicou os tempos verbais com muita clareza. Já me sinto mais confiante.',
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

  console.log('🎉 Seed concluído!')
}

main()
  .catch((e) => {
    console.error('❌ Seed falhou:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
