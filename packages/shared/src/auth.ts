import { z } from 'zod';

/** Fields of the login form (email and password only; the app has no sign-up). */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').pipe(z.email('Enter a valid email')),
  password: z.string().min(1, 'Enter your password'),
});

export type LoginInput = z.infer<typeof loginSchema>;
