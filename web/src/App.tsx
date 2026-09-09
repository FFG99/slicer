import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { RunsPage } from "./pages/RunsPage";
import { SystemsPage } from "./pages/SystemsPage";
import { ExplorerPage } from "./pages/ExplorerPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<ExplorerPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="systems" element={<SystemsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
