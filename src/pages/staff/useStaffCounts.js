import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'

const COUNTS_POLL_MS = 30000

export default function useStaffCounts() {
  const [counts, setCounts] = useState({ requests: 0, reservations: 0 })

  useEffect(() => {
    let active = true
    const load = async () => {
      const [requests, reservations] = await Promise.all([
        supabase.from('refill_requests').select('request_id', { count: 'exact', head: true }).in('status', ['sent', 'accepted', 'ready']),
        supabase.from('reservations').select('reservation_id', { count: 'exact', head: true }).eq('status', 'pending'),
      ])
      if (!active || requests.error || reservations.error) return
      setCounts({ requests: requests.count || 0, reservations: reservations.count || 0 })
    }

    load()
    const channel = supabase
      .channel('staff-navigation-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refill_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, load)
      .subscribe()
    const poll = setInterval(load, COUNTS_POLL_MS)
    return () => {
      active = false
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [])

  return counts
}
