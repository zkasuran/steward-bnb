"use client"

// USE: live off a holding, safely and spot-only. Guard gates a buy; Swipe borrows against a
// position without selling it.
import { GuardCard } from "./guard-card"
import { SwipeCard } from "./swipe-card"

export function UsePanel() {
  return (
    <div className="flex flex-col gap-5">
      <GuardCard />
      <SwipeCard />
    </div>
  )
}
