import { Lucia } from "lucia";
import { MySQLAdapter } from "@lucia-auth/adapter-mysql";
import { db } from "../db";
import type { User } from "../../drizzle/schema";
import { sessions, users } from "../../drizzle/schema";

// Create Lucia adapter for MySQL
const adapter = new MySQLAdapter(db, {
  user: "users",
  session: "sessions",
});

// Initialize Lucia
export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  },
  getUserAttributes: (attributes) => {
    return {
      id: attributes.id,
      email: attributes.email,
      name: attributes.name,
      role: attributes.role,
      createdAt: attributes.createdAt,
    };
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: Omit<User, "id" | "password">;
  }
}
