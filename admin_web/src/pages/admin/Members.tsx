import { Crown, Check, X } from 'lucide-react';

const Members = () => {
  const members = [
    { id: 1, name: 'Alice Smith', tier: '高级会员', validUntil: '2026-12-31', status: '活跃' },
    { id: 2, name: 'Bob Jones', tier: '基础会员', validUntil: '2026-06-30', status: '活跃' },
    { id: 3, name: 'Charlie Day', tier: '企业会员', validUntil: '2026-03-15', status: '即将到期' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-display">会员管理</h1>
        <div className="flex gap-2">
          <button className="bg-secondary hover:bg-secondary/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10">
            导出列表
          </button>
          <button className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            添加会员
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <div className="bg-card border border-white/10 p-6 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/20 rounded-lg">
              <Crown className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">高级会员总数</p>
              <h3 className="text-2xl font-bold">1,234</h3>
            </div>
          </div>
        </div>
        <div className="bg-card border border-white/10 p-6 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">活跃订阅</p>
              <h3 className="text-2xl font-bold">89%</h3>
            </div>
          </div>
        </div>
        <div className="bg-card border border-white/10 p-6 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500/20 rounded-lg">
              <X className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">流失率</p>
              <h3 className="text-2xl font-bold">2.4%</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-white/5 text-muted-foreground">
            <tr>
              <th className="px-6 py-4 font-medium">会员姓名</th>
              <th className="px-6 py-4 font-medium">等级</th>
              <th className="px-6 py-4 font-medium">有效期至</th>
              <th className="px-6 py-4 font-medium">状态</th>
              <th className="px-6 py-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {members.map((member) => (
              <tr key={member.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 font-medium">{member.name}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs border ${
                    member.tier === '企业会员' ? 'bg-purple-500/20 text-purple-400 border-purple-500/20' :
                    member.tier === '高级会员' ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' :
                    'bg-gray-500/20 text-gray-400 border-gray-500/20'
                  }`}>
                    {member.tier}
                  </span>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{member.validUntil}</td>
                <td className="px-6 py-4">
                  <span className={`flex items-center gap-1.5 text-sm ${
                    member.status === '活跃' ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      member.status === '活跃' ? 'bg-green-400' : 'bg-yellow-400'
                    }`} />
                    {member.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button className="text-sm text-primary hover:underline">管理</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Members;
