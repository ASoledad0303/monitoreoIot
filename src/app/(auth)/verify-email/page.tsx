"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Paper, TextField, Button, Typography, Alert, Stack } from "@mui/material";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    setError(null); setMessage(null);
    try {
      const res = await fetch('/api/auth/send-verification-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error reenviando código');
      setMessage('Código reenviado. Revisa tu correo.');
    } catch (e: any) {
      setError(e.message || 'Error inesperado');
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMessage(null); setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Código inválido');
      setMessage('Correo verificado correctamente');
      setTimeout(() => router.push('/login'), 800);
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
          <Typography variant="h5" fontWeight={600}>Verificar correo</Typography>
          <Typography variant="body2" color="text.secondary">Ingresa tu correo y el código que recibiste.</Typography>
          {message && <Alert severity="success">{message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <form onSubmit={onSubmit}>
            <Stack spacing={2}>
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
              <TextField label="Código" value={code} onChange={(e) => setCode(e.target.value)} required fullWidth />
              <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
                {loading ? 'Validando…' : 'Validar'}
              </Button>
              <Button variant="text" onClick={resend} fullWidth sx={{ color: 'text.secondary' }}>
                Reenviar código
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Box>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div />}> 
      <VerifyEmailForm />
    </Suspense>
  );
}