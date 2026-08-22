import { createServerFn } from "@tanstack/react-start";
import { TEST_DESK_EMAIL, TEST_DESK_ID } from "@/lib/desk-login";

const TEST_DESK_PASSWORD = "Test@password";

export const seedTestDeskUser = createServerFn({ method: "POST" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { auth } = await import("@/lib/auth/server");
  const sql = await getSql();
  const existing = await sql<{ id: string }>`
    select id from "user" where lower(email) = ${TEST_DESK_EMAIL} limit 1
  `;
  if (existing[0]) return { ok: true as const, seeded: false };
  const res = await auth.api.signUpEmail({
    body: {
      name: TEST_DESK_ID,
      email: TEST_DESK_EMAIL,
      password: TEST_DESK_PASSWORD,
    },
  });
  return { ok: true as const, seeded: true, user: res.user?.email ?? TEST_DESK_EMAIL };
});
