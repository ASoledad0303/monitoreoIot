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
  TextField
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
  voltaje: number;
  corriente: number;
  potencia: number;
  energiaAcumulada: number;
}

// Datos mock para simular la respuesta del backend
const mockData: ConsumoData[] = [
  { fecha: '2023-06-01', voltaje: 220.5, corriente: 5.2, potencia: 1146.6, energiaAcumulada: 1.15 },
  { fecha: '2023-06-02', voltaje: 219.8, corriente: 4.9, potencia: 1077.0, energiaAcumulada: 1.08 },
  { fecha: '2023-06-03', voltaje: 221.2, corriente: 5.5, potencia: 1216.6, energiaAcumulada: 1.22 },
  { fecha: '2023-06-04', voltaje: 220.1, corriente: 5.0, potencia: 1100.5, energiaAcumulada: 1.10 },
  { fecha: '2023-06-05', voltaje: 219.5, corriente: 4.8, potencia: 1053.6, energiaAcumulada: 1.05 },
  { fecha: '2023-06-06', voltaje: 220.8, corriente: 5.3, potencia: 1170.2, energiaAcumulada: 1.17 },
  { fecha: '2023-06-07', voltaje: 221.0, corriente: 5.4, potencia: 1193.4, energiaAcumulada: 1.19 },
];

export default function ReporteConsumo() {
  const [fechaDesde, setFechaDesde] = useState<Date | null>(new Date(2023, 5, 1)); // 1 de junio de 2023
  const [fechaHasta, setFechaHasta] = useState<Date | null>(new Date(2023, 5, 7)); // 7 de junio de 2023
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ConsumoData[]>([]);

  // Función para obtener datos del backend (simulada con mocks)
  const fetchData = async () => {
    setLoading(true);
    try {
      // Simular llamada al backend
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // En un caso real, aquí iría la llamada fetch al backend con las fechas formateadas
      // const fechaDesdeStr = fechaDesde ? fechaDesde.toISOString().split('T')[0] : '';
      // const fechaHastaStr = fechaHasta ? fechaHasta.toISOString().split('T')[0] : '';
      // const response = await fetch(`/api/consumo?fechaDesde=${fechaDesdeStr}&fechaHasta=${fechaHastaStr}`);
      // const data = await response.json();
      
      // Filtramos los datos mock según el rango de fechas seleccionado
      if (fechaDesde && fechaHasta) {
        const fechaDesdeStr = fechaDesde.toISOString().split('T')[0];
        const fechaHastaStr = fechaHasta.toISOString().split('T')[0];
        
        const filteredData = mockData.filter(item => {
          return item.fecha >= fechaDesdeStr && item.fecha <= fechaHastaStr;
        });
        
        setData(filteredData);
      } else {
        setData(mockData);
      }
    } catch (error) {
      console.error('Error al obtener datos:', error);
      // En caso de error, seguimos usando los mocks
      setData(mockData);
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
    
    return {
      voltaje: parseFloat((data.reduce((sum, item) => sum + item.voltaje, 0) / data.length).toFixed(2)),
      corriente: parseFloat((data.reduce((sum, item) => sum + item.corriente, 0) / data.length).toFixed(2)),
      potencia: parseFloat((data.reduce((sum, item) => sum + item.potencia, 0) / data.length).toFixed(2)),
      energiaAcumulada: parseFloat(data.reduce((sum, item) => sum + item.energiaAcumulada, 0).toFixed(2))
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
      row.voltaje.toFixed(2),
      row.corriente.toFixed(2),
      row.potencia.toFixed(2),
      row.energiaAcumulada.toFixed(2)
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
      
      {/* Filtros */}
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
                slotProps={{ 
                  textField: { 
                    fullWidth: true, 
                    size: "small" 
                  } 
                }}
                minDate={new Date(2020, 0, 1)}
                maxDate={new Date(2025, 11, 31)}
              />
            </Grid>
            
            <Grid item xs={12} sm={3}>
              <DatePicker
                label="Fecha hasta"
                value={fechaHasta}
                onChange={(newValue) => setFechaHasta(newValue)}
                slotProps={{ 
                  textField: { 
                    fullWidth: true, 
                    size: "small" 
                  } 
                }}
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

            <Grid item xs={12} sm={3}>
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
            </Grid>
          </Grid>
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
                      <TableCell align="right">{row.voltaje.toFixed(2)}</TableCell>
                      <TableCell align="right">{row.corriente.toFixed(2)}</TableCell>
                      <TableCell align="right">{row.potencia.toFixed(2)}</TableCell>
                      <TableCell align="right">{row.energiaAcumulada.toFixed(2)}</TableCell>
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