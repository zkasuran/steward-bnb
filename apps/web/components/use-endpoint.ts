"use client"

// A tiny fetch hook for the panels. It calls a route handler, parses the JSON and surfaces the
// route's own { error } body as an error. A request id guards against an older read landing after
// a newer one (a fast retype of the address).
import { useCallback, useRef, useState } from "react"

export interface Endpoint<T> {
  data: T | null
  error: string | null
  loading: boolean
  call: (url: string) => Promise<void>
  reset: () => void
}

export function useEndpoint<T>(): Endpoint<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  const call = useCallback(async (url: string) => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url, { cache: "no-store" })
      const json = await res.json()
      if (id !== seq.current) return
      if (!res.ok || (json && typeof json === "object" && "error" in json)) {
        setError((json && json.error) || `Request failed (${res.status})`)
        setData(null)
      } else {
        setData(json as T)
      }
    } catch (e) {
      if (id !== seq.current) return
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    seq.current++
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { data, error, loading, call, reset }
}
