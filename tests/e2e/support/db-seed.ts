import bcrypt from "bcrypt";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../server/db";
import { storage } from "../../../server/storage";
import { paidSubmissions, sponsorCanonical, users } from "../../../shared/schema";

export const E2E_PASSWORD = "E2ePassw0rd!";

const USER_A_ID = "e2e_user_a";
const USER_B_ID = "e2e_user_b";
const UPLOAD_USER_ID = "e2e_upload_user";
const SPONSOR_FP = "e2e-sponsor-fingerprint";

export const E2E_USERS = {
  userA: { id: USER_A_ID, email: "e2e-user-a@checkbyai.net", password: E2E_PASSWORD },
  userB: { id: USER_B_ID, email: "e2e-user-b@checkbyai.net", password: E2E_PASSWORD },
  uploadUser: { id: UPLOAD_USER_ID, email: "e2e-upload-user@checkbyai.net", password: E2E_PASSWORD },
} as const;

export interface E2ESeedData {
  userAId: string;
  userBId: string;
  uploadUserId: string;
  paidSubmissionId: number;
  sponsorName: string;
}

async function seedUser(id: string, email: string, hashedPassword: string) {
  await storage.upsertUser({
    id,
    email,
    hashedPassword,
    authProvider: "email",
    isVerified: true,
    cosCheckApproved: true,
    subscriptionStatus: "pro",
  });
}

export async function seedE2EData(): Promise<E2ESeedData> {
  const hashedPassword = await bcrypt.hash(E2E_PASSWORD, 10);

  await seedUser(E2E_USERS.userA.id, E2E_USERS.userA.email, hashedPassword);
  await seedUser(E2E_USERS.userB.id, E2E_USERS.userB.email, hashedPassword);
  await seedUser(E2E_USERS.uploadUser.id, E2E_USERS.uploadUser.email, hashedPassword);

  const sponsorName = "E2E Sponsor Services Ltd";
  const today = new Date().toISOString().slice(0, 10);
  const existingSponsor = await db
    .select({ id: sponsorCanonical.id })
    .from(sponsorCanonical)
    .where(eq(sponsorCanonical.fingerprint, SPONSOR_FP))
    .limit(1);
  if (existingSponsor.length === 0) {
    await db.insert(sponsorCanonical).values({
      fingerprint: SPONSOR_FP,
      currentName: sponsorName,
      townCity: "London",
      county: "Greater London",
      typeRating: "A-Rating",
      route: "Skilled Worker",
      status: "ACTIVE",
      firstSeen: today,
      lastSeen: today,
      grantedAt: today,
      consecutiveMisses: 0,
      historicalNames: [],
    });
  }

  const submission = await storage.createPaidSubmission({
    userId: E2E_USERS.userA.id,
    email: E2E_USERS.userA.email,
    packageType: "normal",
    paymentStatus: "paid",
    stripeSessionId: `e2e_session_${Date.now()}`,
    priority: false,
    phoneConsultationRequested: false,
    reviewStatus: "pending",
  });

  return {
    userAId: E2E_USERS.userA.id,
    userBId: E2E_USERS.userB.id,
    uploadUserId: E2E_USERS.uploadUser.id,
    paidSubmissionId: submission.id,
    sponsorName,
  };
}

export async function cleanupE2EData(): Promise<void> {
  await db.delete(paidSubmissions).where(
    inArray(paidSubmissions.userId, [E2E_USERS.userA.id, E2E_USERS.userB.id, E2E_USERS.uploadUser.id]),
  );

  await db.delete(sponsorCanonical).where(eq(sponsorCanonical.fingerprint, SPONSOR_FP));

  await db
    .delete(users)
    .where(inArray(users.id, [E2E_USERS.userA.id, E2E_USERS.userB.id, E2E_USERS.uploadUser.id]));
}
