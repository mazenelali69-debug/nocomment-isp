import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LivePing from "./pages/LivePing";
import PingLiveJabal from "./pages/PingLiveJabal";
import MonitoringGraphying from "./pages/MonitoringGraphying";
import UserManager from "./pages/UserManager";
import TrafficReseller from "./pages/TrafficReseller";

import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

function ProtectedLayout({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
        <Route path="/live-ping" element={<ProtectedLayout><LivePing /></ProtectedLayout>} />
        <Route path="/ping-live-jabal" element={<ProtectedLayout><PingLiveJabal /></ProtectedLayout>} />
        <Route path="/monitoring-graphying" element={<ProtectedLayout><MonitoringGraphying /></ProtectedLayout>} />
        <Route path="/users" element={<ProtectedLayout><UserManager /></ProtectedLayout>} />

        <Route path="/traffic-reseller" element={<ProtectedLayout><TrafficReseller /></ProtectedLayout>} />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}





