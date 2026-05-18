import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminLayout from './layouts/AdminLayout';
import Users from './pages/admin/Users';
import Members from './pages/admin/Members';
import MemberConfig from './pages/admin/MemberConfig';
import Templates from './pages/admin/Templates';
import Points from './pages/admin/Points';
import Payment from './pages/admin/Payment';
import AdminAccounts from './pages/admin/AdminAccounts';
import SystemConfig from './pages/admin/SystemConfig';
import StatisticalConfig from './pages/admin/StatisticalConfig';
import InvitationCodes from './pages/admin/InvitationCodes';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        
        {/* Admin Routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<Users />} />
          <Route path="accounts" element={<AdminAccounts />} />
          <Route path="members" element={<Members />} />
          <Route path="invitation-codes" element={<InvitationCodes />} />
          <Route path="config" element={<MemberConfig />} />
          <Route path="templates" element={<Templates />} />
          <Route path="points" element={<Points />} />
          <Route path="payment" element={<Payment />} />
          <Route path="system" element={<SystemConfig />} />
          <Route path="statistical" element={<StatisticalConfig />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
