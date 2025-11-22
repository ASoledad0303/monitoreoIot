'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
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
  mes_iso: string | null; // YYYY-MM (opcional, para compatibilidad)
  fecha_desde: string | null; // YYYY-MM-DD
  fecha_hasta: string | null; // YYYY-MM-DD
  consumo_facturado_kwh: number | null; // Consumo total facturado en kWh
  consumo_medido_kwh: number | null; // Consumo total medido por el sistema en kWh
  diferencia_kwh: number | null; // Diferencia entre facturado y medido
  periodo_descripcion: string; // Descripción del periodo para mostrar
  // Campos antiguos para compatibilidad
  potencia_facturada_kw?: number | null;
  potencia_media_medida_kw?: number | null;
  diferencia_kw?: number | null;
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
  role: "admin" | "user" | "super_admin";
  company_id?: number | null;
}

export default function CompararFactura() {
  const [fechaDesde, setFechaDesde] = useState<Date | null>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [fechaHasta, setFechaHasta] = useState<Date | null>(new Date());
  const [consumoFacturadoKWh, setConsumoFacturadoKWh] = useState<string>('');
  const [registros, setRegistros] = useState<RegistroFactura[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consumoMedidoKWh, setConsumoMedidoKWh] = useState<number | null>(null);
  const [loadingConsumo, setLoadingConsumo] = useState(false);
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
          if (userData.role === "admin" || userData.role === "super_admin") {
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

  // Calcular consumo total del periodo desde el sistema
  useEffect(() => {
    if (!fechaDesde || !fechaHasta || !selectedDevice) {
      setConsumoMedidoKWh(null);
      return;
    }
    fetchConsumoPeriodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, selectedCompany, selectedDevice]);

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
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log('[FACTURA] Facturas recibidas:', data.facturas?.length || 0);
      setRegistros(data.facturas || []);
    } catch (e: any) {
      console.error('Error obteniendo facturas:', e);
      setError(e.message || 'Error al cargar facturas');
    } finally {
      setLoading(false);
    }
  };

  const fetchConsumoPeriodo = async () => {
    if (!fechaDesde || !fechaHasta || !selectedDevice) return;
    
    setLoadingConsumo(true);
    try {
      // Buscar el código del dispositivo
      const device = devices.find(d => d.id.toString() === selectedDevice);
      if (!device || !device.code) {
        setConsumoMedidoKWh(null);
        return;
      }

      // Usar el endpoint inteligente que calcula el consumo total
      const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5000';
      const start = new Date(fechaDesde);
      const end = new Date(fechaHasta);
      end.setHours(23, 59, 59, 999); // Incluir todo el día hasta

      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        device: device.code,
      });

      const url = `${FLASK_API_URL}/metrics/history-smart?${params.toString()}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        setConsumoMedidoKWh(null);
        return;
      }

      const result = await response.json();
      
      if (!result || result.length === 0) {
        setConsumoMedidoKWh(null);
        return;
      }

      // Calcular consumo total del periodo (similar a como se hace en reportes)
      interface RawDataItem {
        timestamp: number;
        potencia: number | null;
      }
      
      const rawData: RawDataItem[] = (result || []).map((item: any) => {
        const ts = item.ts > 1000000000000 ? item.ts : item.ts * 1000;
        return {
          timestamp: ts,
          potencia: item.potencia_activa ?? null,
        };
      }).sort((a: RawDataItem, b: RawDataItem) => a.timestamp - b.timestamp);

      // Calcular consumo total (energía acumulada) del periodo
      let consumoTotalKWh = 0;
      if (rawData.length > 1) {
        for (let i = 0; i < rawData.length - 1; i++) {
          const potencia = rawData[i].potencia;
          if (potencia !== null && potencia !== undefined) {
            const tiempoInicio = rawData[i].timestamp;
            const tiempoFin = rawData[i + 1].timestamp;
            const intervaloHoras = (tiempoFin - tiempoInicio) / (1000 * 60 * 60);
            const potenciaKW = potencia / 1000; // Convertir W a kW
            consumoTotalKWh += potenciaKW * intervaloHoras;
          }
        }
        // Agregar el último intervalo
        if (rawData.length > 0) {
          const ultimaPotencia = rawData[rawData.length - 1].potencia;
          if (ultimaPotencia !== null && ultimaPotencia !== undefined) {
            const ultimoIntervalo = rawData.length > 1
              ? (rawData[rawData.length - 1].timestamp - rawData[rawData.length - 2].timestamp) / (1000 * 60 * 60)
              : 1 / 24; // Si solo hay una medición, asumir 1 hora
            const ultimaPotenciaKW = ultimaPotencia / 1000;
            consumoTotalKWh += ultimaPotenciaKW * ultimoIntervalo;
          }
        }
      } else if (rawData.length === 1) {
        const potencia = rawData[0].potencia;
        if (potencia !== null && potencia !== undefined) {
          // Si solo hay una medición, estimar consumo asumiendo potencia constante
          const potenciaKW = potencia / 1000;
          const diasPeriodo = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          consumoTotalKWh = potenciaKW * 24 * diasPeriodo; // Asumir 24 horas por día
        }
      }

      setConsumoMedidoKWh(parseFloat(consumoTotalKWh.toFixed(3)));
    } catch (e) {
      console.error('Error calculando consumo del periodo:', e);
      setConsumoMedidoKWh(null);
    } finally {
      setLoadingConsumo(false);
    }
  };

  const limpiarFormulario = () => {
    setConsumoFacturadoKWh('');
    setEditId(null);
    setFechaDesde(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setFechaHasta(new Date());
  };

  const onAgregarActualizar = async () => {
    const valorNum = parseFloat(consumoFacturadoKWh);
    if (isNaN(valorNum) || valorNum < 0) {
      setError('Ingresa un valor válido de consumo (kWh)');
      return;
    }

    if (!fechaDesde || !fechaHasta) {
      setError('Selecciona el periodo de consumo (fecha desde y fecha hasta)');
      return;
    }

    if (!selectedDevice) {
      setError('Selecciona un dispositivo');
      return;
    }

    if (fechaDesde > fechaHasta) {
      setError('La fecha desde debe ser anterior a la fecha hasta');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const fechaDesdeStr = fechaDesde.toISOString().split('T')[0];
      const fechaHastaStr = fechaHasta.toISOString().split('T')[0];
      const diferencia = consumoMedidoKWh != null ? parseFloat((valorNum - consumoMedidoKWh).toFixed(3)) : null;

      if (editId) {
        // Actualizar factura existente
        const res = await fetch(`/api/facturas/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_desde: fechaDesdeStr,
            fecha_hasta: fechaHastaStr,
            consumo_facturado_kwh: valorNum,
            consumo_medido_kwh: consumoMedidoKWh,
            diferencia_kwh: diferencia,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al actualizar factura');
        }
      } else {
        // Crear nueva factura
        const body: any = {
          fecha_desde: fechaDesdeStr,
          fecha_hasta: fechaHastaStr,
          consumo_facturado_kwh: valorNum,
          consumo_medido_kwh: consumoMedidoKWh,
          diferencia_kwh: diferencia,
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
      fetchConsumoPeriodo(); // Recalcular consumo del periodo
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
    
    if (r.fecha_desde && r.fecha_hasta) {
      setFechaDesde(new Date(r.fecha_desde));
      setFechaHasta(new Date(r.fecha_hasta));
    } else if (r.mes_iso) {
      // Compatibilidad con registros antiguos que usan mes_iso
      const [year, month] = r.mes_iso.split('-').map((x) => parseInt(x, 10));
      setFechaDesde(new Date(year, month - 1, 1));
      setFechaHasta(new Date(year, month, 0));
    }
    
    const consumoFacturado = r.consumo_facturado_kwh ?? r.potencia_facturada_kw ?? null;
    setConsumoFacturadoKWh(consumoFacturado != null ? Number(consumoFacturado).toString() : '');
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
            {(currentUser?.role === "admin" || currentUser?.role === "super_admin") && (
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
            <FormControl fullWidth size="small" disabled={!selectedCompany && (currentUser?.role === "admin" || currentUser?.role === "super_admin")}>
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
              <TextField
                label="Consumo facturado (kWh)"
                value={consumoFacturadoKWh}
                onChange={(e) => setConsumoFacturadoKWh(e.target.value)}
                type="number"
                inputProps={{ step: '0.01', min: '0' }}
                fullWidth
                size="small"
                helperText="Ingresa el consumo total facturado en el periodo"
              />
            </Box>
            <Box>
              <Button 
                variant="contained" 
                onClick={onAgregarActualizar} 
                disabled={saving || !fechaDesde || !fechaHasta || !consumoFacturadoKWh || !selectedDevice}
                fullWidth
              >
                {saving ? <CircularProgress size={24} /> : editId ? 'Actualizar' : 'Agregar'}
              </Button>
            </Box>
          </Box>
        </LocalizationProvider>

        <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          {loadingConsumo ? (
            <Typography variant="body2">Calculando consumo del periodo...</Typography>
          ) : (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Consumo medido por el sistema:</strong> {consumoMedidoKWh != null ? `${consumoMedidoKWh} kWh` : 'Sin datos disponibles'}
              </Typography>
              {consumoMedidoKWh != null && consumoFacturadoKWh && (
                <>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Consumo facturado:</strong> {parseFloat(consumoFacturadoKWh).toFixed(3)} kWh
                  </Typography>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontWeight: 'bold',
                      color: Math.abs(parseFloat(consumoFacturadoKWh) - consumoMedidoKWh) > 1 
                        ? 'error.main' 
                        : 'success.main'
                    }}
                  >
                    <strong>Diferencia:</strong> {(parseFloat(consumoFacturadoKWh) - consumoMedidoKWh).toFixed(3)} kWh
                    {Math.abs(parseFloat(consumoFacturadoKWh) - consumoMedidoKWh) > 1 && (
                      <span> ⚠️ Hay una diferencia significativa</span>
                    )}
                  </Typography>
                </>
              )}
            </>
          )}
        </Box>
      </Paper>

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table aria-label="tabla comparar factura">
            <TableHead>
              <TableRow>
                <TableCell>Periodo</TableCell>
                <TableCell align="right">Consumo Facturado (kWh)</TableCell>
                <TableCell align="right">Consumo Medido (kWh)</TableCell>
                <TableCell align="right">Diferencia (kWh)</TableCell>
                <TableCell align="center">Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : registros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">Aún no hay registros</TableCell>
                </TableRow>
              ) : (
                registros.map((r) => {
                  // Usar consumo_facturado_kwh o potencia_facturada_kw como fallback
                  // Convertir a número para asegurar que sea un número válido
                  const consumoFacturadoRaw = r.consumo_facturado_kwh ?? r.potencia_facturada_kw ?? null;
                  const consumoFacturado = consumoFacturadoRaw != null ? Number(consumoFacturadoRaw) : null;
                  
                  // Usar diferencia_kwh o diferencia_kw como fallback
                  const diferenciaRaw = r.diferencia_kwh ?? r.diferencia_kw ?? null;
                  const diferencia = diferenciaRaw != null ? Number(diferenciaRaw) : null;
                  
                  // Usar consumo_medido_kwh o potencia_media_medida_kw como fallback
                  const consumoMedidoRaw = r.consumo_medido_kwh ?? r.potencia_media_medida_kw ?? null;
                  const consumoMedido = consumoMedidoRaw != null ? Number(consumoMedidoRaw) : null;
                  
                  const tieneDiferencia = diferencia != null && !isNaN(diferencia) && Math.abs(diferencia) > 1;
                  const periodoDesc = r.periodo_descripcion || 
                    (r.fecha_desde && r.fecha_hasta 
                      ? `${r.fecha_desde} a ${r.fecha_hasta}` 
                      : r.mes_iso || 'N/A');
                  
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>{periodoDesc}</TableCell>
                      <TableCell align="right">
                        {consumoFacturado != null && !isNaN(consumoFacturado) ? consumoFacturado.toFixed(3) : '-'}
                      </TableCell>
                      <TableCell align="right">
                        {consumoMedido != null && !isNaN(consumoMedido) ? consumoMedido.toFixed(3) : '-'}
                      </TableCell>
                      <TableCell align="right">
                        <Typography 
                          variant="body2"
                          sx={{ 
                            color: tieneDiferencia ? 'error.main' : diferencia != null && !isNaN(diferencia) ? 'success.main' : 'text.secondary',
                            fontWeight: tieneDiferencia ? 'bold' : 'normal'
                          }}
                        >
                          {diferencia != null && !isNaN(diferencia) ? diferencia.toFixed(3) : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {diferencia != null && (
                          <Typography 
                            variant="caption"
                            sx={{ 
                              color: tieneDiferencia ? 'error.main' : 'success.main',
                              fontWeight: 'bold'
                            }}
                          >
                            {tieneDiferencia ? '⚠️ Diferencia' : '✓ Coincide'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => onEditar(r.id)} color="primary">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => onEliminar(r.id)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}