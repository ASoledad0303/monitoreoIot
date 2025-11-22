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
  Divider,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip
} from '@mui/material';
import MainMenu from '@/components/MainMenu';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// URL de la API Flask (puede configurarse con NEXT_PUBLIC_FLASK_API_URL)
const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5000';

// Tipos para los datos
interface ConsumoData {
  fecha: string;
  voltaje: number | null;
  corriente: number | null;
  potencia: number | null;
  energiaAcumulada: number | null;
}

// Tipo para datos agrupados por hora
interface ConsumoDataPorHora {
  fechaHora: string; // Fecha y hora (YYYY-MM-DD HH:00)
  timestamp: number; // Timestamp en ms (inicio de la hora)
  voltaje: number | null;
  corriente: number | null;
  potencia: number | null;
  consumoHora: number | null; // Consumo de esa hora específica (kWh)
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

export default function ReporteConsumo() {
  const [fechaDesde, setFechaDesde] = useState<Date | null>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [fechaHasta, setFechaHasta] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ConsumoData[]>([]);
  const [dataPorHora, setDataPorHora] = useState<ConsumoDataPorHora[]>([]);
  const [vistaPorHora, setVistaPorHora] = useState<boolean>(true); // Por defecto mostrar vista por hora
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
        console.log('[Reportes] Cargando datos iniciales...');
        const userRes = await fetch("/api/auth/me");
        if (userRes.ok) {
          const userData = await userRes.json();
          console.log('[Reportes] Usuario cargado:', userData);
          setCurrentUser(userData);
          
          // Si es admin, cargar todas las companies
          if (userData.role === "admin" || userData.role === "super_admin") {
            console.log('[Reportes] Usuario es admin/super_admin, cargando companies...');
            const companiesRes = await fetch("/api/companies");
            console.log('[Reportes] Response companies:', companiesRes.status, companiesRes.statusText);
            if (companiesRes.ok) {
              const companiesData = await companiesRes.json();
              console.log('[Reportes] Companies recibidas:', companiesData);
              setCompanies(companiesData.companies || []);
              // Si solo hay una company, seleccionarla automáticamente
              if (companiesData.companies && companiesData.companies.length === 1) {
                console.log('[Reportes] Solo hay una company, seleccionándola automáticamente:', companiesData.companies[0].id);
                setSelectedCompany(companiesData.companies[0].id.toString());
                // Cargar devices de esa company automáticamente
                const devicesRes = await fetch(`/api/devices?company_id=${companiesData.companies[0].id}`);
                console.log('[Reportes] Response devices:', devicesRes.status, devicesRes.statusText);
                if (devicesRes.ok) {
                  const devicesData = await devicesRes.json();
                  console.log('[Reportes] Devices cargados para admin:', devicesData.devices);
                  setDevices(devicesData.devices || []);
                  // Si solo hay un dispositivo, seleccionarlo automáticamente
                  if (devicesData.devices && devicesData.devices.length === 1) {
                    setSelectedDevice(devicesData.devices[0].id.toString());
                  }
                } else {
                  const errorText = await devicesRes.text();
                  console.error('[Reportes] Error cargando devices:', errorText);
                }
              }
            } else {
              const errorText = await companiesRes.text();
              console.error('[Reportes] Error cargando companies:', errorText);
            }
          } else {
            // Si es user, solo necesita su company (se filtrará automáticamente)
            // Pero podemos cargar devices de su company
            console.log('[Reportes] Usuario es user, company_id:', userData.company_id);
            if (userData.company_id) {
              // Seleccionar automáticamente la company del usuario
              setSelectedCompany(userData.company_id.toString());
              // Cargar devices de su company
              const devicesRes = await fetch(`/api/devices?company_id=${userData.company_id}`);
              console.log('[Reportes] Response devices para user:', devicesRes.status, devicesRes.statusText);
              if (devicesRes.ok) {
                const devicesData = await devicesRes.json();
                console.log('[Reportes] Devices cargados para user:', devicesData.devices);
                setDevices(devicesData.devices || []);
                // Si solo hay un dispositivo, seleccionarlo automáticamente
                if (devicesData.devices && devicesData.devices.length === 1) {
                  setSelectedDevice(devicesData.devices[0].id.toString());
                }
              } else {
                const errorText = await devicesRes.text();
                console.error('[Reportes] Error cargando devices para user:', errorText);
              }
            } else {
              console.warn('[Reportes] Usuario no tiene company_id asignado');
            }
          }
        } else {
          const errorText = await userRes.text();
          console.error('[Reportes] Error cargando usuario:', errorText);
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
        console.log('[Reportes] Cargando devices para company_id:', selectedCompany);
        const res = await fetch(`/api/devices?company_id=${selectedCompany}`);
        console.log('[Reportes] Response devices al cambiar company:', res.status, res.statusText);
        if (res.ok) {
          const data = await res.json();
          console.log('[Reportes] Devices cargados al cambiar company:', data.devices);
          setDevices(data.devices || []);
          setSelectedDevice(""); // Reset device selection
          // Si solo hay un dispositivo, seleccionarlo automáticamente
          if (data.devices && data.devices.length === 1) {
            setSelectedDevice(data.devices[0].id.toString());
          }
        } else {
          const errorText = await res.text();
          console.error('[Reportes] Error cargando devices al cambiar company:', errorText);
        }
      } catch (err) {
        console.error("Error cargando devices:", err);
      }
    }
    loadDevices();
  }, [selectedCompany]);

  // Función para obtener datos del backend usando el endpoint inteligente
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Validar fechas
      if (!fechaDesde || !fechaHasta) {
        throw new Error('Debe seleccionar fecha desde y fecha hasta');
      }

      const start = new Date(fechaDesde);
      const end = new Date(fechaHasta);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      if (days < 1) {
        throw new Error('El rango mínimo es de 1 día');
      }

      // Construir URL para el endpoint inteligente /metrics/history-smart
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });

      // Requerir dispositivo seleccionado
      if (!selectedDevice) {
        throw new Error('Debe seleccionar un dispositivo');
      }

      // Buscar el código del dispositivo en la lista de devices
      const device = devices.find(d => d.id.toString() === selectedDevice);
      console.log('[Reportes] Device encontrado:', device);
      if (!device) {
        throw new Error('Dispositivo seleccionado no encontrado');
      }
      
      if (device?.code) {
        params.append('device', device.code);
        console.log('[Reportes] Usando código del dispositivo:', device.code);
      } else {
        // Si no hay código, usar el ID como fallback
        params.append('device', selectedDevice);
        console.log('[Reportes] Usando ID del dispositivo (sin código):', selectedDevice);
      }

      const url = `${FLASK_API_URL}/metrics/history-smart?${params.toString()}`;
      console.log('[Reportes] Consultando:', url);
      console.log('[Reportes] Devices disponibles:', devices);
      console.log('[Reportes] Selected Device:', selectedDevice);

      const response = await fetch(url);
      console.log('[Reportes] Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Reportes] Error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || 'Error desconocido' };
        }
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[Reportes] Resultado recibido:', result?.length || 0, 'registros');
      console.log('[Reportes] Primeros 3 registros (muestra):', result?.slice(0, 3));
      
      // IMPORTANTE: El backend retorna datos con timestamps precisos (hora/minuto)
      // El formato es: [{ ts, device, vrms, irms, s_apparent_va, potencia_activa, factor_potencia }, ...]
      // donde 'ts' es un timestamp en milisegundos con precisión de hora y minuto
      
      // Primero mapear y ordenar por timestamp (manteniendo la granularidad de hora/minuto)
      interface RawDataItem {
        fecha: string; // Fecha en formato YYYY-MM-DD para agrupar
        timestamp: number; // Timestamp preciso en ms (hora/minuto)
        voltaje: number | null;
        corriente: number | null;
        potencia: number | null;
      }
      
      const rawData: RawDataItem[] = (result || []).map((item: any) => {
        // Convertir timestamp a milisegundos si viene en segundos
        const ts = item.ts > 1000000000000 ? item.ts : item.ts * 1000;
        // Extraer solo la fecha (YYYY-MM-DD) para agrupar por día
        const fecha = item.ts 
          ? new Date(ts).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        
        return {
          fecha, // Solo para agrupar
          timestamp: ts, // Timestamp preciso (hora/minuto) - se usa para calcular energía
          voltaje: item.vrms ?? null,
          corriente: item.irms ?? null,
          potencia: item.potencia_activa ?? null,
        };
      }).sort((a: RawDataItem, b: RawDataItem) => a.timestamp - b.timestamp);

      // AGRUPAR POR DÍA: Los datos del sistema se almacenan con precisión de hora/minuto,
      // pero para el reporte los agrupamos por día y calculamos el consumo diario total
      const dailyData = new Map<string, {
        fecha: string;
        voltaje: number[];
        corriente: number[];
        potencia: number[];
        timestamps: number[];
        potencias: number[];
      }>();

      rawData.forEach(item => {
        if (!dailyData.has(item.fecha)) {
          dailyData.set(item.fecha, {
            fecha: item.fecha,
            voltaje: [],
            corriente: [],
            potencia: [],
            timestamps: [],
            potencias: [],
          });
        }
        
        const dayData = dailyData.get(item.fecha)!;
        if (item.voltaje !== null) dayData.voltaje.push(item.voltaje);
        if (item.corriente !== null) dayData.corriente.push(item.corriente);
        if (item.potencia !== null) {
          dayData.potencia.push(item.potencia);
          dayData.potencias.push(item.potencia);
        }
        dayData.timestamps.push(item.timestamp);
      });

      // Calcular consumo diario total (energía en kWh) usando los timestamps precisos
      // Energía = integral de potencia sobre el tiempo
      // Usamos los timestamps precisos (hora/minuto) para calcular intervalos exactos
      const mappedData: ConsumoData[] = Array.from(dailyData.values()).map(dayData => {
        // Calcular promedios
        const voltajePromedio = dayData.voltaje.length > 0
          ? dayData.voltaje.reduce((sum, v) => sum + v, 0) / dayData.voltaje.length
          : null;
        
        const corrientePromedio = dayData.corriente.length > 0
          ? dayData.corriente.reduce((sum, c) => sum + c, 0) / dayData.corriente.length
          : null;
        
        const potenciaPromedio = dayData.potencia.length > 0
          ? dayData.potencia.reduce((sum, p) => sum + p, 0) / dayData.potencia.length
          : null;

        // Calcular consumo diario total (energía en kWh)
        // Si hay múltiples mediciones, calcular la integral de potencia
        let energiaAcumulada = 0;
        if (dayData.timestamps.length > 1 && dayData.potencias.length > 0) {
          // Calcular energía como suma de (potencia * intervalo_tiempo)
          for (let i = 0; i < dayData.timestamps.length - 1; i++) {
            const tiempoInicio = dayData.timestamps[i];
            const tiempoFin = dayData.timestamps[i + 1];
            const intervaloHoras = (tiempoFin - tiempoInicio) / (1000 * 60 * 60); // Convertir ms a horas
            const potenciaPromedioIntervalo = dayData.potencias[i] || 0;
            // Energía en kWh = potencia (kW) * tiempo (horas)
            energiaAcumulada += (potenciaPromedioIntervalo / 1000) * intervaloHoras; // Convertir W a kW
          }
          // Agregar el último intervalo (hasta el final del día o siguiente medición)
          if (dayData.potencias.length > 0) {
            const ultimoIntervalo = dayData.timestamps.length > 1
              ? (dayData.timestamps[dayData.timestamps.length - 1] - dayData.timestamps[dayData.timestamps.length - 2]) / (1000 * 60 * 60)
              : 1 / 24; // Si solo hay una medición, asumir 1 hora
            const ultimaPotencia = dayData.potencias[dayData.potencias.length - 1] || 0;
            energiaAcumulada += (ultimaPotencia / 1000) * ultimoIntervalo;
          }
        } else if (dayData.potencias.length === 1) {
          // Si solo hay una medición, estimar consumo diario asumiendo potencia constante
          const potencia = dayData.potencias[0];
          energiaAcumulada = (potencia / 1000) * 24; // 24 horas a potencia constante
        }

        return {
          fecha: dayData.fecha,
          voltaje: voltajePromedio ? parseFloat(voltajePromedio.toFixed(2)) : null,
          corriente: corrientePromedio ? parseFloat(corrientePromedio.toFixed(2)) : null,
          potencia: potenciaPromedio ? parseFloat(potenciaPromedio.toFixed(2)) : null,
          energiaAcumulada: energiaAcumulada > 0 ? parseFloat(energiaAcumulada.toFixed(3)) : null,
        };
      });

      // Ordenar por fecha (más antiguo primero)
      mappedData.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      
      console.log('[Reportes] Datos agrupados por día:', mappedData.length, 'días');
      console.log('[Reportes] Muestra de datos agrupados:', mappedData.slice(0, 5));
      
      // Verificar que realmente solo hay un registro por día
      const fechasUnicas = new Set(mappedData.map(d => d.fecha));
      if (fechasUnicas.size !== mappedData.length) {
        console.warn('[Reportes] ADVERTENCIA: Hay días duplicados en los datos');
      }
      
      // Preparar datos agrupados por hora para visualización
      // Agrupar todos los registros por hora (YYYY-MM-DD HH:00)
      const datosPorHora = new Map<string, {
        fechaHora: string;
        timestamp: number; // Timestamp del inicio de la hora
        voltaje: number[];
        corriente: number[];
        potencia: number[];
        timestamps: number[];
        potencias: number[];
      }>();
      
      rawData.forEach((item) => {
        // Obtener fecha y hora (sin minutos ni segundos)
        const fechaHoraObj = new Date(item.timestamp);
        const año = fechaHoraObj.getFullYear();
        const mes = String(fechaHoraObj.getMonth() + 1).padStart(2, '0');
        const dia = String(fechaHoraObj.getDate()).padStart(2, '0');
        const hora = String(fechaHoraObj.getHours()).padStart(2, '0');
        // Clave para agrupar: YYYY-MM-DD HH (para ordenamiento correcto)
        const fechaHoraKey = `${año}-${mes}-${dia} ${hora}:00`;
        // Formato para mostrar: DD/MM/YYYY HH:00
        const fechaHoraDisplay = `${dia}/${mes}/${año} ${hora}:00`;
        
        // Timestamp del inicio de la hora (para ordenar)
        const timestampInicioHora = new Date(año, fechaHoraObj.getMonth(), fechaHoraObj.getDate(), fechaHoraObj.getHours(), 0, 0).getTime();
        
        if (!datosPorHora.has(fechaHoraKey)) {
          datosPorHora.set(fechaHoraKey, {
            fechaHora: fechaHoraDisplay,
            timestamp: timestampInicioHora,
            voltaje: [],
            corriente: [],
            potencia: [],
            timestamps: [],
            potencias: [],
          });
        }
        
        const horaData = datosPorHora.get(fechaHoraKey)!;
        if (item.voltaje !== null) horaData.voltaje.push(item.voltaje);
        if (item.corriente !== null) horaData.corriente.push(item.corriente);
        if (item.potencia !== null) {
          horaData.potencia.push(item.potencia);
          horaData.potencias.push(item.potencia);
        }
        horaData.timestamps.push(item.timestamp);
      });
      
      // Calcular promedios y consumo por hora
      const dataPorHora: ConsumoDataPorHora[] = Array.from(datosPorHora.values()).map(horaData => {
        // Calcular promedios
        const voltajePromedio = horaData.voltaje.length > 0
          ? horaData.voltaje.reduce((sum, v) => sum + v, 0) / horaData.voltaje.length
          : null;
        
        const corrientePromedio = horaData.corriente.length > 0
          ? horaData.corriente.reduce((sum, c) => sum + c, 0) / horaData.corriente.length
          : null;
        
        const potenciaPromedio = horaData.potencia.length > 0
          ? horaData.potencia.reduce((sum, p) => sum + p, 0) / horaData.potencia.length
          : null;
        
        // Calcular consumo de esa hora específica (kWh)
        let consumoHora = 0;
        if (horaData.timestamps.length > 1 && horaData.potencias.length > 0) {
          // Calcular energía como suma de (potencia * intervalo_tiempo) dentro de la hora
          for (let i = 0; i < horaData.timestamps.length - 1; i++) {
            const tiempoInicio = horaData.timestamps[i];
            const tiempoFin = horaData.timestamps[i + 1];
            const intervaloHoras = (tiempoFin - tiempoInicio) / (1000 * 60 * 60);
            const potenciaPromedioIntervalo = horaData.potencias[i] || 0;
            consumoHora += (potenciaPromedioIntervalo / 1000) * intervaloHoras;
          }
          // Agregar el último intervalo de la hora
          if (horaData.potencias.length > 0 && horaData.timestamps.length > 1) {
            const ultimoIntervalo = (horaData.timestamps[horaData.timestamps.length - 1] - horaData.timestamps[horaData.timestamps.length - 2]) / (1000 * 60 * 60);
            const ultimaPotencia = horaData.potencias[horaData.potencias.length - 1] || 0;
            consumoHora += (ultimaPotencia / 1000) * ultimoIntervalo;
          }
        } else if (horaData.potencias.length === 1) {
          // Si solo hay una medición en la hora, estimar consumo asumiendo potencia constante durante 1 hora
          const potencia = horaData.potencias[0];
          consumoHora = (potencia / 1000) * 1; // 1 hora
        }
        
        return {
          fechaHora: horaData.fechaHora,
          timestamp: horaData.timestamp,
          voltaje: voltajePromedio ? parseFloat(voltajePromedio.toFixed(2)) : null,
          corriente: corrientePromedio ? parseFloat(corrientePromedio.toFixed(2)) : null,
          potencia: potenciaPromedio ? parseFloat(potenciaPromedio.toFixed(2)) : null,
          consumoHora: consumoHora > 0 ? parseFloat(consumoHora.toFixed(3)) : null,
        };
      });
      
      // Ordenar por timestamp
      dataPorHora.sort((a, b) => a.timestamp - b.timestamp);
      
      console.log('[Reportes] Datos agrupados por hora:', dataPorHora.length, 'horas');
      console.log('[Reportes] Muestra de datos por hora:', dataPorHora.slice(0, 5));
      
      setData(mappedData); // Datos agrupados por día (para PDF)
      setDataPorHora(dataPorHora); // Datos agrupados por hora (para visualización)
    } catch (error: any) {
      console.error('Error al obtener datos:', error);
      setError(error.message || 'Error al cargar datos');
      setData([]);
      setDataPorHora([]);
    } finally {
      setLoading(false);
    }
  };


  // Función para aplicar filtros
  const aplicarFiltros = () => {
    fetchData();
  };

  // Calcular sumatorias (promedios y totales del período)
  const calcularSumatorias = () => {
    if (data.length === 0) return { voltaje: 0, corriente: 0, potencia: 0, energiaAcumulada: 0 };
    
    const validVoltaje = data.filter(item => item.voltaje !== null);
    const validCorriente = data.filter(item => item.corriente !== null);
    const validPotencia = data.filter(item => item.potencia !== null);
    const validEnergia = data.filter(item => item.energiaAcumulada !== null);
    
    return {
      voltaje: validVoltaje.length > 0
        ? parseFloat((validVoltaje.reduce((sum, item) => sum + (item.voltaje || 0), 0) / validVoltaje.length).toFixed(2))
        : 0,
      corriente: validCorriente.length > 0
        ? parseFloat((validCorriente.reduce((sum, item) => sum + (item.corriente || 0), 0) / validCorriente.length).toFixed(2))
        : 0,
      potencia: validPotencia.length > 0
        ? parseFloat((validPotencia.reduce((sum, item) => sum + (item.potencia || 0), 0) / validPotencia.length).toFixed(2))
        : 0,
      energiaAcumulada: parseFloat(validEnergia.reduce((sum, item) => sum + (item.energiaAcumulada || 0), 0).toFixed(3))
    };
  };

  const sumatorias = calcularSumatorias();

  // Función para generar el PDF
  // IMPORTANTE: El PDF muestra solo el resumen agrupado por día
  // Los datos del sistema se almacenan con precisión de hora/minuto,
  // pero el reporte siempre muestra el consumo diario total
  const generarPDF = () => {
    if (!fechaDesde || !fechaHasta || data.length === 0) return;

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
    doc.setFontSize(18);
    doc.text('Reporte de Consumo Eléctrico - Resumen Diario', 105, 15, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`Periodo: ${formatearFecha(fechaDesde)} - ${formatearFecha(fechaHasta)}`, 105, 22, { align: 'center' });
    
    // Nota importante sobre el resumen
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Nota: Los datos se almacenan con precisión de hora y minuto en el sistema.', 20, 28);
    doc.text('Este reporte muestra el consumo diario total agrupado por día.', 20, 32);
    doc.setTextColor(0, 0, 0);
    
    // Agregar resumen al inicio
    doc.setFontSize(10);
    doc.text(`Total de días reportados: ${data.length}`, 20, 40);
    doc.text(`Consumo total del período: ${sumatorias.energiaAcumulada.toFixed(3)} kWh`, 20, 46);
    doc.text(`Consumo promedio diario: ${(sumatorias.energiaAcumulada / data.length).toFixed(3)} kWh`, 20, 52);
    
    // Preparar datos para la tabla (SOLO consumo diario - resumen agrupado por día)
    const tableData = data.map(row => [
      row.fecha,
      (row.energiaAcumulada ?? 0).toFixed(3)
    ]);
    
    // Agregar fila de totales
    tableData.push([
      'TOTAL PERÍODO',
      sumatorias.energiaAcumulada.toFixed(3)
    ]);
    
    // Generar tabla automática - más compacta
    autoTable(doc, {
      head: [['Fecha', 'Consumo Diario Total (kWh)']],
      body: tableData,
      startY: 58,
      theme: 'striped',
      headStyles: { 
        fillColor: [66, 66, 66],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: { 
        fontSize: 8,
        cellPadding: 2
      },
      alternateRowStyles: { 
        fillColor: [245, 245, 245] 
      },
      styles: {
        cellPadding: 2,
        fontSize: 8,
        overflow: 'linebreak',
        cellWidth: 'wrap'
      },
      columnStyles: {
        0: { cellWidth: 60 }, // Fecha
        1: { cellWidth: 40, halign: 'right' } // Consumo
      },
      margin: { top: 48, left: 20, right: 20 }
    });
    
    // Agregar pie de página
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Página ${i} de ${pageCount}`, 105, 287, { align: 'center' });
      doc.text(`Generado el ${new Date().toLocaleDateString('es-ES')}`, 105, 292, { align: 'center' });
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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
            {/* Selector de Company (solo admin) */}
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

            {/* Selector de Device */}
            <FormControl fullWidth size="small">
              <InputLabel>Dispositivo</InputLabel>
              <Select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                label="Dispositivo"
                disabled={!selectedCompany && (currentUser?.role === "admin" || currentUser?.role === "super_admin")}
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
            {currentUser?.role !== "admin" && currentUser?.role !== "super_admin" && <Box />}
          </Box>

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
                disabled={loading || !fechaDesde || !fechaHasta || !selectedDevice}
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
      
      {/* Tabla de datos - Vista detallada (hora/minuto) o resumen diario */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
            <strong>Nota:</strong> Los datos se almacenan con precisión de hora y minuto en el sistema.
            {vistaPorHora 
              ? ' Esta tabla muestra datos agrupados por hora con promedios y consumo por hora.'
              : ' Esta tabla muestra un resumen diario con promedios y consumo total por día.'}
          </Typography>
          <ToggleButtonGroup
            value={vistaPorHora ? 'porHora' : 'resumen'}
            exclusive
            onChange={(e, newValue) => {
              if (newValue !== null) {
                setVistaPorHora(newValue === 'porHora');
              }
            }}
            size="small"
            sx={{ ml: 2 }}
          >
            <ToggleButton value="porHora" aria-label="vista por hora">
              <Tooltip title="Ver datos agrupados por hora">
                <span>Vista por Hora</span>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="resumen" aria-label="vista resumen">
              <Tooltip title="Ver resumen diario">
                <span>Vista Resumen</span>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table stickyHeader aria-label="tabla de consumo">
            <TableHead>
              <TableRow>
                {vistaPorHora ? (
                  <>
                    <TableCell>Fecha y Hora</TableCell>
                    <TableCell align="right">Voltaje Prom. (V)</TableCell>
                    <TableCell align="right">Corriente Prom. (A)</TableCell>
                    <TableCell align="right">Potencia Prom. (W)</TableCell>
                    <TableCell align="right">Consumo por Hora (kWh)</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>Fecha</TableCell>
                    <TableCell align="right">Voltaje Prom. (V)</TableCell>
                    <TableCell align="right">Corriente Prom. (A)</TableCell>
                    <TableCell align="right">Potencia Prom. (W)</TableCell>
                    <TableCell align="right">Consumo Diario Total (kWh)</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : (vistaPorHora ? dataPorHora.length === 0 : data.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No hay datos disponibles
                  </TableCell>
                </TableRow>
              ) : vistaPorHora ? (
                <>
                  {dataPorHora.map((row, index) => (
                    <TableRow key={index} hover>
                      <TableCell component="th" scope="row">
                        {row.fechaHora}
                      </TableCell>
                      <TableCell align="right">{(row.voltaje ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{(row.corriente ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{(row.potencia ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{(row.consumoHora ?? 0).toFixed(3)}</TableCell>
                    </TableRow>
                  ))}
                </>
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
                      <TableCell align="right">{(row.energiaAcumulada ?? 0).toFixed(3)}</TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
            {/* Fila de sumatorias - solo en vista resumen */}
            {!vistaPorHora && data.length > 0 && (
              <TableBody>
                <TableRow sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                  <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                    TOTAL PERÍODO
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{sumatorias.voltaje}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{sumatorias.corriente}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{sumatorias.potencia}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{sumatorias.energiaAcumulada.toFixed(3)}</TableCell>
                </TableRow>
              </TableBody>
            )}
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}