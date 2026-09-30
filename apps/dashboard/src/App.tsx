import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./shell";
import { LoginPage } from "./pages/login";
import { OverviewPage } from "./pages/overview";
import { EventsPage } from "./pages/events";
import { PoliciesPage } from "./pages/policies";
import { PolicyFormPage } from "./pages/policy-form";
import { AgentsPage } from "./pages/agents";
import { InspectPage } from "./pages/inspect";
import { ServicesPage } from "./pages/services";
import { ServiceFormPage } from "./pages/service-form";
import { UsersPage } from "./pages/users";
import { UserFormPage } from "./pages/user-form";
import { ProfilePage } from "./pages/profile";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/nouveau" element={<UserFormPage />} />
        <Route path="/users/:id/modifier" element={<UserFormPage />} />
        <Route path="/policies" element={<PoliciesPage />} />
        <Route path="/policies/nouveau" element={<PolicyFormPage />} />
        <Route path="/policies/:id/modifier" element={<PolicyFormPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/services/nouveau" element={<ServiceFormPage />} />
        <Route path="/services/:id/modifier" element={<ServiceFormPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/inspect" element={<InspectPage />} />
        <Route path="/profil" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
