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
} from "@mui/material";
import {
  Business as BusinessIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import MainMenu from "@/components/MainMenu";
import { Divider } from "@mui/material";

interface Company {
  id: number;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyEnabled, setCompanyEnabled] = useState<boolean>(false);
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    company: Company | null;
    isNew: boolean;
  }>({
    open: false,
    company: null,
    isNew: false,
  });
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    email: "",
    phone: "",
    address: "",
  });
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
          // Verificar que es admin
          if (data.role !== "admin") {
            setError("No tienes permisos para acceder a esta página");
            setLoading(false);
            return;
          }
          // Verificar si companies está habilitado desde el servidor
          const configRes = await fetch("/api/companies/config");
          if (configRes.ok) {
            const configData = await configRes.json();
            setCompanyEnabled(configData.enabled);
            if (!configData.enabled) {
              setError("La funcionalidad de companies está deshabilitada. Habilítala en .env.local con COMPANY_ENABLED=true");
              setLoading(false);
              return;
            }
          }
          // Si es admin, cargar companies
          fetchCompanies();
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
      setLoading(true);
      const res = await fetch("/api/companies");
      if (!res.ok) {
        throw new Error("Error al obtener companies");
      }
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch (err: any) {
      setError(err.message || "Error al cargar companies");
    } finally {
      setLoading(false);
    }
  }

  // Abrir diálogo para nueva company
  const handleNewCompany = () => {
    setFormData({
      name: "",
      code: "",
      email: "",
      phone: "",
      address: "",
    });
    setEditDialog({ open: true, company: null, isNew: true });
  };

  // Abrir diálogo para editar company
  const handleEditCompany = (company: Company) => {
    setFormData({
      name: company.name,
      code: company.code || "",
      email: company.email || "",
      phone: company.phone || "",
      address: company.address || "",
    });
    setEditDialog({ open: true, company, isNew: false });
  };

  // Guardar company
  const handleSaveCompany = async () => {
    if (!formData.name.trim()) {
      setMessage({
        type: "error",
        text: "El nombre es requerido",
      });
      return;
    }

    setSaving(true);
    try {
      const url = editDialog.isNew
        ? "/api/companies"
        : `/api/companies/${editDialog.company?.id}`;
      const method = editDialog.isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar company");
      }

      setMessage({
        type: "success",
        text: editDialog.isNew
          ? "Company creada exitosamente"
          : "Company actualizada exitosamente",
      });
      setEditDialog({ open: false, company: null, isNew: false });
      fetchCompanies(); // Recargar lista
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al guardar company",
      });
    } finally {
      setSaving(false);
    }
  };

  // Eliminar company
  const handleDeleteCompany = async (company: Company) => {
    if (!confirm(`¿Estás seguro de eliminar la company "${company.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al eliminar company");
      }

      setMessage({
        type: "success",
        text: "Company eliminada exitosamente",
      });
      fetchCompanies(); // Recargar lista
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al eliminar company",
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

  if (loading) {
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
        <BusinessIcon sx={{ mr: 1, fontSize: 32 }} />
        <Typography variant="h4">Administración de Companies</Typography>
      </Box>
      <Divider sx={{ mb: 3 }} />

      {!companyEnabled && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          La funcionalidad de companies está deshabilitada. Habilítala en
          .env.local con COMPANY_ENABLED=true
        </Alert>
      )}

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

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleNewCompany}
          disabled={!companyEnabled}
        >
          Nueva Company
        </Button>
      </Box>

      <Paper sx={{ width: "100%", overflow: "hidden" }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Código</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Teléfono</TableCell>
                <TableCell>Dirección</TableCell>
                <TableCell>Fecha creación</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    No hay companies registradas
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((company) => (
                  <TableRow key={company.id} hover>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <BusinessIcon color="primary" fontSize="small" />
                        {company.name}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {company.code ? (
                        <Chip label={company.code} size="small" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{company.email || "-"}</TableCell>
                    <TableCell>{company.phone || "-"}</TableCell>
                    <TableCell>
                      {company.address ? (
                        <Typography variant="body2" sx={{ maxWidth: 200 }}>
                          {company.address}
                        </Typography>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{formatDate(company.created_at)}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Editar">
                        <IconButton
                          size="small"
                          onClick={() => handleEditCompany(company)}
                          color="primary"
                          sx={{ mr: 1 }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteCompany(company)}
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

      {/* Diálogo para crear/editar company */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, company: null, isNew: false })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editDialog.isNew ? "Nueva Company" : "Editar Company"}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
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
              helperText="Código único para identificar la company"
            />
            <TextField
              label="Email"
              fullWidth
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
            <TextField
              label="Teléfono"
              fullWidth
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
            />
            <TextField
              label="Dirección"
              fullWidth
              multiline
              rows={3}
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              setEditDialog({ open: false, company: null, isNew: false })
            }
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSaveCompany}
            variant="contained"
            disabled={saving || !formData.name.trim()}
          >
            {saving ? <CircularProgress size={24} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

