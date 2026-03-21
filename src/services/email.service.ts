export type EmailType =
  | 'CONFIRM_EMAIL'
  | 'RESET_PASSWORD'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_RESCHEDULED'
  | 'REMINDER_24H'
  | 'REMINDER_1H'
  | 'FEEDBACK_AVAILABLE'
  | 'CREDITS_EXPIRING_30D'
  | 'CREDITS_EXPIRING_7D';

export class EmailService {
  async send(type: EmailType, to: string, data: Record<string, unknown>): Promise<void> {
    // TODO: Implementar via /auto-flow execute
    // Provider: Resend (recommended) or SendGrid/SES
    // Use React Email templates or HTML strings
    console.log(`[EmailService] STUB: send ${type} to ${to}`, data);
  }
}

export const emailService = new EmailService();
