'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import MainMenu from '@/components/MainMenu';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { es } from 'date-fns/locale';

interface Alerta {
  fecha: string; // ISO date (YYYY-MM-DD)
  tipo: 'Alta tensión' | 'Baja tensión' | 'Alto consumo';
  mensaje: string;
  valor?: string;
  dispositivo?: string;
}

const mockAlertas: Alerta[] = [
  { fecha: '2023-06-01', tipo: 'Alta tensión', mensaje: 'Alerta de alta tensión', valor: '251 V', dispositivo: 'Medidor #1' },
  { fecha: '2023-06-02', tipo: 'Baja tensión', mensaje: 'Alerta de baja tensión', valor: '190 V', dispositivo: 'Medidor #2' },
  { fecha: '2023-06-03', tipo: 'Alto consumo', mensaje: 'Alerta de alto consumo de energía', valor: '2.30 kWh', dispositivo: 'Medidor #1' },
  { fecha: '2023-06-04', tipo: 'Alta tensión', mensaje: 'Alerta de alta tensión', valor: '248 V', dispositivo: 'Medidor #3' },
  { fecha: '2023-06-05', tipo: 'Baja tensión', mensaje: 'Alerta de baja tensión', valor: '185 V', dispositivo: 'Medidor #1' },
  { fecha: '2023-06-06', tipo: 'Alto consumo', mensaje: 'Alerta de alto consumo de energía', valor: '1.95 kWh', dispositivo: 'Medidor #2' },
  { fecha: '2023-06-07', tipo: 'Alta tensión', mensaje: 'Alerta de alta tensión', valor: '253 V', dispositivo: 'Medidor #3' }
];

export default function PanelAlertas() {
  const [fechaDesde, setFechaDesde] = useState<Date | null>(new Date(2023, 5, 1));
  const [fechaHasta, setFechaHasta] = useState<Date | null>(new Date(2023, 5, 7));
  const [loading, setLoading] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  const fetchAlertas = async () => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (fechaDesde && fechaHasta) {
        const desdeStr = fechaDesde.toISOString().split('T')[0];
        const hastaStr = fechaHasta.toISOString().split('T')[0];
        const filtradas = mockAlertas.filter((a) => a.fecha >= desdeStr && a.fecha <= hastaStr);
        setAlertas(filtradas);
      } else {
        setAlertas(mockAlertas);
      }
    } catch (e) {
      console.error('Error obteniendo alertas:', e);
      setAlertas(mockAlertas);
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

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Filtros de búsqueda
        </Typography>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <DatePicker
                label="Fecha desde"
                value={fechaDesde}
                onChange={(newValue) => setFechaDesde(newValue)}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                minDate={new Date(2020, 0, 1)}
                maxDate={new Date(2025, 11, 31)}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <DatePicker
                label="Fecha hasta"
                value={fechaHasta}
                onChange={(newValue) => setFechaHasta(newValue)}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                minDate={fechaDesde || new Date(2020, 0, 1)}
                maxDate={new Date(2025, 11, 31)}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <Button
                variant="contained"
                onClick={aplicarFiltros}
                disabled={loading}
                fullWidth
              >
                {loading ? <CircularProgress size={24} /> : 'Consultar'}
              </Button>
            </Grid>
          </Grid>
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
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : alertas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No hay alertas en el periodo seleccionado
                  </TableCell>
                </TableRow>
              ) : (
                alertas.map((a, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell>{a.fecha}</TableCell>
                    <TableCell>{a.tipo}</TableCell>
                    <TableCell>{a.valor || '-'}</TableCell>
                    <TableCell>{a.mensaje}</TableCell>
                    <TableCell>{a.dispositivo || '-'}</TableCell>
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