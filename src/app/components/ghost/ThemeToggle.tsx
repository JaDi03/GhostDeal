"use client";

import { useEffect, useState } from "react";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M12 3v1.6M12 19.4V21M4.9 4.9l1.1 1.1M18 18l1.1 1.1M3 12h1.6M19.4 12H21M4.9 19.1L6 18M18 6l1.1-1.1"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 13.2A6.2 6.2 0 0 1 10.8 7 5.4 5.4 0 1 0 17 16.5a6.1 6.1 0 0 1-.5-3.3Z"
      />
    </svg>
  );
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark") setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    try {
      localStorage.setItem("ghostdeal-theme", next);
    } catch {
      /* ignore quota */
    }
  }

  const goingLight = theme === "dark";

  return (
    <button
      type="button"
      className="gdIconBtn"
      onClick={toggle}
      aria-label={goingLight ? "Switch to light theme" : "Switch to dark theme"}
      title={goingLight ? "Light theme" : "Dark theme"}
    >
      {goingLight ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
