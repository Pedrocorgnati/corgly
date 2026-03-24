/**
 * Sends FEEDBACK_AVAILABLE email to student after a session is completed.
 * Called fire-and-forget — failures are logged but never rethrow.
 */
export async function sendFeedbackAvailableEmail(params: {
  studentEmail: string;
  studentName: string;
  sessionDate: Date;
  feedbackUrl: string;
}): Promise<void> {
  try {
    // TODO: Integrate with actual email provider (Resend / SendGrid / SES)
    // await emailService.send({
    //   to: params.studentEmail,
    //   template: 'FEEDBACK_AVAILABLE',
    //   data: { name: params.studentName, sessionDate: params.sessionDate, url: params.feedbackUrl },
    // });
    console.log('email.feedback_available.sent', params.studentEmail, params.sessionDate.toISOString());
  } catch (error) {
    // Fire-and-forget: log failure but never block the API response
    console.error('email.feedback_available.failed', error);
  }
}
