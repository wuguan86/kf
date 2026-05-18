import { ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react';

const Points = () => {
  const transactions = [
    { id: 1, user: 'Alice Smith', type: 'earn', amount: 50, reason: '每日签到', date: '2024-03-10 09:00' },
    { id: 2, user: 'Bob Jones', type: 'spend', amount: 10, reason: '生成图片', date: '2024-03-10 10:30' },
    { id: 3, user: 'Alice Smith', type: 'spend', amount: 20, reason: '高清放大', date: '2024-03-10 11:15' },
    { id: 4, user: 'Charlie Day', type: 'earn', amount: 100, reason: '充值奖励', date: '2024-03-09 15:45' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-display">积分管理</h1>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <div className="bg-card border border-white/10 p-6 rounded-xl">
          <p className="text-sm text-muted-foreground mb-1">总积分池</p>
          <h3 className="text-3xl font-bold text-primary">1,450,000</h3>
        </div>
        <div className="bg-card border border-white/10 p-6 rounded-xl">
          <p className="text-sm text-muted-foreground mb-1">今日发放</p>
          <h3 className="text-3xl font-bold text-green-400">+12,500</h3>
        </div>
        <div className="bg-card border border-white/10 p-6 rounded-xl">
          <p className="text-sm text-muted-foreground mb-1">今日消耗</p>
          <h3 className="text-3xl font-bold text-blue-400">-8,200</h3>
        </div>
      </div>

      <div className="bg-card border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="font-bold">积分流水记录</h3>
          <div className="flex gap-2">
            <select className="bg-black border border-white/10 rounded px-3 py-1.5 text-sm">
              <option>所有类型</option>
              <option>获取</option>
              <option>消耗</option>
            </select>
          </div>
        </div>
        
        <table className="w-full text-left">
          <thead className="bg-white/5 text-muted-foreground">
            <tr>
              <th className="px-6 py-4 font-medium">用户</th>
              <th className="px-6 py-4 font-medium">变动</th>
              <th className="px-6 py-4 font-medium">原因</th>
              <th className="px-6 py-4 font-medium">时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 font-medium">{tx.user}</td>
                <td className="px-6 py-4">
                  <span className={`flex items-center gap-1 ${
                    tx.type === 'earn' ? 'text-green-400' : 'text-blue-400'
                  }`}>
                    {tx.type === 'earn' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    {tx.type === 'earn' ? '+' : '-'}{tx.amount}
                  </span>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{tx.reason}</td>
                <td className="px-6 py-4 text-muted-foreground text-sm flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  {tx.date}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Points;
