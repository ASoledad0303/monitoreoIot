"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Paper, TextField, Button, Typography, Alert, Stack } from "@mui/material";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error de registro");
      setOk(true);
      setTimeout(() => router.push("/login"), 800);
    } catch (err: any) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

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
          width: 460,
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
              Crear cuenta
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Crea una cuenta para comenzar
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {ok && <Alert severity="success">Cuenta creada, redirigiendo…</Alert>}
          <form onSubmit={onSubmit}>
            <Stack spacing={2.25}>
              <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required fullWidth autoComplete="name" />
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth autoComplete="email" />
              <TextField label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth autoComplete="new-password" />
              <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
                {loading ? "Creando…" : "Registrar"}
              </Button>
              <Button variant="text" onClick={() => router.push("/login")} fullWidth sx={{ color: "text.secondary" }}>
                Ya tengo cuenta
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Box>
  );
}