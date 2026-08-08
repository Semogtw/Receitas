import type { MediaUploadProcessResult } from './process-media-upload'

export interface MediaUploadDrainResult {
  uploadedCount: number
  stoppedOnFailure: boolean
}

type ProcessNextMediaUpload = () => Promise<MediaUploadProcessResult>

export class MediaUploadRunner {
  private inFlight: Promise<MediaUploadDrainResult> | null = null

  constructor(private readonly processNext: ProcessNextMediaUpload) {}

  drain(): Promise<MediaUploadDrainResult> {
    if (this.inFlight) return this.inFlight

    const run = this.runDrain()
    this.inFlight = run.finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async runDrain(): Promise<MediaUploadDrainResult> {
    let uploadedCount = 0

    while (true) {
      const result = await this.processNext()
      if (result.status === 'idle') {
        return { uploadedCount, stoppedOnFailure: false }
      }
      if (result.status === 'failed') {
        return { uploadedCount, stoppedOnFailure: true }
      }
      uploadedCount += 1
    }
  }
}
