import { createContext, useContext, useEffect } from 'react'

export const LiveStatusContext = createContext(null)

export function useReportLive(live) {
  const report = useContext(LiveStatusContext)

  useEffect(() => {
    if (!report || typeof live !== 'boolean') return undefined
    const timer = setTimeout(() => report(live), 0)
    return () => {
      clearTimeout(timer)
      setTimeout(() => report(null), 0)
    }
  }, [live, report])
}
