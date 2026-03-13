import { z } from 'zod';

/** Request OTP — patient provides their email */
export const requestOtpSchema = z.object({
  email: z.string().email({ message: 'Valid email required' }),
});

/** Verify OTP — patient provides email + 6-digit code */
export const verifyOtpSchema = z.object({
  email: z.string().email({ message: 'Valid email required' }),
  otp: z.string().length(6, { message: 'OTP must be 6 digits' }),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
