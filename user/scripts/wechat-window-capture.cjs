const normalizeText = (value) => String(value || '').trim().toLowerCase()

const pickWeChatWindowSource = (sources, windowTitle) => {
  const expectedTitle = normalizeText(windowTitle)
  const candidates = Array.isArray(sources) ? sources : []

  const exactMatch = candidates.find((source) => normalizeText(source?.name) === expectedTitle)
  if (exactMatch) {
    return exactMatch
  }

  const fuzzyMatch = candidates.find((source) => {
    const name = normalizeText(source?.name)
    return name.includes('weixin') || name.includes('wechat') || name.includes('微信')
  })
  if (fuzzyMatch) {
    return fuzzyMatch
  }

  return candidates[0] || null
}

module.exports = {
  pickWeChatWindowSource
}
