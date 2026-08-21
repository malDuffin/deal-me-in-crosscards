import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { z } from "zod";

const saveSchema = z.object({
  levelId: z.string().min(1).max(64),
  score: z.number().int().min(0).max(100000),
});

export const saveHighScore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into high_scores (user_id, level_id, score)
      values (${context.userId}, ${data.levelId}, ${data.score})
      on conflict (user_id, level_id)
      do update set
        score = greatest(high_scores.score, excluded.score),
        updated_at = now()
    `;
    return { ok: true as const };
  });

export const listMyScores = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ level_id: string; score: number }>`
      select level_id, score from high_scores
      where user_id = ${context.userId}
    `;
  });
