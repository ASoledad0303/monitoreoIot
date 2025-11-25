"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Stack,
  Divider,
} from "@mui/material";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code2FA, setCode2FA] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requires2FA, setRequires2FA] = useState(false);
  const [emailFor2FA, setEmailFor2FA] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error de login");

      // Si requiere 2FA, mostrar formulario de código
      if (data.requires2FA) {
        setRequires2FA(true);
        setEmailFor2FA(data.email || email);
        setPassword(""); // Limpiar contraseña por seguridad
      } else {
        const redirect = searchParams.get("redirect") || "/";
        router.push(redirect);
      }
    } catch (err: any) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailFor2FA, code: code2FA }),
        credentials: "include", // Asegurar que las cookies se incluyan
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Código inválido");

      // Usar window.location.href en lugar de router.push para forzar recarga
      // Esto asegura que la cookie esté disponible cuando el middleware se ejecute
      const redirect = searchParams.get("redirect") || "/";
      window.location.href = redirect;
    } catch (err: any) {
      setError(err.message || "Código inválido o vencido");
      setLoading(false);
    }
  };

  // Si requiere 2FA, mostrar formulario de código
  if (requires2FA) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
          background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
        }}
      >
        <Paper
          sx={{
            p: 4,
            width: 420,
            borderRadius: 3,
            boxShadow: "0 20px 40px rgba(2, 6, 23, 0.08)",
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
          elevation={0}
        >
          <Stack spacing={3}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                }}
              />
              <Typography variant="h6" fontWeight={700}>
                Verificación en dos pasos
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Se ha enviado un código de verificación a{" "}
              <strong>{emailFor2FA}</strong>. Ingresa el código para completar
              el inicio de sesión.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <form onSubmit={onSubmit2FA}>
              <Stack spacing={2.25}>
                <TextField
                  label="Código de verificación"
                  type="text"
                  value={code2FA}
                  onChange={(e) => setCode2FA(e.target.value.toUpperCase())}
                  required
                  fullWidth
                  autoComplete="off"
                  autoFocus
                  inputProps={{
                    maxLength: 6,
                    style: {
                      textAlign: "center",
                      fontSize: "24px",
                      letterSpacing: "8px",
                      fontFamily: "monospace",
                      fontWeight: "bold",
                    },
                  }}
                  placeholder="ABC123"
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading || code2FA.length !== 6}
                  fullWidth
                >
                  {loading ? "Verificando…" : "Verificar código"}
                </Button>
                <Divider />
                <Button
                  variant="text"
                  onClick={() => {
                    setRequires2FA(false);
                    setCode2FA("");
                    setError(null);
                  }}
                  fullWidth
                  sx={{ color: "text.secondary" }}
                >
                  Volver al inicio de sesión
                </Button>
              </Stack>
            </form>
          </Stack>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
      }}
    >
      <Paper
        sx={{
          p: 4,
          width: 420,
          borderRadius: 3,
          boxShadow: "0 20px 40px rgba(2, 6, 23, 0.08)",
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
        elevation={0}
      >
        <Stack spacing={3}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
              }}
            />
            <Typography variant="h6" fontWeight={700}>
              Iniciar sesión
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Accede para ver tu tablero energético
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <form onSubmit={onSubmit}>
            <Stack spacing={2.25}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                autoComplete="email"
              />
              <TextField
                label="Contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                autoComplete="current-password"
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                fullWidth
              >
                {loading ? "Ingresando…" : "Ingresar"}
              </Button>
              <Button
                variant="text"
                onClick={() => router.push("/register")}
                fullWidth
                sx={{ color: "text.secondary" }}
              >
                Crear cuenta
              </Button>
              <Button
                variant="text"
                onClick={() => router.push("/forgot-password")}
                fullWidth
                sx={{ color: "text.secondary" }}
              >
                Olvidé mi contraseña
              </Button>
              {error?.toLowerCase().includes("verificado") && (
                <Button
                  variant="text"
                  onClick={() =>
                    router.push(
                      `/verify-email?email=${encodeURIComponent(email)}`
                    )
                  }
                  fullWidth
                  sx={{ color: "text.secondary" }}
                >
                  Verificar mi correo
                </Button>
              )}
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div />}>
      <LoginForm />
    </Suspense>
  );
}
