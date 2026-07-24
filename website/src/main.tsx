import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type Release = { version: string; installerUrl: string; sha512: string; releaseNotes: string; publishedAt: string | null; fileSize: number | null } | null
const fallback: Release = null
const apiBase = (import.meta.env.VITE_API_BASE_URL || 'https://bot.toutouapp.cn').replace(/\/$/, '')

const App = () => {
  const [release, setRelease] = useState<Release>(fallback)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    fetch(apiBase + '/api/public/desktop-releases/latest').then((response) => response.json()).then((body) => {
      if (body.code === 0) setRelease(body.data)
      else setFailed(true)
    }).catch(() => setFailed(true))
  }, [])
  const isDownload = window.location.pathname.startsWith('/download')
  const download = release?.installerUrl || '#contact'
  if (isDownload) return <DownloadPage release={release} failed={failed} download={download} />
  return <><header><a className="brand" href="/"><span>视</span>视界AI助手</a><nav><a href="#features">核心能力</a><a href="/download">下载客户端</a><a href="#contact">联系我们</a></nav></header><main>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">WINDOWS 桌面客户端</p><h1>视界AI助手</h1><h2>把每一次客户对话，变成下一步行动。</h2><p className="lead">面向服务与销售团队的微信智能协作工具，统一处理会话、知识、客户标签与运营动作。</p><div className="actions"><a className="primary" href={download}>下载 Windows 客户端</a><a className="text-link" href="#features">了解产品能力</a></div><p className="hint">{release ? '当前稳定版 v' + release.version : '客户端版本信息加载中'} · Windows 10/11 x64</p></div><div className="hero-visual"><img src="/product-settings.png" alt="视界AI助手系统设置界面" /></div></section>
    <section id="features" className="feature-band"><p className="eyebrow">围绕对话，而非堆砌工具</p><h2>从接待到跟进，信息始终在同一个工作流中。</h2><div className="feature-grid"><Feature no="01" title="会话协作" text="识别未读消息，集中处理客户会话与回复任务。" /><Feature no="02" title="客户洞察" text="维护客户标签与画像，让销售动作有据可依。" /><Feature no="03" title="知识与素材" text="将资料、知识库与运营素材连接到实际对话。" /></div></section>
    <section className="workflow"><div><p className="eyebrow">稳定且可控</p><h2>更新不打断工作。</h2><p>客户端会在启动后检查安全更新。新版本下载完成后，由你决定何时重启安装；关键安全或兼容性更新会明确说明原因。</p></div><ol><li><b>01</b> 发现新版本</li><li><b>02</b> 后台安全下载</li><li><b>03</b> 重启完成更新</li></ol></section>
    <section id="contact" className="closing"><p className="eyebrow">开始使用</p><h2>让客户沟通更清晰，跟进更及时。</h2><a className="primary" href={download}>下载 Windows 客户端</a><p>{failed ? '版本服务暂不可用，请通过官方客服获取最新安装包。' : '安装包与应用内更新使用同一发布版本。'}</p></section>
  </main><footer><span>© 2026 视界AI助手</span><a href="/privacy.html">隐私政策</a><a href="/terms.html">服务协议</a><span>备案信息待补充</span></footer></>
}
const Feature = ({ no, title, text }: { no: string; title: string; text: string }) => <article><span>{no}</span><h3>{title}</h3><p>{text}</p></article>
const DownloadPage = ({ release, failed, download }: { release: Release; failed: boolean; download: string }) => <><header><a className="brand" href="/"><span>视</span>视界AI助手</a><nav><a href="/">返回首页</a><a href="#contact">客服支持</a></nav></header><main className="download"><p className="eyebrow">WINDOWS 客户端</p><h1>下载视界AI助手</h1><p className="lead">适用于 Windows 10/11 x64。安装包已通过发布服务校验。</p><a className="primary" href={download}>下载稳定版{release ? ' v' + release.version : ''}</a>{release ? <div className="release-info"><div><b>发布日期</b><span>{release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : '待发布'}</span></div><div><b>更新说明</b><span>{release.releaseNotes || '性能与稳定性优化'}</span></div><div><b>SHA-512</b><code>{release.sha512 || '发布后显示'}</code></div></div> : <p id="contact">{failed ? '暂时无法读取版本信息，请联系官方客服获取安装包。' : '正在读取最新版本信息...'}</p>}</main><footer><span>© 2026 视界AI助手</span><a href="/privacy.html">隐私政策</a><a href="/terms.html">服务协议</a></footer></>
createRoot(document.getElementById('root')!).render(<App />)
