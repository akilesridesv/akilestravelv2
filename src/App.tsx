import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "@/pages/Landing";
import { initAuth } from "@/lib/auth";

// Code-split heavier routes so the landing loads with a minimal bundle.
const Auth = lazy(() => import("@/pages/Auth"));
const ProviderDashboard = lazy(() => import("@/pages/ProviderDashboard"));
const PublicExperience = lazy(() => import("@/pages/PublicExperience"));

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
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/panel" element={<ProviderDashboard />} />
          <Route path="/e/:id" element={<PublicExperience />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
