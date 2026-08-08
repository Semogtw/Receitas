import { useEffect, useState } from 'react'

interface BlobImageProps {
  alt: string
  load(): Promise<Blob | null>
  className?: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'missing' }
  | { status: 'error' }

export function BlobImage({ alt, load, className }: BlobImageProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null

    const resolve = async () => {
      setState({ status: 'loading' })
      try {
        const blob = await load()
        if (!active) return
        if (!blob) {
          setState({ status: 'missing' })
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setState({ status: 'ready', url: objectUrl })
      } catch {
        if (active) setState({ status: 'error' })
      }
    }

    void resolve()
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [load])

  if (state.status === 'ready') {
    return <img className={className} src={state.url} alt={alt} loading="lazy" decoding="async" />
  }
  if (state.status === 'missing') return <p className="media-image-state">Foto indisponível neste dispositivo.</p>
  if (state.status === 'error') return <p className="media-image-state">Não foi possível carregar a foto agora.</p>
  return <p className="media-image-state" role="status">Carregando foto…</p>
}
