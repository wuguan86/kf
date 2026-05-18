import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Loader2 } from 'lucide-react';

interface UserAccount {
  id: string;
  nickname: string;
  avatarUrl: string;
  wechatOpenId: string;
  createdAt: string;
}

const Users = () => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await api.get<UserAccount[]>('/admin/user-accounts');
      setUsers(data || []);
    } catch (error) {
      console.error('Failed to fetch users', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-display">用户管理</h1>
      </div>

      <div className="bg-card border border-white/10 rounded-xl overflow-hidden">
        {loading ? (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : (
            <table className="w-full text-left">
              <thead className="bg-white/5 text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-medium">头像</th>
                  <th className="px-6 py-4 font-medium">昵称</th>
                  <th className="px-6 py-4 font-medium">OpenID</th>
                  <th className="px-6 py-4 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                            暂无用户数据
                        </td>
                    </tr>
                ) : (
                    users.map((user) => (
                      <tr key={user.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.nickname} className="w-8 h-8 rounded-full" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs">
                                    {user.nickname?.[0] || '?'}
                                </div>
                            )}
                        </td>
                        <td className="px-6 py-4 font-medium">{user.nickname || '未命名'}</td>
                        <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{user.wechatOpenId}</td>
                        <td className="px-6 py-4 text-muted-foreground text-sm">{formatDate(user.createdAt)}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
        )}
      </div>
    </div>
  );
};

export default Users;
