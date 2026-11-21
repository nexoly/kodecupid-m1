import { z } from 'zod';
import { OTP_LENGTH } from '../constants';

/**
 * `phone` may be a full E.164 number (`+14045550123`) on its own, or a national
 * number plus the ISO country picked in the UI (`countryCode`).
 */
export const otpRequestSchema = z
  .object({
    phone: z.string().trim().min(4, 'Enter your phone number').max(25),
    countryCode: z
      .string()
      .trim()
      .length(2, 'Pick a country')
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .refine((value) => value.phone.startsWith('+') || !!value.countryCode, {
    path: ['countryCode'],
    message: 'Pick a country',
  });

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  challengeId: z.string().min(8).max(80),
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`),
});

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
