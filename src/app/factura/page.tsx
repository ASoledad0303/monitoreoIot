'use client';

import React, { useMemo, useState } from 'react';
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
  TableRow
} from '@mui/material';
import MainMenu from '@/components/MainMenu';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { es } from 'date-fns/locale';

// Mock de consumo diario (similar al usado en reportes) para junio 2023
interface ConsumoDia {
  fecha: string; // YYYY-MM-DD
  potencia: number; // W promedio del día
}

const mockConsumoJunio: ConsumoDia[] = [
  { fecha: '2023-06-01', potencia: 1146.6 },
  { fecha: '2023-06-02', potencia: 1077.0 },
  { fecha: '2023-06-03', potencia: 1216.6 },
  { fecha: '2023-06-04', potencia: 1100.5 },
  { fecha: '2023-06-05', potencia: 1053.6 },
  { fecha: '2023-06-06', potencia: 1170.2 },
  { fecha: '2023-06-07', potencia: 1193.4 }
];

interface RegistroFactura {
  id: string;
  mesISO: string; // YYYY-MM
  potenciaFacturadaKW: number;
  potenciaMediaMedidaKW: number | null;
  diferenciaKW: number | null;
}

export default function CompararFactura() {
  const [mes, setMes] = useState<Date | null>(new Date(2023, 5, 1)); // junio 2023
  const [potenciaFacturadaKW, setPotenciaFacturadaKW] = useState<string>('');
  const [registros, setRegistros] = useState<RegistroFactura[]>([]);
  const [editId, setEditId] = useState<string | null>(null);

  const mesISO = useMemo(() => {
    if (!mes) return '';
    const year = mes.getFullYear();
    const month = `${mes.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
  }, [mes]);

  // Calcula la potencia media del mes seleccionado usando mocks (kW)
  const potenciaMediaMesKW = useMemo(() => {
    if (!mes) return null;
    const year = mes.getFullYear();
    const month = `${mes.getMonth() + 1}`.padStart(2, '0');
    const dias = mockConsumoJunio.filter((d) => d.fecha.startsWith(`${year}-${month}`));
    if (dias.length === 0) {
      return null; // no hay datos para el mes seleccionado
    }
    const promedioW = dias.reduce((sum, d) => sum + d.potencia, 0) / dias.length;
    return parseFloat((promedioW / 1000).toFixed(3)); // kW
  }, [mes]);

  const limpiarFormulario = () => {
    setPotenciaFacturadaKW('');
    setEditId(null);
  };

  const onAgregarActualizar = () => {
    const valorNum = parseFloat(potenciaFacturadaKW);
    if (isNaN(valorNum) || valorNum < 0) return;

    const diferencia = potenciaMediaMesKW != null ? parseFloat((valorNum - potenciaMediaMesKW).toFixed(3)) : null;

    if (editId) {
      setRegistros((prev) => prev.map((r) => (r.id === editId ? { ...r, mesISO, potenciaFacturadaKW: valorNum, potenciaMediaMedidaKW: potenciaMediaMesKW, diferenciaKW: diferencia } : r)));
    } else {
      const nuevo: RegistroFactura = {
        id: `${mesISO}-${Date.now()}`,
        mesISO,
        potenciaFacturadaKW: valorNum,
        potenciaMediaMedidaKW: potenciaMediaMesKW,
        diferenciaKW: diferencia
      };
      setRegistros((prev) => [nuevo, ...prev]);
    }
    limpiarFormulario();
  };

  const onEliminar = (id: string) => {
    setRegistros((prev) => prev.filter((r) => r.id !== id));
  };

  const onEditar = (id: string) => {
    const r = registros.find((x) => x.id === id);
    if (!r) return;
    const [year, month] = r.mesISO.split('-').map((x) => parseInt(x, 10));
    setMes(new Date(year, month - 1, 1));
    setPotenciaFacturadaKW(r.potenciaFacturadaKW.toString());
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

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Ingresar datos de factura
        </Typography>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <DatePicker
                label="Mes de facturación"
                value={mes}
                onChange={(newValue) => setMes(newValue)}
                views={["year", "month"]}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                minDate={new Date(2020, 0, 1)}
                maxDate={new Date(2025, 11, 31)}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Potencia activa facturada (kW)"
                value={potenciaFacturadaKW}
                onChange={(e) => setPotenciaFacturadaKW(e.target.value)}
                type="number"
                inputProps={{ step: '0.01', min: '0' }}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Button variant="contained" onClick={onAgregarActualizar} fullWidth>
                {editId ? 'Actualizar' : 'Agregar'}
              </Button>
            </Grid>
          </Grid>
        </LocalizationProvider>

        <Box sx={{ mt: 2, color: 'text.secondary' }}>
          <Typography variant="body2">
            Potencia media medida del mes: {potenciaMediaMesKW != null ? `${potenciaMediaMesKW} kW` : 'Sin datos'}
          </Typography>
          <Typography variant="body2">
            Diferencia: {potenciaMediaMesKW != null && potenciaFacturadaKW ? `${(parseFloat(potenciaFacturadaKW) - potenciaMediaMesKW).toFixed(3)} kW` : '-'}
          </Typography>
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
              {registros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">Aún no hay registros</TableCell>
                </TableRow>
              ) : (
                registros.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.mesISO}</TableCell>
                    <TableCell>{r.potenciaFacturadaKW.toFixed(3)}</TableCell>
                    <TableCell>{r.potenciaMediaMedidaKW != null ? r.potenciaMediaMedidaKW.toFixed(3) : '-'}</TableCell>
                    <TableCell>{r.diferenciaKW != null ? r.diferenciaKW.toFixed(3) : '-'}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="outlined" sx={{ mr: 1 }} onClick={() => onEditar(r.id)}>Editar</Button>
                      <Button size="small" color="error" variant="outlined" onClick={() => onEliminar(r.id)}>Eliminar</Button>
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