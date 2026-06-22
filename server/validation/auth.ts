import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const sendOtpSchema = z.object({
  email: z.string().email("Invalid email format"),
  turnstileToken: z.string().nullish(),
});

export const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email format"),
  code: z.string().length(6, "Verification code must be 6 digits"),
});
