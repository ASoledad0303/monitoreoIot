'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import MainMenu from '@/components/MainMenu';
import { Box, Paper, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { useTheme } from '@mui/material/styles';
type TelemetryMsg = { vrms?: number; irms?: number; s_apparent_va?: number; ts?: number; device_id?: number };
type WsEnvelope =
  | { topic: 'snapshot'; data: { metrics?: TelemetryMsg; telemetry?: TelemetryMsg } }
  | { topic: 'telemetry'; data: TelemetryMsg }
  | { topic: string; data: any };

type Point = { ts: number; Vrms?: number; Irms?: number; S?: number; device_id?: number };

interface Company {
  id: number;
  name: string;
  code: string | null;
}

interface Device {
  id: number;
  name: string;
  code: string;
  company_id: number;
}

interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  company_id?: number | null;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:5000/ws';
const MAX_POINTS = 180; // ~3 min si llega 1 punto/seg

// helper a nivel módulo
const endsWith = (t: string, suffix: string) => typeof t === 'string' && t.endsWith(suffix);

export default function Page() {
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const { status, latest, series } = useRealtimeTelemetry(WS_URL, selectedDevice ? parseInt(selectedDevice) : undefined);

  const lastVrms = latest?.vrms != null ? latest.vrms.toFixed(2) : '--';
  const lastIrms = latest?.irms != null ? latest.irms.toFixed(3) : '--';
  const lastS = latest?.s_apparent_va != null ? latest.s_apparent_va.toFixed(2) : '--';

  const statusColor = useMemo(() => {
    switch (status) {
      case 'open': return 'bg-emerald-500';
      case 'connecting': return 'bg-amber-500';
      case 'error': return 'bg-rose-500';
      default: return 'bg-zinc-400';
    }
  }, [status]);

  // Cargar usuario y companies al iniciar
  useEffect(() => {
    async function loadInitialData() {
      try {
        const userRes = await fetch("/api/auth/me");
        if (userRes.ok) {
          const userData = await userRes.json();
          setCurrentUser(userData);
          
          // Si es admin, cargar todas las companies
          if (userData.role === "admin") {
            const companiesRes = await fetch("/api/companies");
            if (companiesRes.ok) {
              const companiesData = await companiesRes.json();
              setCompanies(companiesData.companies || []);
            }
          } else {
            // Si es user, solo necesita su company (se filtrará automáticamente)
            if (userData.company_id) {
              setSelectedCompany(userData.company_id.toString());
              const devicesRes = await fetch(`/api/devices?company_id=${userData.company_id}`);
              if (devicesRes.ok) {
                const devicesData = await devicesRes.json();
                setDevices(devicesData.devices || []);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error cargando datos iniciales:", err);
      }
    }
    loadInitialData();
  }, []);

  // Cargar devices cuando cambia la company seleccionada
  useEffect(() => {
    async function loadDevices() {
      if (!selectedCompany) {
        setDevices([]);
        setSelectedDevice("");
        return;
      }
      try {
        const res = await fetch(`/api/devices?company_id=${selectedCompany}`);
        if (res.ok) {
          const data = await res.json();
          setDevices(data.devices || []);
          setSelectedDevice(""); // Reset device selection
        }
      } catch (err) {
        console.error("Error cargando devices:", err);
      }
    }
    loadDevices();
  }, [selectedCompany]);

  const theme = useTheme();
  const axisColor = theme.palette.text.secondary;
  const gridColor = theme.palette.divider;
  const tooltipBg = theme.palette.background.paper;
  const tooltipColor = theme.palette.text.primary;

  return (
    <Box sx={{ minHeight: '100dvh', width: '100%', bgcolor: 'background.default', color: 'text.primary', p: { xs: 3, sm: 4 } }}>
      <Box sx={{ mx: 'auto', maxWidth: 1200, display: 'grid', gap: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <MainMenu />
            <Typography variant="h5" fontWeight={600}>Monitoreo energético — tiempo real (WS)</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span className={`inline-block h-3 w-3 rounded-full ${statusColor}`} />
            <Typography variant="body2" color="text.secondary">WS: {status}</Typography>
          </Box>
        </Box>

        {/* Selectores de Company y Device */}
        {(currentUser?.role === "admin" || currentUser?.company_id) && (
          <Paper sx={{ borderRadius: 3, p: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {currentUser?.role === "admin" && (
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>Company</InputLabel>
                  <Select
                    value={selectedCompany}
                    onChange={(e) => setSelectedCompany(e.target.value)}
                    label="Company"
                  >
                    <MenuItem value="">Todas</MenuItem>
                    {companies.map((company) => (
                      <MenuItem key={company.id} value={company.id.toString()}>
                        {company.name} {company.code && `(${company.code})`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>Dispositivo</InputLabel>
                <Select
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  label="Dispositivo"
                  disabled={!selectedCompany && currentUser?.role === "admin"}
                >
                  <MenuItem value="">Todos</MenuItem>
                  {devices.map((device) => (
                    <MenuItem key={device.id} value={device.id.toString()}>
                      {device.name} {device.code && `(${device.code})`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Paper>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
          <KpiCard title="Vrms" value={`${lastVrms} V`} />
          <KpiCard title="Irms" value={`${lastIrms} A`} />
          <KpiCard title="S (aparente)" value={`${lastS} VA`} />
        </Box>

        <Paper sx={{ borderRadius: 3, p: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Ventana: últimos {MAX_POINTS} puntos</Typography>
          <Box sx={{ height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke={gridColor} />
                <XAxis dataKey="ts" tickFormatter={fmtTime} stroke={axisColor} tick={{ fill: axisColor }} />
                <YAxis yAxisId="left" stroke={axisColor} tick={{ fill: axisColor }} />
                <YAxis yAxisId="right" orientation="right" stroke={axisColor} tick={{ fill: axisColor }} />
                <Tooltip
                  contentStyle={{ background: tooltipBg, border: `1px solid ${gridColor}`, color: tooltipColor }}
                  labelFormatter={(ts) => fmtTime(Number(ts))}
                />
                <Legend />
-                <Line type="monotone" dataKey="Vrms" name="Vrms (V)" yAxisId="left" dot={false} isAnimationActive={false} strokeOpacity={0.9} />
-                <Line type="monotone" dataKey="Irms" name="Irms (A)" yAxisId="right" dot={false} isAnimationActive={false} strokeOpacity={0.9} />
-                <Line type="monotone" dataKey="S"    name="S (VA)"  yAxisId="left" dot={false} isAnimationActive={false} strokeOpacity={0.9} />
+                <Line type="monotone" dataKey="Vrms" name="Vrms (V)" yAxisId="left" dot={false} isAnimationActive={false} strokeOpacity={0.9} stroke={theme.palette.primary.main} />
+                <Line type="monotone" dataKey="Irms" name="Irms (A)" yAxisId="right" dot={false} isAnimationActive={false} strokeOpacity={0.9} stroke={theme.palette.secondary.main} />
+                <Line type="monotone" dataKey="S"    name="S (VA)"  yAxisId="left" dot={false} isAnimationActive={false} strokeOpacity={0.9} stroke={theme.palette.info.main} />
                 </LineChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}

function useRealtimeTelemetry(wsUrl: string, deviceId?: number) {
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [latest, setLatest] = useState<TelemetryMsg | null>(null);
  const [series, setSeries] = useState<Point[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ✅ este ref DEBE estar fuera del useEffect (hook rule)
  const lastRef = useRef<{ ts?: number; vrms?: number; irms?: number; S?: number }>({});

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
    };

    const backoff = () => {
      retryRef.current = Math.min(retryRef.current + 1, 6);
      const delay = Math.min(30000, 1000 * Math.pow(2, retryRef.current));
      setTimeout(() => !cancelled && connect(), delay);
    };

    const connect = () => {
      setStatus('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setStatus('open');
        retryRef.current = 0;
        pingRef.current = setInterval(() => { try { ws.send('ping'); } catch {} }, 25000);
      };

      ws.onmessage = (ev) => {
        if (cancelled) return;
        try {
          const msg: WsEnvelope = JSON.parse(ev.data);

          // 1) snapshot inicial
          if (msg.topic === 'snapshot') {
            const snap = (msg as any).data?.telemetry || (msg as any).data?.metrics;
            // Filtrar por device_id si está seleccionado
            if (deviceId && snap?.device_id !== deviceId) {
              return;
            }
            if (snap?.ts) {
              const p: Point = { ts: snap.ts, Vrms: snap.vrms, Irms: snap.irms, S: snap.s_apparent_va, device_id: snap.device_id };
              lastRef.current = { ts: snap.ts, vrms: snap.vrms, irms: snap.irms, S: snap.s_apparent_va };
              setLatest(snap);
              setSeries((prev) => trimPush(prev, p));
            }
            return;
          }

          // 2) TELEMETRÍA (tema completo o sufijo)
          if (msg.topic === 'telemetry' || endsWith((msg as any).topic, '/telemetry')) {
            const t = (msg as any).data as TelemetryMsg;
            // Filtrar por device_id si está seleccionado
            if (deviceId && t.device_id !== deviceId) {
              return;
            }
            if (t?.ts) {
              const p: Point = { ts: t.ts, Vrms: t.vrms, Irms: t.irms, S: t.s_apparent_va, device_id: t.device_id };
              lastRef.current = { ts: t.ts, vrms: t.vrms, irms: t.irms, S: t.s_apparent_va };
              setLatest(t);
              setSeries((prev) => trimPush(prev, p));
            }
            return;
          }

          // 3) MÉTRICAS INDIVIDUALES
          if (endsWith((msg as any).topic, '/metrics/vrms')) {
            const d = (msg as any).data; // { ts, value, unit }
            lastRef.current.vrms = d?.value;
            lastRef.current.ts = d?.ts ?? lastRef.current.ts;
          } else if (endsWith((msg as any).topic, '/metrics/irms')) {
            const d = (msg as any).data;
            lastRef.current.irms = d?.value;
            lastRef.current.ts = d?.ts ?? lastRef.current.ts;
          } else if (endsWith((msg as any).topic, '/metrics/s_apparent')) {
            const d = (msg as any).data;
            lastRef.current.S = d?.value;
            lastRef.current.ts = d?.ts ?? lastRef.current.ts;
          } else {
            return; // ignoramos otros tópicos (samples/status)
          }

          // reflejar métricas sueltas en la UI
          if (lastRef.current.ts) {
            const t = lastRef.current;
            const ts = t.ts!; // aseguramos tipo number
            setLatest({ vrms: t.vrms, irms: t.irms, s_apparent_va: t.S, ts });
            setSeries((prev) => trimPush(prev, { ts, Vrms: t.vrms, Irms: t.irms, S: t.S }));
          }
        } catch {
          // noop
        }
      };

      ws.onclose = () => { if (!cancelled) { setStatus('closed'); cleanup(); backoff(); } };
      ws.onerror  = () => { if (!cancelled) { setStatus('error');  cleanup(); backoff(); } };
    };

      connect();
      return () => { cancelled = true; cleanup(); };
    }, [wsUrl, deviceId]);

  return { status, latest, series };
}

function trimPush(prev: Point[], p: Point) {
  if (!prev.length) return [p];
  if (prev[prev.length - 1].ts === p.ts) {
    const clone = prev.slice(0, -1); clone.push(p); return clone;
  }
  const out = [...prev, p];
  return out.length > MAX_POINTS ? out.slice(out.length - MAX_POINTS) : out;
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour12: false });

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <Paper sx={{ borderRadius: 3, p: 2 }}>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      <Typography variant="h6" fontWeight={600} sx={{ mt: 0.5 }}>{value}</Typography>
    </Paper>
  );
}
