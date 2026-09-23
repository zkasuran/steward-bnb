// GROW / Conviction: list the example baskets. Static data from the SDK, so the browser gets
// one source of truth for the theses and their target weights.
import { basket } from "@steward/sdk"
import type { BasketSummaryDTO } from "@/lib/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(): Promise<Response> {
  const baskets: BasketSummaryDTO[] = basket.EXAMPLE_BASKETS.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    weights: Object.entries(b.weights).map(([ticker, weight]) => ({ ticker, weight })),
  }))
  return Response.json({ baskets })
}
