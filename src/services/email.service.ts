/**
 * @module services/email.service
 * Serviço de email com 14 templates, provider Resend, i18n e retry automático.
 *
 * Contrato:
 * - Importar EmailType de '@/types/enums' (nunca definir localmente)
 * - EMAIL_OVERRIDE: redirecionar todos os emails em dev/test
 * - Retry: 3 tentativas com backoff exponencial (500ms, 1s, 2s)
 * - Rate limit: máximo 10 envios concorrentes
 */

import { z } from 'zod';
import { EmailType, SupportedLanguage } from '@/types/enums';
import { getCircuitBreaker } from '@/lib/circuit-breaker';

// ── Concurrency limiter (inline, sem dependência p-limit/ESM) ──

type Task<T> = () => Promise<T>;

class Limiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly concurrency: number, private readonly maxQueue = 200) {}

  async run<T>(task: Task<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      if (this.queue.length >= this.maxQueue) {
        throw new Error('Email queue cheia: muitas operações pendentes.');
      }
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const limiter = new Limiter(10);

// ── Email params schema ──

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_EMAIL_TYPES = new Set(Object.values(EmailType));
const VALID_LOCALES = new Set(Object.values(SupportedLanguage));

const SendEmailParamsSchema = z.object({
  to: z.string().refine((v) => EMAIL_REGEX.test(v), { message: 'Endereço de email inválido.' }),
  type: z.string().refine((v) => VALID_EMAIL_TYPES.has(v as EmailType), { message: 'EmailType inválido.' }),
  data: z.record(z.string(), z.unknown()),
  locale: z.string().refine((v) => VALID_LOCALES.has(v as SupportedLanguage), { message: 'Locale inválido.' }).optional(),
});

export type SendEmailParams = {
  to: string;
  type: EmailType;
  data: Record<string, unknown>;
  locale?: SupportedLanguage;
};

// ── Template definitions ──

type TemplateLocaleContent = {
  subject: string;
  html: string;
};

type TemplateRenderer = (
  data: Record<string, unknown>,
  locale: SupportedLanguage,
) => TemplateLocaleContent;

const TEMPLATES: Record<EmailType, TemplateRenderer> = {
  [EmailType.CONFIRM_EMAIL]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Confirme seu email — Corgly',
      EN_US: 'Confirm your email — Corgly',
      ES_ES: 'Confirma tu correo — Corgly',
      IT_IT: 'Conferma la tua email — Corgly',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Olá${data.name ? ` ${data.name}` : ''},</p><p>Clique no link abaixo para confirmar seu email:</p><p><a href="${data.link}">Confirmar email</a></p><p>Este link expira em 24 horas.</p>`,
      EN_US: `<p>Hello${data.name ? ` ${data.name}` : ''},</p><p>Click the link below to confirm your email:</p><p><a href="${data.link}">Confirm email</a></p><p>This link expires in 24 hours.</p>`,
      ES_ES: `<p>Hola${data.name ? ` ${data.name}` : ''},</p><p>Haz clic en el enlace para confirmar tu correo:</p><p><a href="${data.link}">Confirmar correo</a></p><p>Este enlace expira en 24 horas.</p>`,
      IT_IT: `<p>Ciao${data.name ? ` ${data.name}` : ''},</p><p>Clicca il link per confermare la tua email:</p><p><a href="${data.link}">Conferma email</a></p><p>Il link scade in 24 ore.</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.BOOKING_CONFIRMED]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Aula confirmada!',
      EN_US: 'Session confirmed!',
      ES_ES: '¡Sesión confirmada!',
      IT_IT: 'Sessione confermata!',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Sua aula foi confirmada.</p><p><strong>Data:</strong> ${data.date}<br/><strong>Horário:</strong> ${data.time}</p><p><a href="${data.joinLink}">Entrar na aula</a> | <a href="${data.cancelLink}">Cancelar</a></p>`,
      EN_US: `<p>Your session has been confirmed.</p><p><strong>Date:</strong> ${data.date}<br/><strong>Time:</strong> ${data.time}</p><p><a href="${data.joinLink}">Join session</a> | <a href="${data.cancelLink}">Cancel</a></p>`,
      ES_ES: `<p>Tu sesión ha sido confirmada.</p><p><strong>Fecha:</strong> ${data.date}<br/><strong>Hora:</strong> ${data.time}</p><p><a href="${data.joinLink}">Unirse</a> | <a href="${data.cancelLink}">Cancelar</a></p>`,
      IT_IT: `<p>La tua sessione è stata confermata.</p><p><strong>Data:</strong> ${data.date}<br/><strong>Ora:</strong> ${data.time}</p><p><a href="${data.joinLink}">Partecipa</a> | <a href="${data.cancelLink}">Cancella</a></p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.BOOKING_CANCELLED]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Aula cancelada',
      EN_US: 'Session cancelled',
      ES_ES: 'Sesión cancelada',
      IT_IT: 'Sessione cancellata',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Sua aula foi cancelada.</p>${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}<p>Seus créditos foram reembolsados conforme a política de cancelamento.</p>`,
      EN_US: `<p>Your session has been cancelled.</p>${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}<p>Your credits have been refunded per the cancellation policy.</p>`,
      ES_ES: `<p>Tu sesión ha sido cancelada.</p>${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}<p>Tus créditos han sido reembolsados según la política de cancelación.</p>`,
      IT_IT: `<p>La tua sessione è stata cancellata.</p>${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}<p>I tuoi crediti sono stati rimborsati come da policy di cancellazione.</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.BOOKING_REMINDER_24H]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Lembrete: sua aula é amanhã',
      EN_US: 'Reminder: your session is tomorrow',
      ES_ES: 'Recordatorio: tu sesión es mañana',
      IT_IT: 'Promemoria: la tua sessione è domani',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Lembrete: você tem uma aula amanhã às ${data.time}.</p><p><a href="${data.joinLink}">Entrar na aula</a></p>`,
      EN_US: `<p>Reminder: you have a session tomorrow at ${data.time}.</p><p><a href="${data.joinLink}">Join session</a></p>`,
      ES_ES: `<p>Recordatorio: tienes una sesión mañana a las ${data.time}.</p><p><a href="${data.joinLink}">Unirse</a></p>`,
      IT_IT: `<p>Promemoria: hai una sessione domani alle ${data.time}.</p><p><a href="${data.joinLink}">Partecipa</a></p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.BOOKING_REMINDER_1H]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Sua aula começa em 1 hora',
      EN_US: 'Your session starts in 1 hour',
      ES_ES: 'Tu sesión comienza en 1 hora',
      IT_IT: 'La tua sessione inizia in 1 ora',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Sua aula começa em 1 hora às ${data.time}.</p><p><a href="${data.joinLink}">Entrar agora</a></p>`,
      EN_US: `<p>Your session starts in 1 hour at ${data.time}.</p><p><a href="${data.joinLink}">Join now</a></p>`,
      ES_ES: `<p>Tu sesión comienza en 1 hora a las ${data.time}.</p><p><a href="${data.joinLink}">Unirse ahora</a></p>`,
      IT_IT: `<p>La tua sessione inizia in 1 ora alle ${data.time}.</p><p><a href="${data.joinLink}">Partecipa ora</a></p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.PASSWORD_RESET]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Redefinição de senha — Corgly',
      EN_US: 'Password reset — Corgly',
      ES_ES: 'Restablecimiento de contraseña — Corgly',
      IT_IT: 'Reimpostazione password — Corgly',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Você solicitou a redefinição da sua senha.</p><p><a href="${data.link}">Redefinir senha</a></p><p>Este link expira em 1 hora. Se não foi você, ignore este email.</p>`,
      EN_US: `<p>You requested a password reset.</p><p><a href="${data.link}">Reset password</a></p><p>This link expires in 1 hour. If this wasn't you, ignore this email.</p>`,
      ES_ES: `<p>Solicitaste restablecer tu contraseña.</p><p><a href="${data.link}">Restablecer contraseña</a></p><p>Este enlace expira en 1 hora. Si no fuiste tú, ignora este correo.</p>`,
      IT_IT: `<p>Hai richiesto il reset della password.</p><p><a href="${data.link}">Reimposta password</a></p><p>Il link scade in 1 ora. Se non sei stato tu, ignora questa email.</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.CREDIT_EXPIRY_WARNING]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: `${data.credits} crédito(s) expirando em breve`,
      EN_US: `${data.credits} credit(s) expiring soon`,
      ES_ES: `${data.credits} crédito(s) expirando pronto`,
      IT_IT: `${data.credits} credito/i in scadenza`,
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Você tem ${data.credits} crédito(s) que expiram em ${data.expiresIn}.</p><p><a href="${data.useLink}">Usar créditos</a> | <a href="${data.buyLink}">Comprar mais</a></p>`,
      EN_US: `<p>You have ${data.credits} credit(s) expiring in ${data.expiresIn}.</p><p><a href="${data.useLink}">Use credits</a> | <a href="${data.buyLink}">Buy more</a></p>`,
      ES_ES: `<p>Tienes ${data.credits} crédito(s) que expiran en ${data.expiresIn}.</p><p><a href="${data.useLink}">Usar créditos</a> | <a href="${data.buyLink}">Comprar más</a></p>`,
      IT_IT: `<p>Hai ${data.credits} credito/i che scadono in ${data.expiresIn}.</p><p><a href="${data.useLink}">Usa crediti</a> | <a href="${data.buyLink}">Acquista altri</a></p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.PAYMENT_RECEIPT]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: `Comprovante de pagamento — ${data.amount}`,
      EN_US: `Payment receipt — ${data.amount}`,
      ES_ES: `Comprobante de pago — ${data.amount}`,
      IT_IT: `Ricevuta di pagamento — ${data.amount}`,
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Pagamento confirmado!</p><p><strong>Pacote:</strong> ${data.package}<br/><strong>Valor:</strong> ${data.amount}<br/><strong>Créditos:</strong> ${data.credits}</p>`,
      EN_US: `<p>Payment confirmed!</p><p><strong>Package:</strong> ${data.package}<br/><strong>Amount:</strong> ${data.amount}<br/><strong>Credits:</strong> ${data.credits}</p>`,
      ES_ES: `<p>¡Pago confirmado!</p><p><strong>Paquete:</strong> ${data.package}<br/><strong>Monto:</strong> ${data.amount}<br/><strong>Créditos:</strong> ${data.credits}</p>`,
      IT_IT: `<p>Pagamento confermato!</p><p><strong>Pacchetto:</strong> ${data.package}<br/><strong>Importo:</strong> ${data.amount}<br/><strong>Crediti:</strong> ${data.credits}</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.SUBSCRIPTION_CANCELLED]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Assinatura cancelada',
      EN_US: 'Subscription cancelled',
      ES_ES: 'Suscripción cancelada',
      IT_IT: 'Abbonamento cancellato',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Sua assinatura foi cancelada.</p><p>Você pode continuar usando seus créditos restantes até ${data.expiresAt}.</p>`,
      EN_US: `<p>Your subscription has been cancelled.</p><p>You can continue using your remaining credits until ${data.expiresAt}.</p>`,
      ES_ES: `<p>Tu suscripción ha sido cancelada.</p><p>Puedes seguir usando tus créditos restantes hasta ${data.expiresAt}.</p>`,
      IT_IT: `<p>Il tuo abbonamento è stato cancellato.</p><p>Puoi continuare ad usare i crediti rimanenti fino al ${data.expiresAt}.</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.BULK_CANCEL_NOTIFICATION]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Aulas canceladas em lote',
      EN_US: 'Sessions bulk cancelled',
      ES_ES: 'Sesiones canceladas en lote',
      IT_IT: 'Sessioni cancellate in blocco',
    };
    const sessionList = Array.isArray(data.sessions)
      ? (data.sessions as string[]).map((s) => `<li>${s}</li>`).join('')
      : '';
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>As seguintes aulas foram canceladas:</p><ul>${sessionList}</ul>${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}<p>Os créditos foram reembolsados.</p>`,
      EN_US: `<p>The following sessions were cancelled:</p><ul>${sessionList}</ul>${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}<p>Credits have been refunded.</p>`,
      ES_ES: `<p>Las siguientes sesiones fueron canceladas:</p><ul>${sessionList}</ul>${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}<p>Los créditos han sido reembolsados.</p>`,
      IT_IT: `<p>Le seguenti sessioni sono state cancellate:</p><ul>${sessionList}</ul>${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}<p>I crediti sono stati rimborsati.</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  // ── NOTIFICATION-SPEC additions ──

  [EmailType.PURCHASE_CONFIRMED]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: `Compra confirmada — ${data.packageName}`,
      EN_US: `Purchase confirmed — ${data.packageName}`,
      ES_ES: `Compra confirmada — ${data.packageName}`,
      IT_IT: `Acquisto confermato — ${data.packageName}`,
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Sua compra foi confirmada!</p><p><strong>Pacote:</strong> ${data.packageName}<br/><strong>Valor:</strong> ${data.amount}<br/><strong>Créditos adicionados:</strong> ${data.credits}</p>`,
      EN_US: `<p>Your purchase is confirmed!</p><p><strong>Package:</strong> ${data.packageName}<br/><strong>Amount:</strong> ${data.amount}<br/><strong>Credits added:</strong> ${data.credits}</p>`,
      ES_ES: `<p>¡Tu compra ha sido confirmada!</p><p><strong>Paquete:</strong> ${data.packageName}<br/><strong>Monto:</strong> ${data.amount}<br/><strong>Créditos añadidos:</strong> ${data.credits}</p>`,
      IT_IT: `<p>Il tuo acquisto è confermato!</p><p><strong>Pacchetto:</strong> ${data.packageName}<br/><strong>Importo:</strong> ${data.amount}<br/><strong>Crediti aggiunti:</strong> ${data.credits}</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.SUBSCRIPTION_PAYMENT_FAILED]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Falha no pagamento da assinatura',
      EN_US: 'Subscription payment failed',
      ES_ES: 'Fallo en el pago de la suscripción',
      IT_IT: 'Pagamento abbonamento fallito',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Não conseguimos processar o pagamento da sua assinatura.</p><p><a href="${data.updateLink}">Atualizar método de pagamento</a></p><p>Sua assinatura será suspensa se o pagamento não for regularizado.</p>`,
      EN_US: `<p>We couldn't process your subscription payment.</p><p><a href="${data.updateLink}">Update payment method</a></p><p>Your subscription will be suspended if payment is not resolved.</p>`,
      ES_ES: `<p>No pudimos procesar el pago de tu suscripción.</p><p><a href="${data.updateLink}">Actualizar método de pago</a></p><p>Tu suscripción será suspendida si el pago no se regulariza.</p>`,
      IT_IT: `<p>Non siamo riusciti a elaborare il pagamento del tuo abbonamento.</p><p><a href="${data.updateLink}">Aggiorna metodo di pagamento</a></p><p>Il tuo abbonamento verrà sospeso se il pagamento non viene risolto.</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.SESSION_INTERRUPTED]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Sua aula foi interrompida',
      EN_US: 'Your session was interrupted',
      ES_ES: 'Tu sesión fue interrumpida',
      IT_IT: 'La tua sessione è stata interrotta',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Sua aula de ${data.date} foi encerrada de forma inesperada.</p><p>Seu crédito foi preservado. <a href="${data.rescheduleLink}">Reagendar agora</a></p>`,
      EN_US: `<p>Your session on ${data.date} was ended unexpectedly.</p><p>Your credit has been preserved. <a href="${data.rescheduleLink}">Reschedule now</a></p>`,
      ES_ES: `<p>Tu sesión del ${data.date} fue terminada inesperadamente.</p><p>Tu crédito ha sido preservado. <a href="${data.rescheduleLink}">Reagendar ahora</a></p>`,
      IT_IT: `<p>La tua sessione del ${data.date} è stata interrotta inaspettatamente.</p><p>Il tuo credito è stato preservato. <a href="${data.rescheduleLink}">Riprogramma ora</a></p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.RECURRING_BOOKING_FAILED]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Falha ao criar sessão recorrente',
      EN_US: 'Recurring session creation failed',
      ES_ES: 'Error al crear sesión recurrente',
      IT_IT: 'Creazione sessione ricorrente fallita',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Não foi possível criar a aula recorrente para ${data.date}.</p>${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}<p><a href="${data.bookLink}">Agendar manualmente</a></p>`,
      EN_US: `<p>Could not create the recurring session for ${data.date}.</p>${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}<p><a href="${data.bookLink}">Book manually</a></p>`,
      ES_ES: `<p>No se pudo crear la sesión recurrente para ${data.date}.</p>${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}<p><a href="${data.bookLink}">Agendar manualmente</a></p>`,
      IT_IT: `<p>Impossibile creare la sessione ricorrente per ${data.date}.</p>${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}<p><a href="${data.bookLink}">Prenota manualmente</a></p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.ACCOUNT_DELETION_REQUESTED]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Solicitação de exclusão de conta — Corgly',
      EN_US: 'Account deletion requested — Corgly',
      ES_ES: 'Solicitud de eliminación de cuenta — Corgly',
      IT_IT: 'Richiesta di eliminazione account — Corgly',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Recebemos sua solicitação de exclusão de conta.</p><p>Se mudou de ideia, você tem 30 dias para cancelar: <a href="${data.cancelLink}">Cancelar exclusão</a></p><p>Caso não cancele, sua conta será excluída automaticamente após 30 dias.</p>`,
      EN_US: `<p>We received your account deletion request.</p><p>If you changed your mind, you have 30 days to cancel: <a href="${data.cancelLink}">Cancel deletion</a></p><p>If you don't cancel, your account will be deleted after 30 days.</p>`,
      ES_ES: `<p>Recibimos tu solicitud de eliminación de cuenta.</p><p>Si cambiaste de opinión, tienes 30 días para cancelar: <a href="${data.cancelLink}">Cancelar eliminación</a></p><p>Si no cancelas, tu cuenta será eliminada después de 30 días.</p>`,
      IT_IT: `<p>Abbiamo ricevuto la tua richiesta di eliminazione account.</p><p>Se hai cambiato idea, hai 30 giorni per annullare: <a href="${data.cancelLink}">Annulla eliminazione</a></p><p>Se non annulli, il tuo account sarà eliminato dopo 30 giorni.</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  [EmailType.DATA_EXPORT_READY]: (data, locale) => {
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: 'Seus dados estão prontos para download — Corgly',
      EN_US: 'Your data is ready for download — Corgly',
      ES_ES: 'Tus datos están listos para descargar — Corgly',
      IT_IT: 'I tuoi dati sono pronti per il download — Corgly',
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Sua exportação de dados foi concluída.</p><p><a href="${data.downloadLink}">Baixar meus dados</a></p><p>Este link expira em 7 dias.</p>`,
      EN_US: `<p>Your data export is complete.</p><p><a href="${data.downloadLink}">Download my data</a></p><p>This link expires in 7 days.</p>`,
      ES_ES: `<p>Tu exportación de datos está completa.</p><p><a href="${data.downloadLink}">Descargar mis datos</a></p><p>Este enlace expira en 7 días.</p>`,
      IT_IT: `<p>L'esportazione dei tuoi dati è completa.</p><p><a href="${data.downloadLink}">Scarica i miei dati</a></p><p>Questo link scade in 7 giorni.</p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },

  // ST008 — reagendamento aprovado pelo admin
  [EmailType.BOOKING_RESCHEDULED]: (data, locale) => {
    const newDate = new Date(data.newStartAt as string).toLocaleString(
      locale === 'PT_BR' ? 'pt-BR' : locale === 'ES_ES' ? 'es-ES' : locale === 'IT_IT' ? 'it-IT' : 'en-US',
      { dateStyle: 'full', timeStyle: 'short' },
    );
    const subjects: Record<SupportedLanguage, string> = {
      PT_BR: `Sua aula foi reagendada — ${newDate}`,
      EN_US: `Your class has been rescheduled — ${newDate}`,
      ES_ES: `Tu clase fue reprogramada — ${newDate}`,
      IT_IT: `La tua lezione è stata riprogrammata — ${newDate}`,
    };
    const bodies: Record<SupportedLanguage, string> = {
      PT_BR: `<p>Olá, ${data.name}!</p><p>Seu reagendamento foi aprovado.</p><p><strong>Nova data:</strong> ${newDate}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL}/schedule">Ver meu calendário</a></p>`,
      EN_US: `<p>Hi ${data.name},</p><p>Your reschedule request has been approved.</p><p><strong>New date:</strong> ${newDate}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL}/schedule">View my calendar</a></p>`,
      ES_ES: `<p>Hola ${data.name},</p><p>Tu solicitud de reagendamiento fue aprobada.</p><p><strong>Nueva fecha:</strong> ${newDate}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL}/schedule">Ver mi calendario</a></p>`,
      IT_IT: `<p>Ciao ${data.name},</p><p>La tua richiesta di riprogrammazione è stata approvata.</p><p><strong>Nuova data:</strong> ${newDate}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL}/schedule">Vedi il mio calendario</a></p>`,
    };
    return { subject: subjects[locale], html: wrapLayout(bodies[locale]) };
  },
};

