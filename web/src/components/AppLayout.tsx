import { NavLink, Outlet } from "react-router-dom";

export function AppLayout() {
  return (
    <div className="app">
      <header className="header">
        <nav className="header-nav" aria-label="Main navigation">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `header-nav-link${isActive ? " active" : ""}`}
          >
            Explorer
          </NavLink>
          <NavLink
            to="/runs"
            className={({ isActive }) => `header-nav-link${isActive ? " active" : ""}`}
          >
            Computations
          </NavLink>
          <NavLink
            to="/systems"
            className={({ isActive }) => `header-nav-link${isActive ? " active" : ""}`}
          >
            Systems
          </NavLink>

        </nav>
      </header>
      <Outlet />
    </div>
  );
}
