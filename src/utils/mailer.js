import { Resend } from 'resend';
import { htmlToText } from 'html-to-text';

// Initialize Resend with your API Key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, html }) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'SteelConnect <onboarding@resend.dev>', // You can change this later
      to: [to],
      subject: subject,
      html: html,
      text: htmlToText(html),
    });

    if (error) {
      console.error("Resend email sending failed:", error);
      throw error;
    }

    console.log("Email sent successfully via Resend:", data.id);
    return data;

  } catch (error) {
    console.error("Error in sendEmail function:", error);
    throw new Error("Email could not be sent.");
  }
}