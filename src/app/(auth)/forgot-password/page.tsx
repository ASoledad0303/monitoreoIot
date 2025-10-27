"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Paper, TextField, Button, Typography, Alert, Stack } from "@mui/material";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMessage(null); setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error solicitando código');
      setMessage('Te enviamos un código. Revisa tu correo.');
      setTimeout(() => router.push(`/reset-password?email=${encodeURIComponent(email)}`), 800);
    } catch (e: any) {
      setError(e.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', p: 2 }}>
      <Paper sx={{ p: 4, width: 420 }}>
        <Stack spacing={2}>
          <Typography variant="h5" fontWeight={600}>Olvidé mi contraseña</Typography>
          <Typography variant="body2" color="text.secondary">Ingresa tu correo para enviarte un código.</Typography>
          {message && <Alert severity="success">{message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <form onSubmit={onSubmit}>
            <Stack spacing={2}>
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
              <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
                {loading ? 'Enviando…' : 'Enviar código'}
              </Button>
              <Button variant="text" onClick={() => router.push('/login')} fullWidth sx={{ color: 'text.secondary' }}>
                Volver al login
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Box>
  );
}