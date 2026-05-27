import type {
  User,
  UpsertUser,
  IpVerification,
  InsertIpVerification,
  TrustedPattern,
  GlobalAiRule,
  InsertGlobalAiRule,
  VerificationResult,
  Feedback,
  InsertFeedback,
  PaidSubmission,
  InsertPaidSubmission,
  ExpertRequest,
  SystemSetting,
  SponsorWatch,
  InsertSponsorWatch,
  NotifPrefs,
  SubscriptionAuditLogEntry,
  SupportTicket,
  InsertSupportTicket,
} from "@shared/schema";
import { userRepository } from "./repositories/userRepository";
import { verificationRepository } from "./repositories/verificationRepository";
import { trustedPatternRepository } from "./repositories/trustedPatternRepository";
import { globalAiRuleRepository } from "./repositories/globalAiRuleRepository";
import { settingsRepository } from "./repositories/settingsRepository";
import { ipVerificationRepository } from "./repositories/ipVerificationRepository";
import { feedbackRepository } from "./repositories/feedbackRepository";
import { supportTicketRepository } from "./repositories/supportTicketRepository";
import { paidSubmissionRepository } from "./repositories/paidSubmissionRepository";
import { expertRequestRepository } from "./repositories/expertRequestRepository";
import { sponsorWatchRepository } from "./repositories/sponsorWatchRepository";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserVerificationCode(identifier: string, code: string, expiry: Date): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
  verifyUser(identifier: string): Promise<User | undefined>;
  updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string): Promise<User>;
  updateUserSubscription(userId: string, data: { subscriptionStatus: string; stripeSubscriptionId?: string | null; stripeCustomerId?: string }): Promise<User>;
  updateUserStripeCustomer(userId: string, customerId: string): Promise<User>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  addCredits(userId: string, amount: number): Promise<User>;
  deductCredits(userId: string, amount: number): Promise<User>;
  getCredits(userId: string): Promise<number>;
  updateDailyVerificationUsage(userId: string): Promise<User>;
  checkDailyLimit(userId: string): Promise<boolean>;
  updateUserVerificationLimit(userId: string, limit: number | null): Promise<User | undefined>;
  updateCosCheckApproval(userId: string, approved: boolean): Promise<void>;
  updateIpExempt(userId: string, exempt: boolean): Promise<void>;
  updateCosCheckSubscription(userId: string, active: boolean): Promise<void>;
  updateCosBeta(userId: string, enabled: boolean, limit: number | null): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  getSystemSetting(key: string): Promise<string | null>;
  setSystemSetting(key: string, value: string): Promise<void>;
  getAllSystemSettings(): Promise<SystemSetting[]>;
  createExpertRequest(userId: string, stripeSessionId?: string): Promise<number>;
  getIpVerification(hashedIp: string): Promise<IpVerification | undefined>;
  upsertIpVerification(data: InsertIpVerification): Promise<IpVerification>;
  getTrustedPatterns(): Promise<TrustedPattern[]>;
  createTrustedPattern(filename: string, metadata: any, patterns: any, aiInstructions?: string): Promise<number>;
  updateTrustedPatternInstructions(id: number, aiInstructions: string): Promise<void>;
  deleteTrustedPattern(id: number): Promise<void>;
  getGlobalAiRules(): Promise<GlobalAiRule[]>;
  getActiveGlobalAiRules(): Promise<GlobalAiRule[]>;
  createGlobalAiRule(data: InsertGlobalAiRule): Promise<GlobalAiRule>;
  updateGlobalAiRule(id: number, data: Partial<InsertGlobalAiRule>): Promise<GlobalAiRule>;
  deleteGlobalAiRule(id: number): Promise<void>;
  toggleGlobalAiRule(id: number, isActive: boolean): Promise<void>;
  createVerificationResult(filename: string, result: string, confidence: number, metadata: any, analysisDetails: any, ipAddress?: string, userId?: string, receiptId?: string, documentHash?: string): Promise<number>;
  getVerificationsByUserId(userId: string, limit?: number): Promise<VerificationResult[]>;
  getVerificationByReceiptId(receiptId: string): Promise<VerificationResult | undefined>;
  getAdminFlaggedVerificationByHash(documentHash: string): Promise<VerificationResult | undefined>;
  getRecentActivity(limit?: number): Promise<VerificationResult[]>;
  getVerificationById(id: number): Promise<VerificationResult | undefined>;
  getPaginatedVerificationLogs(options: { page: number; limit: number; status?: string; startDate?: string; endDate?: string; search?: string; period?: string }): Promise<{ data: (VerificationResult & { userEmail?: string | null })[]; total: number; page: number; limit: number; totalPages: number }>;
  getStats(): Promise<{ trustedPatterns: number; verificationsToday: number; totalUsers: number; proUsers: number }>;

  createFeedback(feedbackData: InsertFeedback): Promise<Feedback>;
  getFeedbackStats(): Promise<{ totalFeedback: number; averageRating: number; helpfulCount: number; accuracyBreakdown: { correct: number; incorrect: number; unsure: number }; recentFeedback: Feedback[] }>;
  createSupportTicket(userId: string, data: InsertSupportTicket): Promise<SupportTicket>;
  getUserSupportTickets(userId: string): Promise<SupportTicket[]>;
  getAllSupportTickets(): Promise<SupportTicket[]>;
  replySupportTicket(id: number, adminReply: string): Promise<SupportTicket>;
  createPaidSubmission(data: InsertPaidSubmission): Promise<PaidSubmission>;
  getPaidSubmission(id: number): Promise<PaidSubmission | undefined>;
  getPaidSubmissionBySessionId(sessionId: string): Promise<PaidSubmission | undefined>;
  updatePaidSubmission(id: number, data: Partial<InsertPaidSubmission>): Promise<PaidSubmission>;
  getPendingPaidSubmissions(): Promise<PaidSubmission[]>;
  getAllPaidSubmissions(): Promise<PaidSubmission[]>;
  getAssignedSubmissions(adminId: string): Promise<PaidSubmission[]>;
  getPaginatedUsers(options: { page: number; limit: number; search?: string; paidOnly?: boolean }): Promise<{ data: User[]; total: number; page: number; limit: number; totalPages: number }>;
  updateUserRestriction(userId: string, restricted: boolean, reason?: string): Promise<void>;
  logSubscriptionChange(entry: { userId: string; changedBy?: string; source: "stripe_webhook" | "admin_override" | "system"; previousStatus: string; newStatus: string; reason?: string; metadata?: Record<string, unknown> }): Promise<void>;
  getSubscriptionAuditLog(userId: string, limit?: number): Promise<SubscriptionAuditLogEntry[]>;
  updateVerificationFeedback(id: number, data: { adminStatus: string; adminFeedback?: string | null; adminReviewedBy: string; adminReviewedAt: Date; accuracyScore?: number | null }): Promise<VerificationResult>;
  getAdminFakeKnowledge(limit?: number): Promise<VerificationResult[]>;
  deleteVerificationLog(id: number): Promise<void>;
  getVerificationLogsWithHITL(page: number, limit: number, adminStatus?: string): Promise<{ data: VerificationResult[]; total: number; page: number; limit: number; totalPages: number }>;
  createSponsorWatch(userId: string, data: InsertSponsorWatch): Promise<SponsorWatch>;
  getSponsorWatchesByUserId(userId: string, status?: string): Promise<SponsorWatch[]>;
  getSponsorWatchById(id: string): Promise<SponsorWatch | undefined>;
  cancelSponsorWatch(id: string): Promise<void>;
  getPendingWatchesByCompanyName(companyName: string): Promise<(SponsorWatch & { userEmail: string })[]>;
  markSponsorWatchNotified(id: string): Promise<void>;
  getUserNotifPrefs(userId: string): Promise<NotifPrefs>;
  updateUserNotifPrefs(userId: string, patch: any): Promise<void>;
}

