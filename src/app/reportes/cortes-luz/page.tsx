'use client';

import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Button,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField
} from '@mui/material';
import MainMenu from '@/components/MainMenu';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// URL de la API Flask
const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5000';

// Tipos para los datos
interface CorteLuz {
  fechaInicio: string;
  fechaFin: string;
  duracion: string;
  tipo: string;
  voltajeMinimo: number | null;
  voltajeMaximo: number | null;
  dispositivo: string;
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
  role: "admin" | "user" | "super_admin";
  company_id?: number | null;
}

export default function ReporteCortesLuz() {
  const [fechaDesde, setFechaDesde] = useState<Date | null>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [fechaHasta, setFechaHasta] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState(false);
  const [cortes, setCortes] = useState<CorteLuz[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [umbralVoltajeMinimo, setUmbralVoltajeMinimo] = useState<number>(50);

  // Cargar usuario y companies al iniciar
  useEffect(() => {
    async function loadInitialData() {
      try {
        const userRes = await fetch("/api/auth/me");
        if (userRes.ok) {
          const userData = await userRes.json();
          setCurrentUser(userData);
          
          if (userData.role === "admin" || userData.role === "super_admin") {
            const companiesRes = await fetch("/api/companies");
            if (companiesRes.ok) {
              const companiesData = await companiesRes.json();
              setCompanies(companiesData.companies || []);
              if (companiesData.companies && companiesData.companies.length === 1) {
                setSelectedCompany(companiesData.companies[0].id.toString());
                const devicesRes = await fetch(`/api/devices?company_id=${companiesData.companies[0].id}`);
                if (devicesRes.ok) {
                  const devicesData = await devicesRes.json();
                  setDevices(devicesData.devices || []);
                  if (devicesData.devices && devicesData.devices.length === 1) {
                    setSelectedDevice(devicesData.devices[0].id.toString());
                  }
                }
              }
            }
          } else {
            if (userData.company_id) {
              setSelectedCompany(userData.company_id.toString());
              const devicesRes = await fetch(`/api/devices?company_id=${userData.company_id}`);
              if (devicesRes.ok) {
                const devicesData = await devicesRes.json();
                setDevices(devicesData.devices || []);
                if (devicesData.devices && devicesData.devices.length === 1) {
                  setSelectedDevice(devicesData.devices[0].id.toString());
                }
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
          setSelectedDevice("");
          if (data.devices && data.devices.length === 1) {
            setSelectedDevice(data.devices[0].id.toString());
          }
        }
      } catch (err) {
        console.error("Error cargando devices:", err);
      }
    }
    loadDevices();
  }, [selectedCompany]);

  // Función para detectar cortes de luz y períodos sin datos
  const detectarCortes = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!fechaDesde || !fechaHasta) {
        throw new Error('Debe seleccionar fecha desde y fecha hasta');
      }

      const start = new Date(fechaDesde);
      const end = new Date(fechaHasta);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      if (days < 1) {
        throw new Error('El rango mínimo es de 1 día');
      }

      // Requerir dispositivo seleccionado
      if (!selectedDevice) {
        throw new Error('Debe seleccionar un dispositivo');
      }

      // Construir URL para el endpoint de cortes de luz
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        min_voltage: umbralVoltajeMinimo.toString(),
        max_gap_minutes: '10',
      });

      const device = devices.find(d => d.id.toString() === selectedDevice);
      if (!device) {
        throw new Error('Dispositivo seleccionado no encontrado');
      }
      
      if (device?.code) {
        params.append('device', device.code);
      } else {
        params.append('device', selectedDevice);
      }

      const url = `${FLASK_API_URL}/metrics/power-outages?${params.toString()}`;
      console.log('[Cortes Luz] Consultando:', url);

      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!Array.isArray(result) || result.length === 0) {
        setCortes([]);
        setLoading(false);
        return;
      }

      // El backend ya procesa los datos y retorna los cortes detectados
      const cortesDetectados: CorteLuz[] = result.map((item: any) => {
        const fechaInicio = new Date(item.start);
        const fechaFin = new Date(item.end);
        
        return {
          fechaInicio: fechaInicio.toISOString(),
          fechaFin: fechaFin.toISOString(),
          duracion: item.duration_formatted || formatDuration(item.duration_seconds),
          tipo: item.type === 'power_outage' ? 'Corte de luz' : 'Sin datos',
          voltajeMinimo: item.min_voltage ?? null,
          voltajeMaximo: item.max_voltage ?? null,
          dispositivo: item.device || 'Desconocido',
        };
      });

      setCortes(cortesDetectados);
    } catch (error: any) {
      console.error('Error detectando cortes:', error);
      setError(error.message || 'Error al detectar cortes de luz');
      setCortes([]);
    } finally {
      setLoading(false);
    }
  };

  // Función para formatear duración
  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  // Función para exportar a PDF
  const exportarPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Reporte de Cortes de Luz', 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Período: ${fechaDesde?.toLocaleDateString('es-ES')} - ${fechaHasta?.toLocaleDateString('es-ES')}`, 14, 30);
    
    if (cortes.length === 0) {
      doc.setFontSize(12);
      doc.text('No se detectaron cortes de luz ni períodos sin datos.', 14, 40);
      doc.save('reporte-cortes-luz.pdf');
      return;
    }

    const tableData = cortes.map(corte => [
      new Date(corte.fechaInicio).toLocaleString('es-ES'),
      new Date(corte.fechaFin).toLocaleString('es-ES'),
      corte.duracion,
      corte.tipo,
      corte.voltajeMinimo !== null ? `${corte.voltajeMinimo.toFixed(2)} V` : 'N/A',
      corte.dispositivo
    ]);

    autoTable(doc, {
      head: [['Inicio', 'Fin', 'Duración', 'Tipo', 'Voltaje Mín.', 'Dispositivo']],
      body: tableData,
      startY: 40,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] }
    });

    doc.save('reporte-cortes-luz.pdf');
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <MainMenu />
        <Box sx={{ flexGrow: 1, p: 3 }}>
          <Typography variant="h4" gutterBottom>
            Reporte de Cortes de Luz
          </Typography>
          
          <Paper sx={{ p: 3, mt: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(currentUser?.role === "admin" || currentUser?.role === "super_admin") && (
                <FormControl fullWidth>
                  <InputLabel>Compañía</InputLabel>
                  <Select
                    value={selectedCompany}
                    label="Compañía"
                    onChange={(e) => setSelectedCompany(e.target.value)}
                  >
                    {companies.map((company) => (
                      <MenuItem key={company.id} value={company.id.toString()}>
                        {company.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <FormControl fullWidth>
                <InputLabel>Dispositivo</InputLabel>
                <Select
                  value={selectedDevice}
                  label="Dispositivo"
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  disabled={!selectedCompany}
                >
                  {devices.map((device) => (
                    <MenuItem key={device.id} value={device.id.toString()}>
                      {device.name} {device.code ? `(${device.code})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <DatePicker
                  label="Fecha desde"
                  value={fechaDesde}
                  onChange={(newValue) => setFechaDesde(newValue)}
                  format="dd/MM/yyyy"
                />
                <DatePicker
                  label="Fecha hasta"
                  value={fechaHasta}
                  onChange={(newValue) => setFechaHasta(newValue)}
                  format="dd/MM/yyyy"
                />
                <TextField
                  label="Umbral voltaje mínimo (V)"
                  type="number"
                  value={umbralVoltajeMinimo}
                  onChange={(e) => setUmbralVoltajeMinimo(parseFloat(e.target.value) || 50)}
                  sx={{ width: 200 }}
                />
              </Box>

              <Button
                variant="contained"
                onClick={detectarCortes}
                disabled={loading || !fechaDesde || !fechaHasta || !selectedDevice}
                sx={{ width: 'fit-content' }}
              >
                {loading ? <CircularProgress size={24} /> : 'Detectar Cortes'}
              </Button>
            </Box>
          </Paper>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {cortes.length > 0 && (
            <Paper sx={{ p: 3, mt: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Cortes de Luz Detectados ({cortes.length})
                </Typography>
                <Button variant="outlined" onClick={exportarPDF}>
                  Exportar PDF
                </Button>
              </Box>

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Inicio</TableCell>
                      <TableCell>Fin</TableCell>
                      <TableCell>Duración</TableCell>
                      <TableCell>Tipo</TableCell>
                      <TableCell>Voltaje Mín.</TableCell>
                      <TableCell>Voltaje Máx.</TableCell>
                      <TableCell>Dispositivo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cortes.map((corte, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {new Date(corte.fechaInicio).toLocaleString('es-ES')}
                        </TableCell>
                        <TableCell>
                          {new Date(corte.fechaFin).toLocaleString('es-ES')}
                        </TableCell>
                        <TableCell>{corte.duracion}</TableCell>
                        <TableCell>{corte.tipo}</TableCell>
                        <TableCell>
                          {corte.voltajeMinimo !== null ? `${corte.voltajeMinimo.toFixed(2)} V` : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {corte.voltajeMaximo !== null ? `${corte.voltajeMaximo.toFixed(2)} V` : 'N/A'}
                        </TableCell>
                        <TableCell>{corte.dispositivo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {!loading && cortes.length === 0 && fechaDesde && fechaHasta && (
            <Alert severity="info" sx={{ mt: 2 }}>
              No se detectaron cortes de luz ni períodos sin datos en el período seleccionado.
            </Alert>
          )}
        </Box>
      </Box>
    </LocalizationProvider>
  );
}

