import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TouristHome from "@/pages/TouristHome";
import { initAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/Toaster";

// Code-split heavier routes so the tourist home loads with a minimal bundle.
const Landing = lazy(() => import("@/pages/Landing"));
const Auth = lazy(() => import("@/pages/Auth"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ProviderDashboard = lazy(() => import("@/pages/ProviderDashboard"));
const ExperienceDetail = lazy(() => import("@/pages/ExperienceDetail"));
const ProviderPublic = lazy(() => import("@/pages/ProviderPublic"));

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function App() {
  useEffect(() => initAuth(), []);
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<TouristHome />} />
          <Route path="/e/:id" element={<ExperienceDetail />} />
          <Route path="/p/:id" element={<ProviderPublic />} />
          <Route path="/vender" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/panel" element={<ProviderDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}
