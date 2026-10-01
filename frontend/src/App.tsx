import { Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from './AuthPage';
import MembershipPage from './MembershipPage';

export default function App() {
  return <Routes>
    <Route path="/" element={<AuthPage />} />
    <Route path="/membership" element={<MembershipPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
