import { useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { PwaStatusBanner } from './PwaStatusBanner'

export function PwaLifecycle() {
  const updateApprovedRef = useRef(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState(false)
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedReload() {
      // Prompt mode may observe a controlling event from an external tab as
      // well. Never reload this tab unless its user explicitly approved the
      // update through the banner in this instance.
      if (updateApprovedRef.current) window.location.reload()
    },
  })

  const dismiss = () => {
    updateApprovedRef.current = false
    setUpdating(false)
    setUpdateError(false)
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  const applyUpdate = async () => {
    updateApprovedRef.current = true
    setUpdating(true)
    setUpdateError(false)
    try {
      await updateServiceWorker()
    } catch {
      updateApprovedRef.current = false
      setUpdating(false)
      setUpdateError(true)
    }
  }

  return (
    <PwaStatusBanner
      offlineReady={offlineReady}
      needRefresh={needRefresh}
      updating={updating}
      updateError={updateError}
      onUpdate={() => void applyUpdate()}
      onDismiss={dismiss}
    />
  )
}
