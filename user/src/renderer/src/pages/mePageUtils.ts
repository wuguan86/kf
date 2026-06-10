export const buildAvatarSrc = (backendBaseUrl: string, avatarUrl: string): string => {
  if (!avatarUrl) return ''
  if (avatarUrl.startsWith('http') || avatarUrl.startsWith('blob:')) return avatarUrl
  const baseUrl = String(backendBaseUrl || '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '')
  const path = avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`
  return `${baseUrl}${path}`
}
