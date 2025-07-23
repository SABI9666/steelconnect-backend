import nodemailer from 'nodemailer';

// This function sets up the email transporter
async function createTransporter() {
    // For testing, create a free test account on https://ethereal.email/
    let testAccount = await nodemailer.createTestAccount();

    // For production, you would replace this with your real email service provider's details (e.g., SendGrid, Mailgun)
    return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user, // generated ethereal user
            pass: testAccount.pass, // generated ethereal password
        },
    });
}

// This function sends the actual email
export async function sendEmail({ to, subject, html }) {
    try {
        const transporter = await createTransporter();
        const info = await transporter.sendMail({
            from: '"SteelConnect" <noreply@steelconnect.com>',
            to,
            subject,
            html,
        });

        console.log('Message sent: %s', info.messageId);
        // Log the URL to preview the test email in your backend console
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error("Email sending failed:", error);
    }
}