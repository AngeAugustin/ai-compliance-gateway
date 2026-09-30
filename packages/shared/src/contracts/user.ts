import { z } from "zod";
import { USER_ROLES } from "../domain/actions.js";

export const CreateUserSchema = z.object({
  email: z.string().email().max(200),
  displayName: z.string().min(1).max(200),
  department: z.string().min(1).max(100),
  role: z.enum(USER_ROLES),
  jurisdiction: z.string().min(2).max(10).default("BJ"),
  password: z.string().min(8).max(200),
  isActive: z.boolean().optional().default(true),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  email: z.string().email().max(200).optional(),
  displayName: z.string().min(1).max(200).optional(),
  department: z.string().min(1).max(100).optional(),
  role: z.enum(USER_ROLES).optional(),
  jurisdiction: z.string().min(2).max(10).optional(),
  password: z.string().min(8).max(200).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export const UserDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  department: z.string(),
  role: z.enum(USER_ROLES),
  jurisdiction: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().datetime().optional(),
});
export type UserDto = z.infer<typeof UserDtoSchema>;
