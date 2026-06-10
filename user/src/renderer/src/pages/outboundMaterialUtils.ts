type MaterialLike = {
  fileType?: string
  mimeType?: string
  extension?: string
}

export const parseMaterialTags = (value: string): string[] => {
  const seen = new Set<string>()
  return String(value || '')
    .split(/[,，;；\n\r\t]+/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

export const serializeMaterialTags = (tags: string[]): string => {
  const seen = new Set<string>()
  return tags
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
    .join(',')
}

export const isImageMaterial = (material: MaterialLike): boolean => {
  const fileType = String(material.fileType || '').toUpperCase()
  const mimeType = String(material.mimeType || '').toLowerCase()
  const extension = String(material.extension || '').toLowerCase()
  return fileType === 'IMAGE' || mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension)
}

export const buildMaterialDownloadPath = (materialId: string): string => {
  return `/api/user/outbound-materials/${encodeURIComponent(String(materialId || ''))}/download`
}
