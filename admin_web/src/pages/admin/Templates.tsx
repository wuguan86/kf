import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, FileText, X } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

interface TemplateFormData {
  name: string;
  content: string;
}

const DEFAULT_FORM_DATA: TemplateFormData = {
  name: '',
  content: ''
};

const Templates = () => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(DEFAULT_FORM_DATA);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await api.get<PromptTemplate[]>('/admin/prompt-templates');
      setTemplates(data);
    } catch (error) {
      console.error('Failed to fetch templates', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (template: PromptTemplate) => {
    setEditingId(template.id);
    setFormData({
      name: template.name,
      content: template.content
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      await api.delete(`/admin/prompt-templates/${id}`);
      toast.success('模板已删除');
      fetchTemplates();
    } catch (error) {
      console.error('Failed to delete template', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: TemplateFormData = {
        ...formData
      };
      if (editingId !== null) {
        await api.put(`/admin/prompt-templates/${editingId}`, payload);
        toast.success('模板更新成功');
      } else {
        await api.post('/admin/prompt-templates', payload);
        toast.success('模板创建成功');
      }
      setIsModalOpen(false);
      fetchTemplates();
    } catch (error) {
      console.error('Submit failed', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-display">模板管理</h1>
        <button 
          onClick={handleOpenCreate}
          className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> 添加模板
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <div key={template.id} className="bg-card border border-white/10 rounded-xl p-6 space-y-4 flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    更新于 {new Date(template.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleOpenEdit(template)}
                  className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => handleDelete(template.id)}
                  className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="bg-black/20 rounded-lg p-3 h-32 overflow-hidden text-sm text-muted-foreground relative flex-1">
              <div className="whitespace-pre-wrap break-words">{template.content}</div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>
          </div>
        ))}

        {templates.length === 0 && !loading && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            暂无模板，请添加
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-4xl rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col h-[80vh]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold">{editingId !== null ? '编辑模板' : '添加模板'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 overflow-hidden flex flex-col">
              <div>
                <label className="block text-sm font-medium mb-1">模板名称</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                  placeholder="例如：营销文案"
                />
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                <label className="block text-sm font-medium mb-1">模板内容</label>
                <div className="flex-1 bg-black/20 border border-white/10 rounded-lg overflow-hidden flex flex-col p-4">
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="h-full w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                    placeholder="使用 Markdown 编写，例如：加粗使用 **文字**，换行直接回车"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default Templates;
