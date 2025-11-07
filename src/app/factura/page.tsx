'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Divider,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import MainMenu from '@/components/MainMenu';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { es } from 'date-fns/locale';

interface RegistroFactura {
  id: number;
  mes_iso: string; // YYYY-MM
  potencia_facturada_kw: number;
  potencia_media_medida_kw: number | null;
  diferencia_kw: number | null;
}

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

export default function CompararFactura() {
  const [mes, setMes] = useState<Date | null>(new Date());
  const [potenciaFacturadaKW, setPotenciaFacturadaKW] = useState<string>('');
  const [registros, setRegistros] = useState<RegistroFactura[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [potenciaMediaMesKW, setPotenciaMediaMesKW] = useState<number | null>(null);
  const [loadingPotencia, setLoadingPotencia] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const mesISO = useMemo(() => {
    if (!mes) return '';
    const year = mes.getFullYear();
    const month = `${mes.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
  }, [mes]);

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
            // Pero podemos cargar devices de su company
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

  // Cargar facturas cuando cambian los filtros
  useEffect(() => {
    fetchFacturas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany, selectedDevice]);

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

  // Calcular potencia media del mes desde telemetry_history
  useEffect(() => {
    if (!mes) {
      setPotenciaMediaMesKW(null);
      return;
    }
    fetchPotenciaMediaMes();
  }, [mes, selectedCompany, selectedDevice]);

  const fetchFacturas = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/facturas';
      const params = new URLSearchParams();
      
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
      if (!res.ok) throw new Error('Error al obtener facturas');
      const data = await res.json();
      setRegistros(data.facturas || []);
    } catch (e: any) {
      console.error('Error obteniendo facturas:', e);
      setError(e.message || 'Error al cargar facturas');
    } finally {
      setLoading(false);
    }
  };

  const fetchPotenciaMediaMes = async () => {
    if (!mes) return;
    
    setLoadingPotencia(true);
    try {
      const year = mes.getFullYear();
      const month = `${mes.getMonth() + 1}`.padStart(2, '0');
      const fechaDesde = `${year}-${month}-01`;
      const fechaHasta = `${year}-${month}-${new Date(year, mes.getMonth() + 1, 0).getDate()}`;

      // Construir query con filtros
      let url = `/api/telemetry?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}`;
      if (selectedCompany) {
        url += `&company_id=${selectedCompany}`;
      }
      if (selectedDevice) {
        url += `&device_id=${selectedDevice}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        setPotenciaMediaMesKW(null);
        return;
      }
      const data = await res.json();
      
      const registrosMes = (data.data || []).filter((r: any) => r.potencia != null);
      if (registrosMes.length === 0) {
        setPotenciaMediaMesKW(null);
        return;
      }
      
      // Promedio de potencia en W, convertir a kW
      const promedioW = registrosMes.reduce((sum: number, r: any) => sum + (r.potencia || 0), 0) / registrosMes.length;
      setPotenciaMediaMesKW(parseFloat((promedioW / 1000).toFixed(3)));
    } catch (e) {
      console.error('Error calculando potencia media:', e);
      setPotenciaMediaMesKW(null);
    } finally {
      setLoadingPotencia(false);
    }
  };

  const limpiarFormulario = () => {
    setPotenciaFacturadaKW('');
    setEditId(null);
  };

  const onAgregarActualizar = async () => {
    const valorNum = parseFloat(potenciaFacturadaKW);
    if (isNaN(valorNum) || valorNum < 0) {
      setError('Ingresa un valor válido');
      return;
    }

    if (!mesISO) {
      setError('Selecciona un mes');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const diferencia = potenciaMediaMesKW != null ? parseFloat((valorNum - potenciaMediaMesKW).toFixed(3)) : null;

      if (editId) {
        // Actualizar factura existente
        const res = await fetch(`/api/facturas/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            potencia_facturada_kw: valorNum,
            potencia_media_medida_kw: potenciaMediaMesKW,
            diferencia_kw: diferencia,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al actualizar factura');
        }
      } else {
        // Crear nueva factura
        const body: any = {
          mes_iso: mesISO,
          potencia_facturada_kw: valorNum,
          potencia_media_medida_kw: potenciaMediaMesKW,
          diferencia_kw: diferencia,
        };
        
        // Agregar company_id y device_id si están seleccionados
        if (selectedCompany) {
          body.company_id = parseInt(selectedCompany);
        }
        if (selectedDevice) {
          body.device_id = parseInt(selectedDevice);
        }
        
        const res = await fetch('/api/facturas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al crear factura');
        }
      }

      await fetchFacturas();
      fetchPotenciaMediaMes(); // Recalcular potencia media
      limpiarFormulario();
    } catch (e: any) {
      setError(e.message || 'Error al guardar factura');
    } finally {
      setSaving(false);
    }
  };

  const onEliminar = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta factura?')) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/facturas/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al eliminar factura');
      }
      await fetchFacturas();
    } catch (e: any) {
      setError(e.message || 'Error al eliminar factura');
    } finally {
      setLoading(false);
    }
  };

  const onEditar = (id: number) => {
    const r = registros.find((x) => x.id === id);
    if (!r) return;
    const [year, month] = r.mes_iso.split('-').map((x) => parseInt(x, 10));
    setMes(new Date(year, month - 1, 1));
    setPotenciaFacturadaKW(r.potencia_facturada_kw.toString());
    setEditId(id);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ mr: 2 }}>
          <MainMenu />
        </Box>
        <Typography variant="h4">Comparar factura</Typography>
      </Box>
      <Divider sx={{ mb: 3 }} />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Ingresar datos de factura
        </Typography>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 2, alignItems: 'center', mb: 2 }}>
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
            <FormControl fullWidth size="small" disabled={!selectedCompany && currentUser?.role === "admin"}>
              <InputLabel>Dispositivo</InputLabel>
              <Select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                label="Dispositivo"
              >
                <MenuItem value="">Todos</MenuItem>
                {devices.map((device) => (
                  <MenuItem key={device.id} value={device.id.toString()}>
                    {device.name} ({device.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box>
              <DatePicker
                label="Mes de facturación"
                value={mes}
                onChange={(newValue) => setMes(newValue)}
                views={["year", "month"]}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                minDate={new Date(2020, 0, 1)}
                maxDate={new Date(2025, 11, 31)}
              />
            </Box>
            <Box>
              <TextField
                label="Potencia activa facturada (kW)"
                value={potenciaFacturadaKW}
                onChange={(e) => setPotenciaFacturadaKW(e.target.value)}
                type="number"
                inputProps={{ step: '0.01', min: '0' }}
                fullWidth
                size="small"
              />
            </Box>
            <Box>
              <Button 
                variant="contained" 
                onClick={onAgregarActualizar} 
                disabled={saving || !mesISO || !potenciaFacturadaKW}
                fullWidth
              >
                {saving ? <CircularProgress size={24} /> : editId ? 'Actualizar' : 'Agregar'}
              </Button>
            </Box>
          </Box>
        </LocalizationProvider>

        <Box sx={{ mt: 2, color: 'text.secondary' }}>
          {loadingPotencia ? (
            <Typography variant="body2">Calculando potencia media...</Typography>
          ) : (
            <>
              <Typography variant="body2">
                Potencia media medida del mes: {potenciaMediaMesKW != null ? `${potenciaMediaMesKW} kW` : 'Sin datos'}
              </Typography>
              <Typography variant="body2">
                Diferencia: {potenciaMediaMesKW != null && potenciaFacturadaKW ? `${(parseFloat(potenciaFacturadaKW) - potenciaMediaMesKW).toFixed(3)} kW` : '-'}
              </Typography>
            </>
          )}
        </Box>
      </Paper>

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table aria-label="tabla comparar factura">
            <TableHead>
              <TableRow>
                <TableCell>Mes</TableCell>
                <TableCell>Potencia facturada (kW)</TableCell>
                <TableCell>Potencia media medida (kW)</TableCell>
                <TableCell>Diferencia (kW)</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : registros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">Aún no hay registros</TableCell>
                </TableRow>
              ) : (
                registros.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.mes_iso}</TableCell>
                    <TableCell>{r.potencia_facturada_kw.toFixed(3)}</TableCell>
                    <TableCell>{r.potencia_media_medida_kw != null ? r.potencia_media_medida_kw.toFixed(3) : '-'}</TableCell>
                    <TableCell>{r.diferencia_kw != null ? r.diferencia_kw.toFixed(3) : '-'}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => onEditar(r.id)} color="primary">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => onEliminar(r.id)} color="error">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
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