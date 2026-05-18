import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { Save, Loader2, X } from 'lucide-react';

interface Level {
  name: string;
  score: number;
}

interface Dimension {
  key: string;
  name: string;
  weight: number;
  levels: Level[];
}

interface Thresholds {
  high: number;
  medium: number;
}

interface StatisticalConfig {
  dimensions: Dimension[];
  thresholds: Thresholds;
  highIntentKeywords: string[];
  lowIntentKeywords: string[];
}

const StatisticalConfig = () => {
  const [config, setConfig] = useState<StatisticalConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await api.get<StatisticalConfig>('/admin/system-config/statistical');
      if (data) {
        // Ensure keyword arrays exist
        if (!data.highIntentKeywords) data.highIntentKeywords = [];
        if (!data.lowIntentKeywords) data.lowIntentKeywords = [];
        setConfig(data);
      }
    } catch (e) {
      toast.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.post('/admin/system-config/statistical', config);
      toast.success('保存成功');
    } catch (e) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const updateLevel = (dimIndex: number, levelIndex: number, field: keyof Level, value: any) => {
    if (!config) return;
    const newConfig = { ...config };
    newConfig.dimensions[dimIndex].levels[levelIndex] = {
      ...newConfig.dimensions[dimIndex].levels[levelIndex],
      [field]: value
    };
    setConfig(newConfig);
  };

  const updateThreshold = (field: keyof Thresholds, value: number) => {
    if (!config) return;
    const newConfig = { ...config };
    newConfig.thresholds = {
      ...newConfig.thresholds,
      [field]: value
    };
    setConfig(newConfig);
  };

  const handleAddKeyword = (type: 'highIntentKeywords' | 'lowIntentKeywords', keyword: string) => {
    if (!config || !keyword.trim()) return;
    const trimmed = keyword.trim();
    if (config[type].includes(trimmed)) {
      toast.error('该关键词已存在');
      return;
    }
    setConfig({
      ...config,
      [type]: [...config[type], trimmed]
    });
  };

  const handleRemoveKeyword = (type: 'highIntentKeywords' | 'lowIntentKeywords', index: number) => {
    if (!config) return;
    const newKeywords = [...config[type]];
    newKeywords.splice(index, 1);
    setConfig({
      ...config,
      [type]: newKeywords
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="p-8 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-display">统计配置</h1>
          <p className="text-muted-foreground mt-2">
            配置客户意向评分模型及各维度分值
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存配置
        </button>
      </div>

      <div className="space-y-8">
        {/* 意向阈值配置 */}
        <div className="bg-card border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">意向判定标准</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 p-4 rounded-lg border border-white/5">
              <div className="text-sm text-muted-foreground mb-2">高意向</div>
              <div className="flex items-center gap-2">
                <span className="text-sm">总分 ≥</span>
                <input
                  type="number"
                  value={config.thresholds.high}
                  onChange={(e) => updateThreshold('high', parseInt(e.target.value) || 0)}
                  className="w-20 bg-black/20 border border-white/10 rounded px-2 py-1 text-center"
                />
              </div>
            </div>
            <div className="bg-white/5 p-4 rounded-lg border border-white/5">
              <div className="text-sm text-muted-foreground mb-2">中意向</div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{config.thresholds.medium} ≤ 总分 &lt; {config.thresholds.high}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">阈值设定:</span>
                <input
                  type="number"
                  value={config.thresholds.medium}
                  onChange={(e) => updateThreshold('medium', parseInt(e.target.value) || 0)}
                  className="w-20 bg-black/20 border border-white/10 rounded px-2 py-1 text-center text-sm"
                />
              </div>
            </div>
            <div className="bg-white/5 p-4 rounded-lg border border-white/5">
              <div className="text-sm text-muted-foreground mb-2">低意向</div>
              <div className="flex items-center gap-2">
                <span className="text-sm">总分 &lt; {config.thresholds.medium}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 意向关键词配置 */}
        <div className="bg-card border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">意向关键词</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/5 p-4 rounded-lg border border-white/5">
              <div className="text-sm text-muted-foreground mb-4">高意向关键词</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {config.highIntentKeywords.map((kw, i) => (
                  <span key={i} className="bg-primary/20 text-primary px-2 py-1 rounded text-sm flex items-center gap-1">
                    {kw}
                    <button onClick={() => handleRemoveKeyword('highIntentKeywords', i)} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                placeholder="输入关键词后回车添加"
                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddKeyword('highIntentKeywords', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>
            <div className="bg-white/5 p-4 rounded-lg border border-white/5">
              <div className="text-sm text-muted-foreground mb-4">低意向关键词</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {config.lowIntentKeywords.map((kw, i) => (
                  <span key={i} className="bg-destructive/20 text-destructive px-2 py-1 rounded text-sm flex items-center gap-1">
                    {kw}
                    <button onClick={() => handleRemoveKeyword('lowIntentKeywords', i)} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                placeholder="输入关键词后回车添加"
                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddKeyword('lowIntentKeywords', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* 维度评分配置 */}
        <div className="space-y-6">
          {config.dimensions.map((dim, dimIndex) => (
            <div key={dim.key} className="bg-card border border-white/10 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                <h3 className="font-semibold">{dim.name} <span className="text-muted-foreground text-sm font-normal">({dim.weight}%)</span></h3>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap gap-6">
                  {dim.levels.map((level, levelIndex) => (
                    <div key={levelIndex} className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-lg border border-white/5">
                      <span className="font-medium text-sm">{level.name}</span>
                      <input
                        type="number"
                        value={level.score}
                        onChange={(e) => updateLevel(dimIndex, levelIndex, 'score', parseInt(e.target.value) || 0)}
                        className="w-16 bg-black/20 border border-white/10 rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StatisticalConfig;