class DatabaseStorage implements IStorage {
  getUser(id: string) { return userRepository.getUser(id); }
  getUserByEmail(email: string) { return userRepository.getUserByEmail(email); }
  getUserByPhone(phone: string) { return userRepository.getUserByPhone(phone); }
  getUserByGoogleId(googleId: string) { return userRepository.getUserByGoogleId(googleId); }
  getUserByUsername(username: string) { return userRepository.getUserByUsername(username); }
  upsertUser(user: UpsertUser) { return userRepository.upsertUser(user); }
  updateUserVerificationCode(identifier: string, code: string, expiry: Date) { return userRepository.updateUserVerificationCode(identifier, code, expiry); }
  updateUserPassword(userId: string, hashedPassword: string) { return userRepository.updateUserPassword(userId, hashedPassword); }
  verifyUser(identifier: string) { return userRepository.verifyUser(identifier); }
  updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string) { return userRepository.updateUserStripeInfo(userId, customerId, subscriptionId); }
  updateUserSubscription(userId: string, data: { subscriptionStatus: string; stripeSubscriptionId?: string | null; stripeCustomerId?: string }) { return userRepository.updateUserSubscription(userId, data); }
  updateUserStripeCustomer(userId: string, customerId: string) { return userRepository.updateUserStripeCustomer(userId, customerId); }
  getUserByStripeCustomerId(customerId: string) { return userRepository.getUserByStripeCustomerId(customerId); }
  addCredits(userId: string, amount: number) { return userRepository.addCredits(userId, amount); }
  deductCredits(userId: string, amount: number) { return userRepository.deductCredits(userId, amount); }
  getCredits(userId: string) { return userRepository.getCredits(userId); }
  updateDailyVerificationUsage(userId: string) { return userRepository.updateDailyVerificationUsage(userId); }
  checkDailyLimit(userId: string) { return userRepository.checkDailyLimit(userId, (key) => this.getSystemSetting(key)); }
  updateUserVerificationLimit(userId: string, limit: number | null) { return userRepository.updateUserVerificationLimit(userId, limit); }
  updateCosCheckApproval(userId: string, approved: boolean) { return userRepository.updateCosCheckApproval(userId, approved); }
  updateIpExempt(userId: string, exempt: boolean) { return userRepository.updateIpExempt(userId, exempt); }
  updateCosCheckSubscription(userId: string, active: boolean) { return userRepository.updateCosCheckSubscription(userId, active); }
  updateCosBeta(userId: string, enabled: boolean, limit: number | null) { return userRepository.updateCosBeta(userId, enabled, limit); }
  deleteUser(userId: string) { return userRepository.deleteUser(userId); }
  getPaginatedUsers(options: { page: number; limit: number; search?: string; paidOnly?: boolean }) { return userRepository.getPaginatedUsers(options); }
  updateUserRestriction(userId: string, restricted: boolean, reason?: string) { return userRepository.updateUserRestriction(userId, restricted, reason); }
  logSubscriptionChange(entry: { userId: string; changedBy?: string; source: "stripe_webhook" | "admin_override" | "system"; previousStatus: string; newStatus: string; reason?: string; metadata?: Record<string, unknown> }) { return userRepository.logSubscriptionChange(entry); }
  getSubscriptionAuditLog(userId: string, limit?: number) { return userRepository.getSubscriptionAuditLog(userId, limit); }
  getUserNotifPrefs(userId: string) { return userRepository.getUserNotifPrefs(userId); }
  updateUserNotifPrefs(userId: string, patch: any) { return userRepository.updateUserNotifPrefs(userId, patch); }

  createVerificationResult(filename: string, result: string, confidence: number, metadata: any, analysisDetails: any, ipAddress?: string, userId?: string, receiptId?: string, documentHash?: string) { return verificationRepository.createVerificationResult(filename, result, confidence, metadata, analysisDetails, ipAddress, userId, receiptId, documentHash); }
  getVerificationsByUserId(userId: string, limit?: number) { return verificationRepository.getVerificationsByUserId(userId, limit); }
  getVerificationByReceiptId(receiptId: string) { return verificationRepository.getVerificationByReceiptId(receiptId); }
  getAdminFlaggedVerificationByHash(documentHash: string) { return verificationRepository.getAdminFlaggedVerificationByHash(documentHash); }
  getRecentActivity(limit?: number) { return verificationRepository.getRecentActivity(limit); }
  getVerificationById(id: number) { return verificationRepository.getVerificationById(id); }
  getPaginatedVerificationLogs(options: { page: number; limit: number; status?: string; startDate?: string; endDate?: string; search?: string; period?: string }) { return verificationRepository.getPaginatedVerificationLogs(options); }
  getStats() { return verificationRepository.getStats(); }
  updateVerificationFeedback(id: number, data: { adminStatus: string; adminFeedback?: string | null; adminReviewedBy: string; adminReviewedAt: Date; accuracyScore?: number | null }) { return verificationRepository.updateVerificationFeedback(id, data); }
  getAdminFakeKnowledge(limit?: number) { return verificationRepository.getAdminFakeKnowledge(limit); }
  deleteVerificationLog(id: number) { return verificationRepository.deleteVerificationLog(id); }
  getVerificationLogsWithHITL(page: number, limit: number, adminStatus?: string) { return verificationRepository.getVerificationLogsWithHITL(page, limit, adminStatus); }

  getTrustedPatterns() { return trustedPatternRepository.getTrustedPatterns(); }
  createTrustedPattern(filename: string, metadata: any, patterns: any, aiInstructions?: string) { return trustedPatternRepository.createTrustedPattern(filename, metadata, patterns, aiInstructions); }
  updateTrustedPatternInstructions(id: number, aiInstructions: string) { return trustedPatternRepository.updateTrustedPatternInstructions(id, aiInstructions); }
  deleteTrustedPattern(id: number) { return trustedPatternRepository.deleteTrustedPattern(id); }

  getGlobalAiRules() { return globalAiRuleRepository.getGlobalAiRules(); }
  getActiveGlobalAiRules() { return globalAiRuleRepository.getActiveGlobalAiRules(); }
  createGlobalAiRule(data: InsertGlobalAiRule) { return globalAiRuleRepository.createGlobalAiRule(data); }
  updateGlobalAiRule(id: number, data: Partial<InsertGlobalAiRule>) { return globalAiRuleRepository.updateGlobalAiRule(id, data); }
  deleteGlobalAiRule(id: number) { return globalAiRuleRepository.deleteGlobalAiRule(id); }
  toggleGlobalAiRule(id: number, isActive: boolean) { return globalAiRuleRepository.toggleGlobalAiRule(id, isActive); }

  getSystemSetting(key: string) { return settingsRepository.getSystemSetting(key); }
  setSystemSetting(key: string, value: string) { return settingsRepository.setSystemSetting(key, value); }
  getAllSystemSettings() { return settingsRepository.getAllSystemSettings(); }

  getIpVerification(hashedIp: string) { return ipVerificationRepository.getIpVerification(hashedIp); }
  upsertIpVerification(data: InsertIpVerification) { return ipVerificationRepository.upsertIpVerification(data); }

  createFeedback(feedbackData: InsertFeedback) { return feedbackRepository.createFeedback(feedbackData); }
  getFeedbackStats() { return feedbackRepository.getFeedbackStats(); }

  createSupportTicket(userId: string, data: InsertSupportTicket) { return supportTicketRepository.createSupportTicket(userId, data); }
  getUserSupportTickets(userId: string) { return supportTicketRepository.getUserSupportTickets(userId); }
  getAllSupportTickets() { return supportTicketRepository.getAllSupportTickets(); }
  replySupportTicket(id: number, adminReply: string) { return supportTicketRepository.replySupportTicket(id, adminReply); }

  createPaidSubmission(data: InsertPaidSubmission) { return paidSubmissionRepository.createPaidSubmission(data); }
  getPaidSubmission(id: number) { return paidSubmissionRepository.getPaidSubmission(id); }
  getPaidSubmissionBySessionId(sessionId: string) { return paidSubmissionRepository.getPaidSubmissionBySessionId(sessionId); }
  updatePaidSubmission(id: number, data: Partial<InsertPaidSubmission>) { return paidSubmissionRepository.updatePaidSubmission(id, data); }
  getPendingPaidSubmissions() { return paidSubmissionRepository.getPendingPaidSubmissions(); }
  getAllPaidSubmissions() { return paidSubmissionRepository.getAllPaidSubmissions(); }
  getAssignedSubmissions(adminId: string) { return paidSubmissionRepository.getAssignedSubmissions(adminId); }

  createExpertRequest(userId: string, stripeSessionId?: string) { return expertRequestRepository.createExpertRequest(userId, stripeSessionId); }

  createSponsorWatch(userId: string, data: InsertSponsorWatch) { return sponsorWatchRepository.createSponsorWatch(userId, data); }
  getSponsorWatchesByUserId(userId: string, status?: string) { return sponsorWatchRepository.getSponsorWatchesByUserId(userId, status); }
  getSponsorWatchById(id: string) { return sponsorWatchRepository.getSponsorWatchById(id); }
  cancelSponsorWatch(id: string) { return sponsorWatchRepository.cancelSponsorWatch(id); }
  getPendingWatchesByCompanyName(companyName: string) { return sponsorWatchRepository.getPendingWatchesByCompanyName(companyName); }
  markSponsorWatchNotified(id: string) { return sponsorWatchRepository.markSponsorWatchNotified(id); }
}

export const storage = new DatabaseStorage();
