'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import MainMenu from '@/components/MainMenu';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { es } from 'date-fns/locale';

interface Alerta {
  id?: number;
  fecha: string; // ISO date (YYYY-MM-DD)
  tipo: 'Alta tensión' | 'Baja tensión' | 'Alto consumo';
  mensaje: string;
  valor?: string | null;
  dispositivo?: string | null;
  device_name?: string | null;
  device_code?: string | null;
}

interface Company {
  id: number;
  name: string;
  code: string | null;
}

interface Device {
  id: number;
  name: string;
  code: string | null;
  company_id: number;
}

interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  company_id?: number | null;
}

export default function PanelAlertas() {
  const [fechaDesde, setFechaDesde] = useState<Date | null>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [fechaHasta, setFechaHasta] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

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
            // Si es user, cargar devices de su company
            if (userData.company_id) {
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

  const fetchAlertas = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/alerts';
      const params = new URLSearchParams();
      
      if (fechaDesde) {
        params.append('fechaDesde', fechaDesde.toISOString().split('T')[0]);
      }
      if (fechaHasta) {
        params.append('fechaHasta', fechaHasta.toISOString().split('T')[0]);
      }
      
      // Agregar filtros de company y device
      if (selectedCompany) {
        params.append('company_id', selectedCompany);
      }
      if (selectedDevice) {
        params.append('device_id', selectedDevice);
      }
      
      if (params.toString()) {
        url += '?' + params.toString();
      }

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Error al obtener alertas');
      }
      const data = await res.json();
      setAlertas(data.alerts || []);
    } catch (e: any) {
      console.error('Error obteniendo alertas:', e);
      setError(e.message || 'Error al cargar alertas');
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertas();
  }, []);

  const aplicarFiltros = () => {
    fetchAlertas();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ mr: 2 }}>
          <MainMenu />
        </Box>
        <Typography variant="h4">Panel de alertas</Typography>
      </Box>
      <Divider sx={{ mb: 3 }} />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Filtros de búsqueda
        </Typography>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
            {/* Selector de Company (solo admin) */}
            {currentUser?.role === "admin" && (
              <FormControl fullWidth size="small">
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

            {/* Selector de Device */}
            <FormControl fullWidth size="small">
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

            {/* Placeholder para alinear */}
            {currentUser?.role !== "admin" && <Box />}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, alignItems: 'center' }}>
            <Box>
              <DatePicker
                label="Fecha desde"
                value={fechaDesde}
                onChange={(newValue) => setFechaDesde(newValue)}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                minDate={new Date(2020, 0, 1)}
                maxDate={new Date(2025, 11, 31)}
              />
            </Box>
            <Box>
              <DatePicker
                label="Fecha hasta"
                value={fechaHasta}
                onChange={(newValue) => setFechaHasta(newValue)}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                minDate={fechaDesde || new Date(2020, 0, 1)}
                maxDate={new Date(2025, 11, 31)}
              />
            </Box>
            <Box>
              <Button
                variant="contained"
                onClick={aplicarFiltros}
                disabled={loading}
                fullWidth
              >
                {loading ? <CircularProgress size={24} /> : 'Consultar'}
              </Button>
            </Box>
          </Box>
        </LocalizationProvider>
      </Paper>

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table stickyHeader aria-label="tabla de alertas">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Valor</TableCell>
                <TableCell>Mensaje de alarma</TableCell>
                <TableCell>Dispositivo</TableCell>
                {currentUser?.role === "admin" && <TableCell>Company</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={currentUser?.role === "admin" ? 6 : 5} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : alertas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={currentUser?.role === "admin" ? 6 : 5} align="center">
                    No hay alertas en el periodo seleccionado
                  </TableCell>
                </TableRow>
              ) : (
                alertas.map((a) => (
                  <TableRow key={a.id || a.fecha} hover>
                    <TableCell>{a.fecha}</TableCell>
                    <TableCell>{a.tipo}</TableCell>
                    <TableCell>{a.valor || '-'}</TableCell>
                    <TableCell>{a.mensaje}</TableCell>
                    <TableCell>
                      {a.device_name 
                        ? `${a.device_name}${a.device_code ? ` (${a.device_code})` : ''}`
                        : a.dispositivo || '-'}
                    </TableCell>
                    {currentUser?.role === "admin" && (
                      <TableCell>-</TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}