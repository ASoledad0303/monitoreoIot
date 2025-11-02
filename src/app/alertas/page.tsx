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
  Alert
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
}

export default function PanelAlertas() {
  const [fechaDesde, setFechaDesde] = useState<Date | null>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [fechaHasta, setFechaHasta] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [error, setError] = useState<string | null>(null);

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
                alertas.map((a) => (
                  <TableRow key={a.id || a.fecha} hover>
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