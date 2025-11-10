'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import MainMenu from '@/components/MainMenu';
import { Box, Paper, Typography, FormControl, InputLabel, Select, MenuItem, Grid } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { es } from 'date-fns/locale';
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
  role: "admin" | "user" | "super_admin";
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
  const [dbLatest, setDbLatest] = useState<{ voltaje?: number; corriente?: number; potencia?: number; created_at?: string } | null>(null);
  const [historicalData, setHistoricalData] = useState<Point[]>([]);
  const [timeRange, setTimeRange] = useState<'24h' | 'week' | 'month' | 'custom'>('24h');
  const [customDateFrom, setCustomDateFrom] = useState<Date | null>(null);
  const [customDateTo, setCustomDateTo] = useState<Date | null>(null);
  const { status, latest, series } = useRealtimeTelemetry(WS_URL, selectedDevice ? parseInt(selectedDevice) : undefined);

  // Usar datos de la base de datos si están disponibles, sino usar WebSocket
  // Convertir valores de la BD a números (pueden venir como strings o Decimal)
  const voltaje = dbLatest?.voltaje != null ? parseFloat(String(dbLatest.voltaje)) : null;
  const corriente = dbLatest?.corriente != null ? parseFloat(String(dbLatest.corriente)) : null;
  const potencia = dbLatest?.potencia != null ? parseFloat(String(dbLatest.potencia)) : null;
  
  const lastVrms = voltaje != null ? voltaje.toFixed(2) : (latest?.vrms != null ? latest.vrms.toFixed(2) : '--');
  const lastIrms = corriente != null ? corriente.toFixed(3) : (latest?.irms != null ? latest.irms.toFixed(3) : '--');
  // S (potencia aparente) = V * I
  const lastS = voltaje != null && corriente != null 
    ? (voltaje * corriente).toFixed(2) 
    : (latest?.s_apparent_va != null ? latest.s_apparent_va.toFixed(2) : '--');

  const statusColor = useMemo(() => {
    switch (status) {
      case 'open': return 'bg-emerald-500';
      case 'connecting': return 'bg-amber-500';
      case 'error': return 'bg-rose-500';
      default: return 'bg-zinc-400';
    }
  }, [status]);

  // Helper para parsear JSON de forma segura
  async function safeJsonParse(res: Response) {
    // Verificar si la respuesta es una redirección (3xx) o error del servidor
    if (res.status >= 300 && res.status < 400) {
      const text = await res.text();
      throw new Error(`Redirección detectada (${res.status}). La respuesta puede ser HTML.`);
    }
    
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await res.text();
      // Si parece HTML, mostrar un mensaje más claro
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        throw new Error(`Se recibió HTML en lugar de JSON. Esto puede indicar una redirección a login o un error del servidor. Status: ${res.status}`);
      }
      throw new Error(`Expected JSON but got ${contentType}. Status: ${res.status}. Response: ${text.substring(0, 200)}`);
    }
    return res.json();
  }

  // Cargar automáticamente "Soledad Giménez" y "Dispositivo Principal"
  useEffect(() => {
    async function loadInitialData() {
      try {
        const userRes = await fetch("/api/auth/me");
        if (userRes.ok) {
          try {
            const userData = await safeJsonParse(userRes);
            setCurrentUser(userData);
          } catch (err) {
            console.error("Error parseando respuesta de /api/auth/me:", err);
            // Si no está autenticado, no es un error crítico, solo no cargamos el usuario
          }
        } else if (userRes.status === 401) {
          // Usuario no autenticado, no es un error
          console.log("Usuario no autenticado");
        } else {
          console.error(`Error en /api/auth/me: ${userRes.status}`);
        }

        // Buscar automáticamente la compañía "Soledad Giménez"
        const companiesRes = await fetch("/api/companies");
        if (companiesRes.ok) {
          try {
            const companiesData = await safeJsonParse(companiesRes);
            const soledadCompany = companiesData.companies?.find(
              (c: Company) => c.name === "Soledad Giménez" || c.name.includes("Soledad")
            );
            
            if (soledadCompany) {
              setSelectedCompany(soledadCompany.id.toString());
              
              // Buscar automáticamente el dispositivo "Dispositivo Principal"
              const devicesRes = await fetch(`/api/devices?company_id=${soledadCompany.id}`);
              if (devicesRes.ok) {
                try {
                  const devicesData = await safeJsonParse(devicesRes);
                  const principalDevice = devicesData.devices?.find(
                    (d: Device) => d.name === "Dispositivo Principal" || d.code === "PRINCIPAL"
                  );
                  
                  if (principalDevice) {
                    setSelectedDevice(principalDevice.id.toString());
                  }
                } catch (err) {
                  console.error("Error parseando respuesta de /api/devices:", err);
                }
              } else if (devicesRes.status >= 300 && devicesRes.status < 400) {
                console.error("Redirección detectada en /api/devices. Verifica tu autenticación.");
              } else {
                console.error(`Error en /api/devices: ${devicesRes.status}`);
              }
            }
          } catch (err) {
            console.error("Error parseando respuesta de /api/companies:", err);
          }
        } else if (companiesRes.status >= 300 && companiesRes.status < 400) {
          console.error("Redirección detectada en /api/companies. Verifica tu autenticación.");
        } else {
          console.error(`Error en /api/companies: ${companiesRes.status}`);
        }
      } catch (err) {
        console.error("Error cargando datos iniciales:", err);
      }
    }
    loadInitialData();
  }, []);

  // No necesitamos cargar devices cuando cambia la company porque ya está fijado

  // Calcular fechas según el período seleccionado
  const getDateRange = useMemo(() => {
    const now = new Date();
    let fechaDesde: Date;
    let fechaHasta: Date = now;

    switch (timeRange) {
      case '24h':
        fechaDesde = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        fechaDesde = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        fechaDesde = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        fechaDesde = customDateFrom || new Date(now.getTime() - 24 * 60 * 60 * 1000);
        fechaHasta = customDateTo || now;
        break;
      default:
        fechaDesde = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return {
      desde: fechaDesde.toISOString().split('T')[0],
      hasta: fechaHasta.toISOString().split('T')[0],
    };
  }, [timeRange, customDateFrom, customDateTo]);

  // Cargar últimos datos de telemetría desde la base de datos cuando se selecciona un dispositivo
  useEffect(() => {
    async function loadLatestTelemetry() {
      if (!selectedDevice) {
        setDbLatest(null);
        setHistoricalData([]);
        return;
      }

      try {
        const { desde, hasta } = getDateRange;
        
        const url = `/api/telemetry?device_id=${selectedDevice}&fechaDesde=${desde}&fechaHasta=${hasta}`;
        const res = await fetch(url);
        
        if (res.ok) {
          let data;
          try {
            data = await safeJsonParse(res);
          } catch (err) {
            console.error("Error parseando respuesta de /api/telemetry:", err);
            return;
          }
          if (data.data && data.data.length > 0) {
            // Obtener el primer registro (más reciente, porque está ordenado DESC)
            const latest = data.data[0];
            setDbLatest({
              voltaje: latest.voltaje,
              corriente: latest.corriente,
              potencia: latest.potencia,
              created_at: latest.created_at,
            });

            // Convertir datos históricos a formato Point para el gráfico
            // Muestrear cada 10 segundos para evitar ondas senoidales
            const allPoints: Point[] = data.data
              .map((item: any) => ({
                ts: new Date(item.created_at || item.fecha).getTime(),
                Vrms: item.voltaje ? parseFloat(String(item.voltaje)) : undefined,
                Irms: item.corriente ? parseFloat(String(item.corriente)) : undefined,
                S: item.voltaje && item.corriente 
                  ? parseFloat(String(item.voltaje)) * parseFloat(String(item.corriente))
                  : undefined,
              }))
              .filter((p: Point) => p.Vrms != null || p.Irms != null)
              .reverse(); // Ordenar cronológicamente
            
            // Muestrear según el período seleccionado
            const sampledPoints: Point[] = [];
            // Ventana de muestreo adaptativa según el período
            let windowSize: number;
            switch (timeRange) {
              case '24h':
                windowSize = 60000; // 1 minuto
                break;
              case 'week':
                windowSize = 600000; // 10 minutos
                break;
              case 'month':
                windowSize = 3600000; // 1 hora
                break;
              case 'custom':
                // Calcular ventana basada en el rango total
                const { desde: desdeCustom, hasta: hastaCustom } = getDateRange;
                const totalRange = new Date(hastaCustom).getTime() - new Date(desdeCustom).getTime();
                windowSize = Math.max(60000, totalRange / 200); // Máximo 200 puntos
                break;
              default:
                windowSize = 60000;
            }
            let currentWindow: Point[] = [];
            let windowStart = 0;
            
            for (const point of allPoints) {
              if (windowStart === 0) {
                windowStart = point.ts;
              }
              
              if (point.ts - windowStart < windowSize) {
                currentWindow.push(point);
              } else {
                // Promediar valores en la ventana actual
                if (currentWindow.length > 0) {
                  const avgVrms = currentWindow.reduce((sum, p) => sum + (p.Vrms || 0), 0) / currentWindow.length;
                  const avgIrms = currentWindow.reduce((sum, p) => sum + (p.Irms || 0), 0) / currentWindow.length;
                  const avgS = currentWindow.reduce((sum, p) => sum + (p.S || 0), 0) / currentWindow.length;
                  
                  sampledPoints.push({
                    ts: windowStart + windowSize / 2,
                    Vrms: avgVrms || undefined,
                    Irms: avgIrms || undefined,
                    S: avgS || undefined,
                  });
                }
                
                // Iniciar nueva ventana
                currentWindow = [point];
                windowStart = point.ts;
              }
            }
            
            // Agregar última ventana
            if (currentWindow.length > 0) {
              const avgVrms = currentWindow.reduce((sum, p) => sum + (p.Vrms || 0), 0) / currentWindow.length;
              const avgIrms = currentWindow.reduce((sum, p) => sum + (p.Irms || 0), 0) / currentWindow.length;
              const avgS = currentWindow.reduce((sum, p) => sum + (p.S || 0), 0) / currentWindow.length;
              
              sampledPoints.push({
                ts: windowStart + windowSize / 2,
                Vrms: avgVrms || undefined,
                Irms: avgIrms || undefined,
                S: avgS || undefined,
              });
            }
            
            // Limitar puntos según el período
            let maxPoints: number;
            switch (timeRange) {
              case '24h':
                maxPoints = 144; // 1 punto por hora
                break;
              case 'week':
                maxPoints = 168; // 1 punto por hora
                break;
              case 'month':
                maxPoints = 720; // 1 punto por hora
                break;
              case 'custom':
                maxPoints = 500; // Máximo 500 puntos
                break;
              default:
                maxPoints = 144;
            }
            setHistoricalData(sampledPoints.slice(-maxPoints));
          } else {
            setDbLatest(null);
            setHistoricalData([]);
          }
        }
      } catch (err) {
        console.error("Error cargando telemetría:", err);
      }
    }

    loadLatestTelemetry();
    
    // Polling según el período seleccionado
    let pollInterval: number;
    switch (timeRange) {
      case '24h':
        pollInterval = 10000; // 10 segundos
        break;
      case 'week':
        pollInterval = 60000; // 1 minuto
        break;
      case 'month':
        pollInterval = 300000; // 5 minutos
        break;
      case 'custom':
        pollInterval = 60000; // 1 minuto
        break;
      default:
        pollInterval = 10000;
    }
    
    const interval = setInterval(loadLatestTelemetry, pollInterval);
    return () => clearInterval(interval);
  }, [selectedDevice, timeRange, getDateRange]);

  const theme = useTheme();
  const axisColor = theme.palette.text.secondary;
  const gridColor = theme.palette.divider;
  const tooltipBg = theme.palette.background.paper;
  const tooltipColor = theme.palette.text.primary;

  return (
    <Box sx={{ minHeight: '100dvh', width: '100%', bgcolor: 'background.default', color: 'text.primary', p: { xs: 2, sm: 3 } }}>
      <Box sx={{ mx: 'auto', maxWidth: { xs: '100%', sm: '100%', md: '100%', lg: '1600px' }, width: '100%', display: 'grid', gap: 3 }}>
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

        {/* Información fija de Company y Device (sin selectores) */}
        {selectedCompany && selectedDevice && (
          <Paper sx={{ borderRadius: 3, p: 2, bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Company</Typography>
                <Typography variant="body1" fontWeight="medium">
                  Soledad Giménez
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Dispositivo</Typography>
                <Typography variant="body1" fontWeight="medium">
                  Dispositivo Principal (PRINCIPAL)
                </Typography>
              </Box>
            </Box>
          </Paper>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
          <KpiCard title="Vrms" value={`${lastVrms} V`} />
          <KpiCard title="Irms" value={`${lastIrms} A`} />
          <KpiCard title="S (aparente)" value={`${lastS} VA`} />
        </Box>

        {/* Selector de período de tiempo */}
        {selectedDevice && (
          <Paper sx={{ borderRadius: 3, p: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControl sx={{ minWidth: 150 }}>
                <InputLabel>Período</InputLabel>
                <Select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as '24h' | 'week' | 'month' | 'custom')}
                  label="Período"
                >
                  <MenuItem value="24h">Últimas 24 horas</MenuItem>
                  <MenuItem value="week">Última semana</MenuItem>
                  <MenuItem value="month">Último mes</MenuItem>
                  <MenuItem value="custom">Personalizado</MenuItem>
                </Select>
              </FormControl>
              
              {timeRange === 'custom' && (
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
                  <DatePicker
                    label="Desde"
                    value={customDateFrom}
                    onChange={(newValue) => setCustomDateFrom(newValue)}
                    maxDate={customDateTo || new Date()}
                    slotProps={{ textField: { size: 'small', sx: { width: 150 } } }}
                  />
                  <DatePicker
                    label="Hasta"
                    value={customDateTo}
                    onChange={(newValue) => setCustomDateTo(newValue)}
                    minDate={customDateFrom || undefined}
                    maxDate={new Date()}
                    slotProps={{ textField: { size: 'small', sx: { width: 150 } } }}
                  />
                </LocalizationProvider>
              )}
              
              {selectedDevice && dbLatest && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  Última actualización: {new Date(dbLatest.created_at || Date.now()).toLocaleTimeString()}
                </Typography>
              )}
            </Box>
          </Paper>
        )}

        {/* Gráficos separados */}
        {selectedDevice && (
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
            <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
              {/* Gráfico de Voltaje (Vrms) */}
              <Grid item xs={12} md={4}>
                <Paper sx={{ borderRadius: 3, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 600, fontSize: { xs: '1.1rem', sm: '1.2rem', md: '1.3rem' } }}>
                    Voltaje RMS (Vrms)
                  </Typography>
                  <Box sx={{ flex: 1, height: { xs: 400, sm: 450, md: 500, lg: 550 }, minHeight: 400 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        data={(() => {
                          let chartData = historicalData.map(p => ({ ts: p.ts, value: p.Vrms })).filter(p => p.value != null);
                          chartData.sort((a, b) => a.ts - b.ts);
                          return chartData;
                        })()}
                        margin={{ top: 25, right: 35, left: 30, bottom: 70 }}
                      >
                        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="ts" 
                          tickFormatter={(ts) => fmtTime(Number(ts), timeRange)} 
                          stroke={axisColor} 
                          tick={{ fill: axisColor, fontSize: 14 }}
                          minTickGap={40}
                          angle={-45}
                          textAnchor="end"
                          height={85}
                        />
                        <YAxis 
                          stroke={axisColor} 
                          tick={{ fill: axisColor, fontSize: 14 }}
                          domain={['auto', 'auto']}
                          label={{ value: 'Voltaje (V)', angle: -90, position: 'insideLeft', style: { fill: axisColor, fontSize: 16, fontWeight: 600 } }}
                          width={70}
                        />
                        <Tooltip
                          contentStyle={{ background: tooltipBg, border: `1px solid ${gridColor}`, color: tooltipColor, borderRadius: '8px', fontSize: 16, padding: '12px 16px', fontWeight: 600 }}
                          labelFormatter={(ts) => `Hora: ${fmtTime(Number(ts), timeRange)}`}
                          formatter={(value: any) => [`${Number(value).toFixed(2)} V`, 'Voltaje']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          dot={false} 
                          isAnimationActive={false} 
                          strokeOpacity={0.9} 
                          stroke={theme.palette.primary.main}
                          strokeWidth={4}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>

              {/* Gráfico de Corriente (Irms) */}
              <Grid item xs={12} md={4}>
                <Paper sx={{ borderRadius: 3, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 600, fontSize: { xs: '1.1rem', sm: '1.2rem', md: '1.3rem' } }}>
                    Corriente RMS (Irms)
                  </Typography>
                  <Box sx={{ flex: 1, height: { xs: 400, sm: 450, md: 500, lg: 550 }, minHeight: 400 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        data={(() => {
                          let chartData = historicalData.map(p => ({ ts: p.ts, value: p.Irms })).filter(p => p.value != null);
                          chartData.sort((a, b) => a.ts - b.ts);
                          return chartData;
                        })()}
                        margin={{ top: 25, right: 35, left: 30, bottom: 70 }}
                      >
                        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="ts" 
                          tickFormatter={(ts) => fmtTime(Number(ts), timeRange)} 
                          stroke={axisColor} 
                          tick={{ fill: axisColor, fontSize: 14 }}
                          minTickGap={40}
                          angle={-45}
                          textAnchor="end"
                          height={85}
                        />
                        <YAxis 
                          stroke={axisColor} 
                          tick={{ fill: axisColor, fontSize: 14 }}
                          domain={['auto', 'auto']}
                          label={{ value: 'Corriente (A)', angle: -90, position: 'insideLeft', style: { fill: axisColor, fontSize: 16, fontWeight: 600 } }}
                          width={70}
                        />
                        <Tooltip
                          contentStyle={{ background: tooltipBg, border: `1px solid ${gridColor}`, color: tooltipColor, borderRadius: '8px', fontSize: 16, padding: '12px 16px', fontWeight: 600 }}
                          labelFormatter={(ts) => `Hora: ${fmtTime(Number(ts), timeRange)}`}
                          formatter={(value: any) => [`${Number(value).toFixed(3)} A`, 'Corriente']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          dot={false}
                          isAnimationActive={false} 
                          strokeOpacity={0.9} 
                          stroke={theme.palette.secondary.main}
                          strokeWidth={4}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>

              {/* Gráfico de Potencia Aparente (S) */}
              <Grid item xs={12} md={4}>
                <Paper sx={{ borderRadius: 3, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 600, fontSize: { xs: '1.1rem', sm: '1.2rem', md: '1.3rem' } }}>
                    Potencia Aparente (S)
                  </Typography>
                  <Box sx={{ flex: 1, height: { xs: 400, sm: 450, md: 500, lg: 550 }, minHeight: 400 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        data={(() => {
                          let chartData = historicalData.map(p => ({ ts: p.ts, value: p.S })).filter(p => p.value != null);
                          chartData.sort((a, b) => a.ts - b.ts);
                          return chartData;
                        })()}
                        margin={{ top: 25, right: 35, left: 30, bottom: 70 }}
                      >
                        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="ts" 
                          tickFormatter={(ts) => fmtTime(Number(ts), timeRange)} 
                          stroke={axisColor} 
                          tick={{ fill: axisColor, fontSize: 14 }}
                          minTickGap={40}
                          angle={-45}
                          textAnchor="end"
                          height={85}
                        />
                        <YAxis 
                          stroke={axisColor} 
                          tick={{ fill: axisColor, fontSize: 14 }}
                          domain={['auto', 'auto']}
                          label={{ value: 'Potencia Aparente (VA)', angle: -90, position: 'insideLeft', style: { fill: axisColor, fontSize: 16, fontWeight: 600 } }}
                          width={85}
                        />
                        <Tooltip
                          contentStyle={{ background: tooltipBg, border: `1px solid ${gridColor}`, color: tooltipColor, borderRadius: '8px', fontSize: 16, padding: '12px 16px', fontWeight: 600 }}
                          labelFormatter={(ts) => `Hora: ${fmtTime(Number(ts), timeRange)}`}
                          formatter={(value: any) => [`${Number(value).toFixed(2)} VA`, 'Potencia Aparente']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          dot={false}
                          isAnimationActive={false} 
                          strokeOpacity={0.9} 
                          stroke={theme.palette.info.main}
                          strokeWidth={4}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          </LocalizationProvider>
        )}

        {selectedDevice && !dbLatest && (
          <Paper sx={{ borderRadius: 3, p: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              Esperando datos del ESP32... Asegúrate de que el dispositivo esté enviando datos.
            </Typography>
          </Paper>
        )}
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

// Formatear tiempo según el período seleccionado
const fmtTime = (ts: number, timeRange?: '24h' | 'week' | 'month' | 'custom') => {
  const date = new Date(ts);
  if (timeRange === '24h') {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } else {
    return date.toLocaleString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
};

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <Paper sx={{ borderRadius: 3, p: 2 }}>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      <Typography variant="h6" fontWeight={600} sx={{ mt: 0.5 }}>{value}</Typography>
    </Paper>
  );
}
