import Twilio from "twilio";
import { logger } from "../utils/logger";

interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

let _twilioClient: ReturnType<typeof Twilio> | null = null;

function getTwilioClient(): ReturnType<typeof Twilio> | null {
  if (!_twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return null;
    }
    _twilioClient = Twilio(accountSid, authToken);
  }
  return _twilioClient;
}

export async function sendSMS(phoneNumber: string, message: string): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    logger.warn("[Messaging] BREVO_API_KEY not configured, SMS will not be sent");
    return { success: false, error: "BREVO_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        type: "transactional",
        unicodeEnabled: true,
        sender: "CheckByAI",
        recipient: phoneNumber,
        content: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[Messaging] Brevo SMS API ${response.status}: ${errorText}`);
      return { success: false, error: `Brevo SMS API ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return { success: true, providerMessageId: data.messageId || data.reference || String(data.messageId) };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg }, "[Messaging] SMS send error:");
    return { success: false, error: errMsg || "Unknown SMS send error" };
  }
}

export async function sendWhatsApp(phoneNumber: string, message: string): Promise<SendResult> {
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!fromNumber) {
    logger.warn("[Messaging] TWILIO_WHATSAPP_NUMBER not configured, WhatsApp will not be sent");
    return { success: false, error: "TWILIO_WHATSAPP_NUMBER not configured" };
  }

  const client = getTwilioClient();
  if (!client) {
    logger.warn("[Messaging] TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not configured, WhatsApp will not be sent");
    return { success: false, error: "Twilio credentials not configured" };
  }

  try {
    const result = await client.messages.create({
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${phoneNumber}`,
      body: message,
    });

    return { success: true, providerMessageId: result.sid };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg }, "[Messaging] WhatsApp send error:");
    return { success: false, error: errMsg || "Unknown WhatsApp send error" };
  }
}
