import { MEDIA_MAX_SOURCE_BYTES } from '../media-config'

export function assertAcceptableSourceImage(file: Blob): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('The selected file must be an image')
  }
  if (file.size <= 0) throw new Error('The selected image is empty')
  if (file.size > MEDIA_MAX_SOURCE_BYTES) {
    throw new Error('The selected image is larger than the 25 MiB source limit')
  }
}
