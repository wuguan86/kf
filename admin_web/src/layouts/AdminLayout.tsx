import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  Users, 
  Crown, 
  Settings, 
  Coins, 
  CreditCard, 
  LogOut, 
  LayoutDashboard,
  User,
  FileText,
  Shield,
  MessageSquare,
  Ticket,
  PieChart
} from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

const AdminLayout = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ displayName: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('adminUser');
    
    if (!token) {
      navigate('/login');
      return;
    }

    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('adminUser');
    navigate('/login');
  };

  const navItems = [
    { path: '/admin/accounts', label: '管理员', icon: Shield },
    { path: '/admin/users', label: '用户管理', icon: Users },
    { path: '/admin/members', label: '会员管理', icon: Crown },
    { path: '/admin/invitation-codes', label: '邀请码管理', icon: Ticket },
    { path: '/admin/config', label: '会员配置', icon: Settings },
    { path: '/admin/templates', label: '模板管理', icon: FileText },
    { path: '/admin/points', label: '积分管理', icon: Coins },
    { path: '/admin/payment', label: '支付管理', icon: CreditCard },
    { path: '/admin/system', label: '客服配置', icon: MessageSquare },
    { path: '/admin/statistical', label: '统计配置', icon: PieChart },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Toaster position="top-right" theme="dark" />
      
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10 flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold font-display">管理后台</span>
        </div>
        
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <User className="h-4 w-4" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.displayName || 'Admin'}</p>
              <p className="text-xs text-muted-foreground">管理员</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-400/10 w-full transition-colors"
          >
            <LogOut className="h-5 w-5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-black/20">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
