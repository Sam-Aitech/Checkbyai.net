import crypto from "crypto";
import { db } from "../db";
import { aiGenerationLogs } from "@shared/schema";
import { createChatCompletion, hasAnyProvider } from "./aiService";

interface HeadlineVariant {
  headline: string;
  subheadline: string;
  emotion: string;
  focus: string;
}

interface RawDigestData {
  snapshotDate: string;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  removedCompanies: string[];
  addedCompanies: string[];
}

interface GenerateResult {
  headline: string;
  variants: HeadlineVariant[];
  model: string;
  validationPassed: boolean;
}

function sanitizeCompanyName(name: string): string {
  return name
    .replace(/[`'"]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .substring(0, 100)
    .trim();
}

function deterministicHeadline(data: RawDigestData): GenerateResult {
  const total = data.addedCount + data.updatedCount + data.removedCount;
  const headline = data.removedCount > 0
    ? `${data.removedCount} sponsor licence${data.removedCount !== 1 ? "s" : ""} revoked today — ${total} total changes detected`
    : `${total} sponsor licence changes detected today across the UK register`;

  const variants: HeadlineVariant[] = [
    {
      headline: `${data.removedCount} Licences Revoked Today`,
      subheadline: `${total} total changes in today's register`,
      emotion: "urgency",
      focus: "removals",
    },
    {
      headline: `${total} Register Changes Detected`,
      subheadline: `${data.addedCount} added, ${data.removedCount} removed today`,
      emotion: "informative",
      focus: "overview",
    },
    {
      headline: `UK Sponsor Register Updated`,
      subheadline: `${data.removedCount} revoked, ${data.updatedCount} changed today`,
      emotion: "neutral",
      focus: "changes",
    },
  ];

  return { headline, variants, model: "deterministic", validationPassed: true };
}

function validateHeadline(variant: HeadlineVariant, data: RawDigestData): boolean {
  if (!variant.headline || variant.headline.length > 100) return false;
  if (!variant.subheadline || variant.subheadline.length > 100) return false;
  if (!variant.emotion || !variant.focus) return false;

  const text = `${variant.headline} ${variant.subheadline}`;
  const numbers = text.match(/\d+/g)?.map(Number) || [];
  const validNums = [data.addedCount, data.updatedCount, data.removedCount, data.addedCount + data.updatedCount + data.removedCount];

  for (const num of numbers) {
    if (num > 0 && !validNums.includes(num)) return false;
  }

  return true;
}

export async function generateHeadline(data: RawDigestData): Promise<GenerateResult> {
  if (!hasAnyProvider()) {
    console.log("[AIDigest] No AI providers configured, using deterministic headline");
    const result = deterministicHeadline(data);
    await logGeneration(data.snapshotDate, result.headline, true, "deterministic");
    return result;
  }

  const safeRemoved = data.removedCompanies.map(sanitizeCompanyName).slice(0, 10);
  const safeAdded = data.addedCompanies.map(sanitizeCompanyName).slice(0, 5);

  const prompt = `You are a UK immigration news headline writer. Generate 3 headline variants for today's UK Home Office Register of Licensed Sponsors update.

DATA:
- Date: ${data.snapshotDate}
- New licences granted: ${data.addedCount}
- Licences updated (upgraded/downgraded/route changes): ${data.updatedCount}
- Licences revoked/removed: ${data.removedCount}
${safeRemoved.length > 0 ? `- Removed companies include: ${safeRemoved.join(", ")}` : ""}
${safeAdded.length > 0 ? `- Newly licensed companies include: ${safeAdded.join(", ")}` : ""}

RULES:
- Each headline must be under 12 words
- Each subheadline must be 6-8 words
- Numbers in headlines MUST match the actual data above exactly
- Do not fabricate sector claims unless evident from company names
- Focus on urgency for visa holders who need to know

Return ONLY valid JSON (no markdown):
[
  {"headline": "...", "subheadline": "...", "emotion": "urgency|informative|neutral", "focus": "removals|additions|overview"},
  {"headline": "...", "subheadline": "...", "emotion": "...", "focus": "..."},
  {"headline": "...", "subheadline": "...", "emotion": "...", "focus": "..."}
]`;

  try {
    const { content, provider } = await createChatCompletion(
      [{ role: "user", content: prompt }],
      { maxTokens: 500 }
    );

    if (!content) throw new Error("Empty response from AI provider");

    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const variants: HeadlineVariant[] = JSON.parse(cleaned);

    if (!Array.isArray(variants) || variants.length < 3) {
      throw new Error(`Expected 3 variants from ${provider}, got ${variants?.length || 0}`);
    }

    const validVariants = variants.slice(0, 3);
    const allValid = validVariants.every((v) => validateHeadline(v, data));

    if (!allValid) {
      console.warn(`[AIDigest] Validation failed for ${provider} variants, using deterministic fallback`);
      const fallback = deterministicHeadline(data);
      await logGeneration(data.snapshotDate, fallback.headline, false, provider, "Validation failed");
      return fallback;
    }

    const headline = validVariants[0].headline;
    console.log(`[AIDigest] Successfully generated headline via ${provider}`);
    await logGeneration(data.snapshotDate, headline, true, provider);

    return {
      headline,
      variants: validVariants,
      model: provider,
      validationPassed: true,
    };
  } catch (err: any) {
    console.error("[AIDigest] AI headline generation failed:", err.message);
    const fallback = deterministicHeadline(data);
    await logGeneration(data.snapshotDate, fallback.headline, false, "fallback", err.message);
    return fallback;
  }
}

async function logGeneration(
  snapshotDate: string,
  headline: string | null,
  validationPassed: boolean,
  modelUsed: string,
  errorDetails?: string
): Promise<void> {
  try {
    await db.insert(aiGenerationLogs).values({
      snapshotDate,
      headlineGenerated: headline,
      validationPassed,
      modelUsed,
      errorDetails: errorDetails || null,
    });
  } catch (err) {
    console.error("[AIDigest] Failed to log generation:", err);
  }
}

export function signDigest(data: Record<string, any>): string {
  const key = process.env.DIGEST_SIGNING_KEY || "default-signing-key";
  return crypto
    .createHmac("sha256", key)
    .update(JSON.stringify(data))
    .digest("hex");
}

export { deterministicHeadline };
export type { RawDigestData, HeadlineVariant, GenerateResult };
