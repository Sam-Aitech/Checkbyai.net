import Twilio from "twilio";

interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export async function sendSMS(phoneNumber: string, message: string): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("[Messaging] BREVO_API_KEY not configured — SMS will not be sent");
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
      console.error(`[Messaging] Brevo SMS API ${response.status}: ${errorText}`);
      return { success: false, error: `Brevo SMS API ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return { success: true, providerMessageId: data.messageId || data.reference || String(data.messageId) };
  } catch (err: any) {
    console.error("[Messaging] SMS send error:", err.message);
    return { success: false, error: err.message || "Unknown SMS send error" };
  }
}

export async function sendWhatsApp(phoneNumber: string, message: string): Promise<SendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken) {
    console.warn("[Messaging] TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not configured — WhatsApp will not be sent");
    return { success: false, error: "Twilio credentials not configured" };
  }
  if (!fromNumber) {
    console.warn("[Messaging] TWILIO_WHATSAPP_NUMBER not configured — WhatsApp will not be sent");
    return { success: false, error: "TWILIO_WHATSAPP_NUMBER not configured" };
  }

  try {
    const client = Twilio(accountSid, authToken);
    const result = await client.messages.create({
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${phoneNumber}`,
      body: message,
    });

    return { success: true, providerMessageId: result.sid };
  } catch (err: any) {
    console.error("[Messaging] WhatsApp send error:", err.message);
    return { success: false, error: err.message || "Unknown WhatsApp send error" };
  }
}
