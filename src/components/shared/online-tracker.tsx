'use client'

import { useEffect } from 'react'
import { setUserStatus } from '@/app/actions/user-status-actions'

export function OnlineTracker() {
  useEffect(() => {
    setUserStatus('online')
  }, [])

  return null
}
