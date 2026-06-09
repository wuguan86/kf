const AI_CLEANED_FILE_PREFIX = '清洗-'

export type KnowledgeFileDisplay = {
  displayName: string
  aiCleaned: boolean
}

export function resolveKnowledgeFileDisplay(fileName: string): KnowledgeFileDisplay {
  const normalizedName = fileName || ''
  if (!normalizedName.startsWith(AI_CLEANED_FILE_PREFIX)) {
    return {
      displayName: normalizedName,
      aiCleaned: false
    }
  }

  const displayName = normalizedName.slice(AI_CLEANED_FILE_PREFIX.length)
  if (!displayName) {
    return {
      displayName: normalizedName,
      aiCleaned: false
    }
  }

  return {
    displayName,
    aiCleaned: true
  }
}
