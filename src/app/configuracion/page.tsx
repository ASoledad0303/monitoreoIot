'use client';

import React, { useState, useContext, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Chip,
  Switch,
  FormControlLabel,
  CircularProgress
} from '@mui/material';
import {
  Lock as LockIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon
} from '@mui/icons-material';
import MainMenu from '@/components/MainMenu';
import { ColorModeContext } from '@/app/providers';

// Valores por defecto de umbrales
const defaultUmbrales = {
  voltajeMin: 200,
  voltajeMax: 250,
  potenciaMax: 5000
};

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  phone?: string;
}

export default function ConfiguracionPage() {
  // Estado del usuario
  const [user, setUser] = useState<User | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  // Estados para modales
  const [modalPassword, setModalPassword] = useState(false);
  const [modalPersonal, setModalPersonal] = useState(false);
  const [modalPoliticas, setModalPoliticas] = useState(false);
  const [modalUmbrales, setModalUmbrales] = useState(false);

  // Estados para formularios
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [personalForm, setPersonalForm] = useState({
    phone: '',
    email: ''
  });
  const [umbralesForm, setUmbralesForm] = useState(defaultUmbrales);

  // Estados de carga y mensajes
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { mode, toggleColorMode } = useContext(ColorModeContext);

  // Cargar información del usuario y umbrales
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          setPersonalForm({
            phone: data.phone || '',
            email: data.email
          });
        } else {
          console.error('Error obteniendo usuario');
        }
      } catch (error) {
        console.error('Error obteniendo usuario:', error);
      } finally {
        setUserLoading(false);
      }
    }
    
    async function fetchUmbrales() {
      try {
        const res = await fetch('/api/umbrales');
        if (res.ok) {
          const data = await res.json();
          setUmbralesForm({
            voltajeMin: data.voltaje_min || defaultUmbrales.voltajeMin,
            voltajeMax: data.voltaje_max || defaultUmbrales.voltajeMax,
            potenciaMax: data.potencia_max || defaultUmbrales.potenciaMax,
          });
        }
      } catch (error) {
        console.error('Error obteniendo umbrales:', error);
      }
    }

    fetchUser();
    fetchUmbrales();
  }, []);

  // Handlers para cambio de contraseña
  const handlePasswordSubmit = async () => {
    if (passwordForm.new !== passwordForm.confirm) {
      setMessage({ type: 'error', text: 'Las contraseñas nuevas no coinciden' });
      return;
    }
    const hasLen = passwordForm.new.length >= 8;
    const hasNum = /\d/.test(passwordForm.new);
    const hasSpecial = /[^A-Za-z0-9]/.test(passwordForm.new);
    if (!hasLen || !hasNum || !hasSpecial) {
      setMessage({ type: 'error', text: 'La contraseña debe tener mínimo 8 caracteres, incluir números y caracteres especiales.' });
      return;
    }

    setLoading(true);
    try {
      // Aquí iría la llamada al API
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simular API
      setMessage({ type: 'success', text: 'Contraseña actualizada correctamente' });
      setPasswordForm({ current: '', new: '', confirm: '' });
      setModalPassword(false);
    } catch {
      setMessage({ type: 'error', text: 'Error al actualizar la contraseña' });
    } finally {
      setLoading(false);
    }
  };

  // Handlers para datos personales
  const handlePersonalSubmit = async () => {
    setLoading(true);
    try {
      // Aquí iría la llamada al API
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simular API
      setMessage({ type: 'success', text: 'Datos personales actualizados correctamente' });
      setModalPersonal(false);
    } catch {
      setMessage({ type: 'error', text: 'Error al actualizar los datos personales' });
    } finally {
      setLoading(false);
    }
  };

  // Handlers para umbrales
  const handleUmbralesSubmit = async () => {
    if (umbralesForm.voltajeMin >= umbralesForm.voltajeMax) {
      setMessage({ type: 'error', text: 'El voltaje mínimo debe ser menor al máximo' });
      return;
    }
    if (umbralesForm.potenciaMax <= 0) {
      setMessage({ type: 'error', text: 'La potencia máxima debe ser mayor a 0' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/umbrales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voltaje_min: umbralesForm.voltajeMin,
          voltaje_max: umbralesForm.voltajeMax,
          potencia_max: umbralesForm.potenciaMax,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar umbrales');
      }

      setMessage({ type: 'success', text: 'Umbrales actualizados correctamente' });
      setModalUmbrales(false);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Error al actualizar los umbrales' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ mr: 2 }}>
          <MainMenu />
        </Box>
        <Typography variant="h4">Configuración</Typography>
      </Box>
      <Divider sx={{ mb: 3 }} />

      {/* Mensaje de estado */}
      {message && (
        <Alert 
          severity={message.type} 
          sx={{ mb: 3 }}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      {/* Información del usuario */}
      {userLoading ? (
        <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
          <CircularProgress />
        </Paper>
      ) : user ? (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Usuario actual: {user.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user.email}
          </Typography>
          <Chip 
            label={user.role === 'admin' ? 'Administrador' : 'Usuario'} 
            color={user.role === 'admin' ? 'primary' : 'default'}
            size="small"
            sx={{ mt: 1 }}
          />
        </Paper>
      ) : (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Alert severity="error">Error al cargar información del usuario</Alert>
        </Paper>
      )}

      {/* Opciones de configuración */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3 }}>
        <Box>
          <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
            <LockIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Cambiar contraseña
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Actualiza tu contraseña de acceso
            </Typography>
            <Button 
              variant="contained" 
              fullWidth
              onClick={() => setModalPassword(true)}
            >
              Cambiar
            </Button>
          </Paper>
        </Box>
      
        <Box>
          <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
            {mode === 'dark' ? (
              <DarkModeIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            ) : (
              <LightModeIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            )}
            <Typography variant="h6" gutterBottom>
              Apariencia
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Alterna entre tema claro y oscuro
            </Typography>
            <FormControlLabel
              control={<Switch checked={mode === 'dark'} onChange={toggleColorMode} />}
              label={mode === 'dark' ? 'Tema oscuro' : 'Tema claro'}
              sx={{ display: 'flex', justifyContent: 'center' }}
            />
          </Paper>
        </Box>
      
        <Box>
          <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
            <PersonIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Datos personales
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Actualiza tu información de contacto
            </Typography>
            <Button 
              variant="contained" 
              fullWidth
              onClick={() => setModalPersonal(true)}
            >
              Actualizar
            </Button>
          </Paper>
        </Box>
      
        {user && user.role === 'admin' && (
          <Box>
            <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
              <SettingsIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Configurar umbrales
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Define los límites para alertas
              </Typography>
              <Button 
                variant="contained" 
                fullWidth
                onClick={() => setModalUmbrales(true)}
              >
                Configurar
              </Button>
            </Paper>
          </Box>
        )}
      </Box>

      {/* Modal: Cambiar contraseña */}
      <Dialog open={modalPassword} onClose={() => setModalPassword(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cambiar contraseña</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Contraseña actual"
            type="password"
            fullWidth
            variant="outlined"
            value={passwordForm.current}
            onChange={(e) => setPasswordForm(prev => ({ ...prev, current: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Nueva contraseña"
            type="password"
            fullWidth
            variant="outlined"
            value={passwordForm.new}
            onChange={(e) => setPasswordForm(prev => ({ ...prev, new: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Confirmar nueva contraseña"
            type="password"
            fullWidth
            variant="outlined"
            value={passwordForm.confirm}
            onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
          />
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2">Requisitos de la contraseña:</Typography>
          <Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {passwordForm.new.length >= 8 ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />}
              <Typography variant="body2">Mínimo 8 caracteres</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/\d/.test(passwordForm.new) ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />}
              <Typography variant="body2">Al menos un número</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/[^A-Za-z0-9]/.test(passwordForm.new) ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />}
              <Typography variant="body2">Al menos un carácter especial (!@#$%^&*...)</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalPassword(false)}>Cancelar</Button>
          <Button 
            onClick={handlePasswordSubmit} 
            variant="contained"
            disabled={
              loading ||
              !passwordForm.current ||
              !passwordForm.new ||
              !passwordForm.confirm ||
              passwordForm.new !== passwordForm.confirm ||
              passwordForm.new.length < 8 ||
              !/\d/.test(passwordForm.new) ||
              !/[^A-Za-z0-9]/.test(passwordForm.new)
            }
          >
            {loading ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Datos personales */}
      <Dialog open={modalPersonal} onClose={() => setModalPersonal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Actualizar datos personales</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle1" gutterBottom sx={{ mt: 1 }}>
            Usuario: {user?.name || 'N/A'}
          </Typography>
          <TextField
            margin="dense"
            label="Número de celular"
            fullWidth
            variant="outlined"
            value={personalForm.phone}
            onChange={(e) => setPersonalForm(prev => ({ ...prev, phone: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Correo electrónico"
            type="email"
            fullWidth
            variant="outlined"
            value={personalForm.email}
            onChange={(e) => setPersonalForm(prev => ({ ...prev, email: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalPersonal(false)}>Cancelar</Button>
          <Button 
            onClick={handlePersonalSubmit} 
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Políticas y condiciones */}
      <Dialog open={modalPoliticas} onClose={() => setModalPoliticas(false)} maxWidth="md" fullWidth>
        <DialogTitle>Políticas y Condiciones de Uso</DialogTitle>
        <DialogContent>
          <Typography variant="h6" gutterBottom>
            Términos y Condiciones del Sistema IoT de Monitoreo Energético
          </Typography>
          
          <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
            1. Aceptación de los términos
          </Typography>
          <Typography variant="body2" paragraph>
            Al utilizar este sistema de monitoreo energético IoT, usted acepta cumplir con estos términos y condiciones de uso.
          </Typography>

          <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
            2. Uso del sistema
          </Typography>
          <Typography variant="body2" paragraph>
            El sistema está diseñado para el monitoreo y análisis del consumo energético. Los usuarios se comprometen a utilizar la plataforma de manera responsable y conforme a su propósito.
          </Typography>

          <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
            3. Privacidad y protección de datos
          </Typography>
          <Typography variant="body2" paragraph>
            Los datos de consumo energético son tratados con estricta confidencialidad. No compartimos información personal con terceros sin consentimiento expreso.
          </Typography>

          <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
            4. Responsabilidades del usuario
          </Typography>
          <Typography variant="body2" paragraph>
            Los usuarios son responsables de mantener la seguridad de sus credenciales de acceso y de reportar cualquier uso no autorizado del sistema.
          </Typography>

          <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
            5. Limitaciones de responsabilidad
          </Typography>
          <Typography variant="body2" paragraph>
            El sistema se proporciona &quot;tal como está&quot;. No garantizamos la disponibilidad continua del servicio ni la precisión absoluta de las mediciones.
          </Typography>

          <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
            6. Modificaciones
          </Typography>
          <Typography variant="body2" paragraph>
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán notificados a través del sistema.
          </Typography>

          <Typography variant="body2" sx={{ mt: 3, fontStyle: 'italic' }}>
            Última actualización: Octubre 2025
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalPoliticas(false)} variant="contained">
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Configurar umbrales (solo admin) */}
      <Dialog open={modalUmbrales} onClose={() => setModalUmbrales(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Configurar umbrales de alertas</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Define los rangos para generar alertas automáticas del sistema
          </Typography>
          
          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
            Rango de voltaje (V)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)' }, gap: 2 }}>
            <TextField
              label="Voltaje mínimo"
              type="number"
              fullWidth
              variant="outlined"
              value={umbralesForm.voltajeMin}
              onChange={(e) => setUmbralesForm(prev => ({ ...prev, voltajeMin: Number(e.target.value) }))}
              inputProps={{ min: 0, step: 1 }}
            />
            <TextField
              label="Voltaje máximo"
              type="number"
              fullWidth
              variant="outlined"
              value={umbralesForm.voltajeMax}
              onChange={(e) => setUmbralesForm(prev => ({ ...prev, voltajeMax: Number(e.target.value) }))}
              inputProps={{ min: 0, step: 1 }}
            />
          </Box>

          <Typography variant="subtitle1" gutterBottom sx={{ mt: 3 }}>
            Consumo energético máximo (kWh)
          </Typography>
          <TextField
            label="Consumo máximo (kWh)"
            type="number"
            fullWidth
            variant="outlined"
            value={umbralesForm.potenciaMax}
            onChange={(e) => setUmbralesForm(prev => ({ ...prev, potenciaMax: Number(e.target.value) }))}
            inputProps={{ min: 0, step: 0.1 }}
            helperText="Valor máximo de energía antes de generar alerta"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalUmbrales(false)}>Cancelar</Button>
          <Button 
            onClick={handleUmbralesSubmit} 
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}