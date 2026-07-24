import { FormEvent, useEffect, useState } from 'react'
import { PauseCircle, RotateCcw, Rocket, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'

type DesktopRelease = {
  id: string; version: string; platform: string; architecture: string; channel: string
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED'; mandatory: boolean; rolloutPercentage: number
  releaseNotes: string; feedUrl: string; installerUrl: string; sha512: string; fileSize: number | null
}

const defaults = { version: '', platform: 'win32', architecture: 'x64', channel: 'stable', mandatory: false, rolloutPercentage: 100, releaseNotes: '', feedUrl: '', installerUrl: '', sha512: '', fileSize: '' }

const DesktopReleases = () => {
  const [releases, setReleases] = useState<DesktopRelease[]>([])
  const [form, setForm] = useState(defaults)
  const [editing, setEditing] = useState<DesktopRelease | null>(null)
  const [open, setOpen] = useState(false)

  const load = async () => {
    try { setReleases((await api.get<DesktopRelease[]>('/admin/desktop-releases')) || []) }
    catch (error) { console.error('加载客户端发布记录失败', error) }
  }
  useEffect(() => { void load() }, [])

  const edit = (release?: DesktopRelease) => {
    setEditing(release || null)
    setForm(release ? { ...release, fileSize: release.fileSize ? String(release.fileSize) : '' } : defaults)
    setOpen(true)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const payload = { ...form, fileSize: form.fileSize ? Number(form.fileSize) : null }
    try {
      if (editing) await api.put('/admin/desktop-releases/' + editing.id, payload)
      else await api.post('/admin/desktop-releases', payload)
      toast.success(editing ? '版本草稿已更新' : '版本草稿已创建')
      setOpen(false); await load()
    } catch (error) { console.error('保存客户端发布记录失败', error) }
  }
  const action = async (release: DesktopRelease, name: 'publish' | 'pause' | 'rollback') => {
    try {
      await api.post('/admin/desktop-releases/' + release.id + '/' + name, {})
      toast.success(name === 'publish' ? '版本已发布' : name === 'pause' ? '版本已暂停' : '已切换到历史版本')
      await load()
    } catch (error) { console.error('修改客户端发布状态失败', error) }
  }
  const change = (key: keyof typeof form, value: string | number | boolean) => setForm({ ...form, [key]: value })

  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">客户端发布</h1><p className="mt-1 text-sm text-muted-foreground">管理 Windows 版本、灰度比例与 CDN 更新源。</p></div><button onClick={() => edit()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" />新建版本</button></div>
    <div className="overflow-hidden rounded-lg border border-white/10 bg-card"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-muted-foreground"><tr><th className="px-5 py-3">版本</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">灰度</th><th className="px-5 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-white/10">
      {releases.length === 0 ? <tr><td colSpan={4} className="px-5 py-12 text-center text-muted-foreground">暂无客户端版本，请先创建草稿。</td></tr> : releases.map((release) => <tr key={release.id}><td className="px-5 py-4"><button onClick={() => edit(release)} className="font-medium hover:text-primary">v{release.version}</button><div className="mt-1 text-xs text-muted-foreground">{release.platform}/{release.architecture} · {release.channel}</div></td><td className="px-5 py-4">{release.status === 'PUBLISHED' ? '已发布' : release.status === 'PAUSED' ? '已暂停' : '草稿'}</td><td className="px-5 py-4">{release.rolloutPercentage}%{release.mandatory ? ' · 强制' : ''}</td><td className="px-5 py-4"><div className="flex justify-end gap-2">{release.status !== 'PUBLISHED' && <button title="发布" onClick={() => void action(release, 'publish')} className="rounded p-2 text-emerald-300 hover:bg-emerald-500/10"><Rocket className="h-4 w-4" /></button>}{release.status === 'PUBLISHED' && <button title="暂停" onClick={() => void action(release, 'pause')} className="rounded p-2 text-amber-300 hover:bg-amber-500/10"><PauseCircle className="h-4 w-4" /></button>}{release.status === 'PAUSED' && <button title="回滚" onClick={() => void action(release, 'rollback')} className="rounded p-2 text-primary hover:bg-primary/10"><RotateCcw className="h-4 w-4" /></button>}</div></td></tr>)}
    </tbody></table></div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"><form onSubmit={save} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-white/10 bg-card p-6"><div className="mb-5 flex justify-between"><div><h2 className="text-lg font-semibold">{editing ? '编辑客户端版本' : '新建客户端版本'}</h2><p className="text-xs text-muted-foreground">发布前请确认 CDN 文件和 SHA-512 已上传完成。</p></div><button title="关闭" type="button" onClick={() => setOpen(false)}><X /></button></div><div className="grid gap-4 md:grid-cols-2">
      <Input label="版本号" value={form.version} required onChange={(value) => change('version', value)} /><Input label="灰度比例" value={String(form.rolloutPercentage)} type="number" required onChange={(value) => change('rolloutPercentage', Number(value))} /><Input label="平台" value={form.platform} required onChange={(value) => change('platform', value)} /><Input label="架构" value={form.architecture} required onChange={(value) => change('architecture', value)} /><Input label="发布通道" value={form.channel} required onChange={(value) => change('channel', value)} /><Input label="安装包字节数" value={form.fileSize} type="number" onChange={(value) => change('fileSize', value)} /><Input label="更新源地址" value={form.feedUrl} onChange={(value) => change('feedUrl', value)} /><Input label="安装包地址" value={form.installerUrl} onChange={(value) => change('installerUrl', value)} /><div className="md:col-span-2"><Input label="SHA-512" value={form.sha512} onChange={(value) => change('sha512', value)} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.mandatory} onChange={(event) => change('mandatory', event.target.checked)} />强制更新</label><label className="md:col-span-2 text-sm">更新说明<textarea className="mt-2 min-h-24 w-full rounded border border-white/10 bg-black/20 p-3" value={form.releaseNotes} onChange={(event) => change('releaseNotes', event.target.value)} /></label>
    </div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="px-4 py-2">取消</button><button className="rounded bg-primary px-4 py-2 text-primary-foreground">保存草稿</button></div></form></div>}
  </div>
}

const Input = ({ label, value, onChange, required, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) => <label className="text-sm">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded border border-white/10 bg-black/20 px-3 py-2" /></label>
export default DesktopReleases
