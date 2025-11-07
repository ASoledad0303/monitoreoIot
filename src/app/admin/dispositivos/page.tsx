"use client";

import React, { useState, useEffect } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
} from "@mui/material";
import {
  Sensors as DeviceIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import MainMenu from "@/components/MainMenu";
import { Divider } from "@mui/material";

interface Device {
  id: number;
  company_id: number;
  name: string;
  code: string | null;
  description: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  company_name?: string;
}

interface Company {
  id: number;
  name: string;
  code: string | null;
}

interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user" | "super_admin";
}

export default function AdminDispositivosPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    device: Device | null;
    isNew: boolean;
  }>({
    open: false,
    device: null,
    isNew: false,
  });
  const [formData, setFormData] = useState({
    company_id: "",
    name: "",
    code: "",
    description: "",
    location: "",
    is_active: true,
  });
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Cargar usuario actual y configuración
  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data);
          // Verificar que es admin o super_admin
          if (data.role !== "admin" && data.role !== "super_admin") {
            setError("No tienes permisos para acceder a esta página");
            setLoading(false);
            return;
          }
          // Verificar si companies está habilitado
          const configRes = await fetch("/api/companies/config");
          if (configRes.ok) {
            const configData = await configRes.json();
            if (!configData.enabled) {
              setError(
                "La funcionalidad de companies está deshabilitada. Habilítala en .env.local con COMPANY_ENABLED=true"
              );
              setLoading(false);
              return;
            }
          }
          // Cargar companies (devices se cargarán cuando se seleccione una company)
          await fetchCompanies();
        } else {
          setError("Error al verificar permisos");
          setLoading(false);
        }
      } catch (err) {
        setError("Error al cargar información");
        setLoading(false);
      }
    }
    fetchCurrentUser();
  }, []);

  // Cargar lista de companies
  async function fetchCompanies() {
    try {
      const res = await fetch("/api/companies");
      if (!res.ok) {
        throw new Error("Error al obtener companies");
      }
      const data = await res.json();
      setCompanies(data.companies || []);
      // Si es admin (no super_admin), seleccionar automáticamente su company
      if (currentUser?.role === "admin" && data.companies && data.companies.length > 0 && !selectedCompany) {
        setSelectedCompany(data.companies[0].id.toString());
      } else if (currentUser?.role === "super_admin" && data.companies && data.companies.length > 0 && !selectedCompany) {
        // Super_admin puede ver todas, pero no seleccionar automáticamente
        setSelectedCompany("");
      }
    } catch (err: any) {
      console.error("Error cargando companies:", err);
    }
  }

  // Cargar lista de devices
  async function fetchDevices() {
    try {
      setLoading(true);
      // Solo cargar dispositivos si hay una company seleccionada
      if (!selectedCompany) {
        setDevices([]);
        setLoading(false);
        return;
      }
      
      const url = `/api/devices?company_id=${selectedCompany}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Error al obtener dispositivos");
      }
      const data = await res.json();
      setDevices(data.devices || []);
    } catch (err: any) {
      setError(err.message || "Error al cargar dispositivos");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }

  // Recargar devices cuando cambia la company seleccionada
  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchDevices();
    }
  }, [selectedCompany, currentUser?.role]);

  // Abrir diálogo para nuevo device
  const handleNewDevice = () => {
    setFormData({
      company_id: selectedCompany || "",
      name: "",
      code: "",
      description: "",
      location: "",
      is_active: true,
    });
    setEditDialog({ open: true, device: null, isNew: true });
  };

  // Abrir diálogo para editar device
  const handleEditDevice = (device: Device) => {
    setFormData({
      company_id: device.company_id.toString(),
      name: device.name,
      code: device.code || "",
      description: device.description || "",
      location: device.location || "",
      is_active: device.is_active,
    });
    setEditDialog({ open: true, device, isNew: false });
  };

  // Guardar device
  const handleSaveDevice = async () => {
    if (!formData.name.trim()) {
      setMessage({
        type: "error",
        text: "El nombre es requerido",
      });
      return;
    }

    if (!formData.company_id) {
      setMessage({
        type: "error",
        text: "Debes seleccionar una company",
      });
      return;
    }

    setSaving(true);
    try {
      const url = editDialog.isNew
        ? "/api/devices"
        : `/api/devices/${editDialog.device?.id}`;
      const method = editDialog.isNew ? "POST" : "PUT";

      const payload = {
        ...formData,
        company_id: parseInt(formData.company_id),
        is_active: formData.is_active,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar dispositivo");
      }

      setMessage({
        type: "success",
        text: editDialog.isNew
          ? "Dispositivo creado exitosamente"
          : "Dispositivo actualizado exitosamente",
      });
      setEditDialog({ open: false, device: null, isNew: false });
      fetchDevices(); // Recargar lista
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al guardar dispositivo",
      });
    } finally {
      setSaving(false);
    }
  };

  // Eliminar device
  const handleDeleteDevice = async (device: Device) => {
    if (
      !confirm(
        `¿Estás seguro de eliminar el dispositivo "${device.name}"?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/devices/${device.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al eliminar dispositivo");
      }

      setMessage({
        type: "success",
        text: "Dispositivo eliminado exitosamente",
      });
      fetchDevices(); // Recargar lista
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al eliminar dispositivo",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading && !devices.length) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error && currentUser?.role !== "admin") {
    return (
      <Box sx={{ p: 3 }}>
        <MainMenu />
        <Alert severity="error" sx={{ mt: 3 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Box sx={{ mr: 2 }}>
          <MainMenu />
        </Box>
        <DeviceIcon sx={{ mr: 1, fontSize: 32 }} />
        <Typography variant="h4">Administración de Dispositivos</Typography>
      </Box>
      <Divider sx={{ mb: 3 }} />


      {message && (
        <Alert
          severity={message.type}
          sx={{ mb: 3 }}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filtro por Company */}
      {companies.length === 0 ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          {currentUser?.role === "admin" 
            ? "No tienes una company asignada. Contacta a un super administrador."
            : "No hay companies registradas. Primero debes crear una company en la sección "}
          {currentUser?.role === "super_admin" && (
            <><strong>Administración de Companies</strong> antes de poder agregar dispositivos.</>
          )}
        </Alert>
      ) : (
        <Box sx={{ mb: 3, display: "flex", gap: 2, alignItems: "center" }}>
          {currentUser?.role === "super_admin" && (
            <FormControl sx={{ minWidth: 250 }}>
              <InputLabel>Filtrar por Company</InputLabel>
              <Select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                label="Filtrar por Company"
              >
                <MenuItem value="">Todas las companies</MenuItem>
                {companies.map((company) => (
                  <MenuItem key={company.id} value={company.id.toString()}>
                    {company.name} {company.code && `(${company.code})`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {currentUser?.role === "admin" && companies.length > 0 && (
            <Typography variant="body1" sx={{ flexGrow: 1 }}>
              Company: <strong>{companies[0].name}</strong> {companies[0].code && `(${companies[0].code})`}
            </Typography>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleNewDevice}
            disabled={!selectedCompany || (currentUser?.role === "admin" && !companies[0])}
          >
            Nuevo Dispositivo
          </Button>
        </Box>
      )}

      <Paper sx={{ width: "100%", overflow: "hidden" }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Código</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Ubicación</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Fecha creación</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    {companies.length === 0
                      ? "No hay companies. Crea una company primero."
                      : selectedCompany
                      ? "No hay dispositivos registrados para esta company"
                      : "Selecciona una company para ver dispositivos"}
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((device) => (
                  <TableRow key={device.id} hover>
                    <TableCell>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <DeviceIcon color="primary" fontSize="small" />
                        {device.name}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {device.code ? (
                        <Chip label={device.code} size="small" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {device.company_name || `ID: ${device.company_id}`}
                    </TableCell>
                    <TableCell>{device.location || "-"}</TableCell>
                    <TableCell>
                      <Chip
                        label={device.is_active ? "Activo" : "Inactivo"}
                        color={device.is_active ? "success" : "default"}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{formatDate(device.created_at)}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Editar">
                        <IconButton
                          size="small"
                          onClick={() => handleEditDevice(device)}
                          color="primary"
                          sx={{ mr: 1 }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteDevice(device)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Diálogo para crear/editar device */}
      <Dialog
        open={editDialog.open}
        onClose={() =>
          setEditDialog({ open: false, device: null, isNew: false })
        }
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editDialog.isNew ? "Nuevo Dispositivo" : "Editar Dispositivo"}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <FormControl fullWidth required>
              <InputLabel>Company</InputLabel>
              <Select
                value={formData.company_id}
                onChange={(e) =>
                  setFormData({ ...formData, company_id: e.target.value })
                }
                label="Company"
                disabled={!editDialog.isNew}
              >
                {companies.map((company) => (
                  <MenuItem key={company.id} value={company.id.toString()}>
                    {company.name} {company.code && `(${company.code})`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Nombre *"
              fullWidth
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
            <TextField
              label="Código"
              fullWidth
              value={formData.code}
              onChange={(e) =>
                setFormData({ ...formData, code: e.target.value })
              }
              helperText="Código único dentro de la company"
            />
            <TextField
              label="Ubicación"
              fullWidth
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
            />
            <TextField
              label="Descripción"
              fullWidth
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData({ ...formData, is_active: e.target.checked })
                  }
                />
              }
              label="Dispositivo activo"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              setEditDialog({ open: false, device: null, isNew: false })
            }
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSaveDevice}
            variant="contained"
            disabled={saving || !formData.name.trim() || !formData.company_id}
          >
            {saving ? <CircularProgress size={24} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