// ── Layout wrapper ──

function wrapLayout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb; }
    .logo { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 24px; }
    .content { color: #374151; font-size: 15px; line-height: 1.6; }
    .content a { color: #2563eb; text-decoration: underline; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Corgly</div>
    <div class="content">${body}</div>
    <div class="footer">© ${new Date().getFullYear()} Corgly. All rights reserved.</div>
  </div>
</body>
</html>`;
}

// ── Provider interface ──

interface IEmailProvider {
  send(params: { to: string; subject: string; html: string; from: string }): Promise<void>;
}

// ── Resend provider (fetch-based, sem SDK) ──

const RESEND_TIMEOUT_MS = 10_000; // 10s por request
const resendBreaker = getCircuitBreaker('resend-email', {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 60_000,
});

class ResendProvider implements IEmailProvider {
  constructor(private readonly apiKey: string) {}

  async send(params: { to: string; subject: string; html: string; from: string }): Promise<void> {
    await resendBreaker.execute(async () => {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: params.from,
          to: params.to,
          subject: params.subject,
          html: params.html,
        }),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(`Resend error ${response.status}: ${body?.message ?? 'unknown'}`);
      }
    });
  }
}

// ── EmailService ──

export interface IEmailService {
  send(params: SendEmailParams): Promise<void>;
  renderTemplate(
    type: EmailType,
    data: Record<string, unknown>,
    locale: SupportedLanguage,
  ): TemplateLocaleContent;
}

const DEFAULT_FROM = process.env.EMAIL_FROM ?? 'Corgly <no-reply@corgly.app>';
const RETRY_DELAYS_MS = [500, 1000, 2000] as const;

export class EmailService implements IEmailService {
  private provider: IEmailProvider;

  constructor(provider?: IEmailProvider) {
    if (provider) {
      this.provider = provider;
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Noop provider em dev sem chave configurada
      this.provider = {
        send: async (p) => {
          if (typeof console !== 'undefined') {
            console.info('[EmailService] NOOP — RESEND_API_KEY not set.', {
              to: p.to,
              subject: p.subject,
            });
          }
        },
      };
      return;
    }

    this.provider = new ResendProvider(apiKey);
  }

  renderTemplate(
    type: EmailType,
    data: Record<string, unknown>,
    locale: SupportedLanguage,
  ): TemplateLocaleContent {
    const renderer = TEMPLATES[type];
    return renderer(data, locale);
  }

  async send(params: SendEmailParams): Promise<void> {
    // Validar params
    const parsed = SendEmailParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new Error(`EmailService.send: params inválidos — ${parsed.error.message}`);
    }

    const locale = params.locale ?? SupportedLanguage.EN_US;
    const { subject, html } = this.renderTemplate(params.type, params.data, locale);

    // EMAIL_OVERRIDE: redirecionar em dev/test
    const to = process.env.EMAIL_OVERRIDE ?? params.to;

    await limiter.run(() => this.sendWithRetry({ to, subject, html }));
  }

  private async sendWithRetry(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        await this.provider.send({ ...params, from: DEFAULT_FROM });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    }

    throw lastError ?? new Error('EmailService: falha inesperada no envio.');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const emailService = new EmailService();
