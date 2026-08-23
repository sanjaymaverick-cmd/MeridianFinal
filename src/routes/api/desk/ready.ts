import { createFileRoute } from "@tanstack/react-router";
import { seedTestDeskUser } from "@/lib/server/seed-test-user";

export const Route = createFileRoute("/api/desk/ready")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { startPaperEngine } = await import("@/lib/server/paper-engine");
          startPaperEngine();
          const r = await seedTestDeskUser();
          return Response.json(r);
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
