declare module 'qrcode' {
  export type QRCodeErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H' | 'low' | 'medium' | 'quartile' | 'high'

  export type QRCodeColor = {
    dark?: string
    light?: string
  }

  export type QRCodeToDataURLOptions = {
    width?: number
    margin?: number
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel
    color?: QRCodeColor
  }

  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>

  const QRCode: {
    toDataURL: typeof toDataURL
  }

  export default QRCode
}

