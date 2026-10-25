import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { RunsPage } from "./pages/RunsPage";
import { SystemsPage } from "./pages/SystemsPage";
import { ExplorerPage } from "./pages/ExplorerPage";

function LegacyFixedPointsRoute() {
  const [search] = useSearchParams();
  const runId = search.get('run');
  return <Navigate replace to={runId ? `/?fixed_points=${encodeURIComponent(runId)}` : '/'} />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<ExplorerPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="fixed-points" element={<LegacyFixedPointsRoute />} />
          <Route path="systems" element={<SystemsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
