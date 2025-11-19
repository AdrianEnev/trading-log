import { z } from 'zod';

export const UserRole = z.enum(['admin', 'user']);
export type UserRole = z.infer<typeof UserRole>;

export const UserSchema = z.object({
  id: z.string(),
  role: UserRole,
  name: z.string(),
  email: z.string().email(),
});
export type User = z.infer<typeof UserSchema>;
