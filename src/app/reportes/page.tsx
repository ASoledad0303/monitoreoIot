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
  Grid,
  Button,
  CircularProgress,
  Divider,
  TextField,
  Alert
} from '@mui/material';
import MainMenu from '@/components/MainMenu';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Tipos para los datos
interface ConsumoData {
  fecha: string;
  voltaje: number | null;
  corriente: number | null;
  potencia: number | null;
  energiaAcumulada: number | null;
}

export default function ReporteConsumo() {
  const [fechaDesde, setFechaDesde] = useState<Date | null>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [fechaHasta, setFechaHasta] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ConsumoData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Función para obtener datos del backend
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/telemetry';
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

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Error al obtener datos de consumo');
      }
      const result = await response.json();
      
      // Mapear datos de la API al formato esperado
      const mappedData: ConsumoData[] = (result.data || []).map((item: any) => ({
        fecha: item.fecha,
        voltaje: item.voltaje ?? 0,
        corriente: item.corriente ?? 0,
        potencia: item.potencia ?? 0,
        energiaAcumulada: item.energia_acumulada ?? 0,
      }));
      
      setData(mappedData);
    } catch (error: any) {
      console.error('Error al obtener datos:', error);
      setError(error.message || 'Error al cargar datos');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos al montar el componente
  useEffect(() => {
    fetchData();
  }, []);

  // Función para aplicar filtros
  const aplicarFiltros = () => {
    fetchData();
  };

  // Calcular sumatorias
  const calcularSumatorias = () => {
    if (data.length === 0) return { voltaje: 0, corriente: 0, potencia: 0, energiaAcumulada: 0 };
    
    const validData = data.filter(item => 
      item.voltaje !== null && item.corriente !== null && item.potencia !== null
    );
    
    if (validData.length === 0) return { voltaje: 0, corriente: 0, potencia: 0, energiaAcumulada: 0 };
    
    return {
      voltaje: parseFloat((validData.reduce((sum, item) => sum + (item.voltaje || 0), 0) / validData.length).toFixed(2)),
      corriente: parseFloat((validData.reduce((sum, item) => sum + (item.corriente || 0), 0) / validData.length).toFixed(2)),
      potencia: parseFloat((validData.reduce((sum, item) => sum + (item.potencia || 0), 0) / validData.length).toFixed(2)),
      energiaAcumulada: parseFloat(data.reduce((sum, item) => sum + (item.energiaAcumulada || 0), 0).toFixed(2))
    };
  };

  const sumatorias = calcularSumatorias();

  // Función para generar el PDF
  const generarPDF = () => {
    if (!fechaDesde || !fechaHasta) return;

    // Crear nuevo documento PDF en formato A4
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    // Formatear fechas para el encabezado
    const formatearFecha = (fecha: Date) => {
      return fecha.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    };
    
    // Agregar encabezado con periodo de facturación
    doc.setFontSize(16);
    doc.text('Reporte de Consumo Eléctrico', 105, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Periodo de facturación: ${formatearFecha(fechaDesde)} - ${formatearFecha(fechaHasta)}`, 105, 25, { align: 'center' });
    
    // Preparar datos para la tabla
    const tableData = data.map(row => [
      row.fecha,
      (row.voltaje ?? 0).toFixed(2),
      (row.corriente ?? 0).toFixed(2),
      (row.potencia ?? 0).toFixed(2),
      (row.energiaAcumulada ?? 0).toFixed(2)
    ]);
    
    // Agregar fila de totales
    tableData.push([
      'PROMEDIO/TOTAL',
      sumatorias.voltaje.toString(),
      sumatorias.corriente.toString(),
      sumatorias.potencia.toString(),
      sumatorias.energiaAcumulada.toString()
    ]);
    
    // Generar tabla automática
    autoTable(doc, {
      head: [['Fecha', 'Voltaje (V)', 'Corriente (A)', 'Potencia (W)', 'Energía (kWh)']],
      body: tableData,
      startY: 35,
      theme: 'grid',
      headStyles: { fillColor: [66, 66, 66] },
      footStyles: { fillColor: [239, 239, 239], textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    
    // Agregar pie de página
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.text(`Página ${i} de ${pageCount}`, 105, 287, { align: 'center' });
    }
    
    // Guardar el PDF
    doc.save(`Reporte_Consumo_${formatearFecha(fechaDesde)}_${formatearFecha(fechaHasta)}.pdf`);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ mr: 2 }}>
          <MainMenu />
        </Box>
        <Typography variant="h4">
          Reporte de Consumo
        </Typography>
      </Box>
      <Divider sx={{ mb: 3 }} />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Filtros de búsqueda
        </Typography>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, gap: 2, alignItems: 'center' }}>
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
            <Box>
              <Button 
                variant="outlined" 
                color="primary"
                onClick={() => generarPDF()}
                disabled={loading || data.length === 0}
                fullWidth
                startIcon={<span role="img" aria-label="download">📥</span>}
              >
                Descargar PDF
              </Button>
            </Box>
          </Box>
        </LocalizationProvider>
      </Paper>
      
      {/* Tabla de datos */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table stickyHeader aria-label="tabla de consumo">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell align="right">Voltaje (V)</TableCell>
                <TableCell align="right">Corriente (A)</TableCell>
                <TableCell align="right">Potencia (W)</TableCell>
                <TableCell align="right">Energía (kWh)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No hay datos disponibles
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {data.map((row, index) => (
                    <TableRow key={index} hover>
                      <TableCell component="th" scope="row">
                        {row.fecha}
                      </TableCell>
                      <TableCell align="right">{(row.voltaje ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{(row.corriente ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{(row.potencia ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{(row.energiaAcumulada ?? 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
            {/* Fila de sumatorias */}
            {data.length > 0 && (
              <TableBody>
                <TableRow sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                  <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                    PROMEDIO/TOTAL
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{sumatorias.voltaje}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{sumatorias.corriente}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{sumatorias.potencia}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{sumatorias.energiaAcumulada}</TableCell>
                </TableRow>
              </TableBody>
            )}
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}