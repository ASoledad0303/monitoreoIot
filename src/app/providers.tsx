"use client";

import React, { createContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import getTheme from "@/theme";

export const ColorModeContext = createContext<{ mode: "light" | "dark"; toggleColorMode: () => void }>({
  mode: "dark",
  toggleColorMode: () => {},
});

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<"light" | "dark">("dark");

  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? (window.localStorage.getItem("themeMode") as "light" | "dark" | null) : null;
      if (stored === "light" || stored === "dark") {
        setMode(stored);
      }
    } catch {}
  }, []);

  const theme = useMemo(() => getTheme(mode), [mode]);

  const value = useMemo(
    () => ({
      mode,
      toggleColorMode: () =>
        setMode((prev) => {
          const next = prev === "light" ? "dark" : "light";
          try {
            if (typeof window !== "undefined") window.localStorage.setItem("themeMode", next);
          } catch {}
          return next;
        }),
    }),
    [mode]
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}