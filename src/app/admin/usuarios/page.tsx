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
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  AdminPanelSettings as AdminIcon,
  Person as UserIcon,
  Edit as EditIcon,
  CheckCircle as VerifiedIcon,
  Cancel as UnverifiedIcon,
} from "@mui/icons-material";
import MainMenu from "@/components/MainMenu";
import { Divider } from "@mui/material";

interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user" | "super_admin";
  email_verified: boolean;
  created_at: string;
  company_id?: number | null;
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

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyEnabled, setCompanyEnabled] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    user: User | null;
    newRole: "admin" | "user" | "super_admin";
  }>({
    open: false,
    user: null,
    newRole: "user",
  });
  const [companyDialog, setCompanyDialog] = useState<{
    open: boolean;
    user: User | null;
    newCompanyId: number | null;
  }>({
    open: false,
    user: null,
    newCompanyId: null,
  });
  const [updating, setUpdating] = useState(false);
  const [updatingCompany, setUpdatingCompany] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Cargar usuario actual
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
            setCompanyEnabled(configData.enabled);
            if (configData.enabled) {
              await fetchCompanies();
            }
          }
          // Si es admin, cargar usuarios
          fetchUsers();
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
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
    } catch (err) {
      console.error("Error cargando companies:", err);
    }
  }

  // Cargar lista de usuarios
  async function fetchUsers() {
    try {
      setLoading(true);
      const res = await fetch("/api/users");
      if (!res.ok) {
        throw new Error("Error al obtener usuarios");
      }
      const data = await res.json();
      setUsers(data.users);
    } catch (err: any) {
      setError(err.message || "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }

  // Abrir diálogo de edición
  const handleEditRole = (user: User) => {
    console.log("Abriendo diálogo de edición. Usuario actual:", currentUser);
    console.log("Usuario a editar:", user);
    setEditDialog({
      open: true,
      user,
      newRole: user.role,
    });
  };

  // Guardar cambio de rol
  const handleSaveRole = async () => {
    if (!editDialog.user) return;

    // Validar que no se está cambiando el propio rol
    if (currentUser && editDialog.user.id === currentUser.id) {
      setMessage({
        type: "error",
        text: "No puedes cambiar tu propio rol",
      });
      return;
    }

    setUpdating(true);
    try {
      const res = await fetch(`/api/users/${editDialog.user.id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editDialog.newRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al actualizar rol");
      }

      setMessage({
        type: "success",
        text: `Rol de ${editDialog.user.name} actualizado a ${editDialog.newRole}`,
      });
      setEditDialog({ open: false, user: null, newRole: "user" as "admin" | "user" | "super_admin" });
      fetchUsers(); // Recargar lista
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al actualizar rol",
      });
    } finally {
      setUpdating(false);
    }
  };

  // Abrir diálogo de edición de company
  const handleEditCompany = async (user: User) => {
    // Obtener company_id actual del usuario
    let currentCompanyId = user.company_id || null;
    try {
      const res = await fetch(`/api/users/${user.id}/company`);
      if (res.ok) {
        const data = await res.json();
        currentCompanyId = data.company_id;
      }
    } catch (err) {
      console.error("Error obteniendo company:", err);
    }
    setCompanyDialog({
      open: true,
      user,
      newCompanyId: currentCompanyId,
    });
  };

  // Guardar cambio de company
  const handleSaveCompany = async () => {
    if (!companyDialog.user) return;

    // Validar que no se está cambiando la propia company
    if (currentUser && companyDialog.user.id === currentUser.id) {
      setMessage({
        type: "error",
        text: "No puedes cambiar tu propia company asignada",
      });
      return;
    }

    setUpdatingCompany(true);
    try {
      const res = await fetch(`/api/users/${companyDialog.user.id}/company`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyDialog.newCompanyId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al actualizar company");
      }

      const companyName = companyDialog.newCompanyId
        ? companies.find((c) => c.id === companyDialog.newCompanyId)?.name || "Company"
        : "Sin company";
      setMessage({
        type: "success",
        text: `Company de ${companyDialog.user.name} actualizado a ${companyName}`,
      });
      setCompanyDialog({ open: false, user: null, newCompanyId: null });
      fetchUsers(); // Recargar lista
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al actualizar company",
      });
    } finally {
      setUpdatingCompany(false);
    }
  };

  // Obtener nombre de company
  const getCompanyName = (companyId: number | null | undefined) => {
    if (!companyId) return "Sin company";
    const company = companies.find((c) => c.id === companyId);
    return company ? company.name : "Desconocida";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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
        <AdminIcon sx={{ mr: 1, fontSize: 32 }} />
        <Typography variant="h4">Administración de Usuarios</Typography>
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

      <Paper sx={{ width: "100%", overflow: "hidden" }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Email</TableCell>
                <TableCell align="center">Verificado</TableCell>
                <TableCell>Rol</TableCell>
                {companyEnabled && <TableCell>Company</TableCell>}
                <TableCell>Fecha de registro</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={companyEnabled ? 7 : 6} align="center">
                    No hay usuarios registrados
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {user.role === "super_admin" ? (
                          <AdminIcon color="error" fontSize="small" />
                        ) : user.role === "admin" ? (
                          <AdminIcon color="primary" fontSize="small" />
                        ) : (
                          <UserIcon color="action" fontSize="small" />
                        )}
                        {user.name}
                      </Box>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell align="center">
                      {user.email_verified ? (
                        <Tooltip title="Verificado">
                          <VerifiedIcon color="success" fontSize="small" />
                        </Tooltip>
                      ) : (
                        <Tooltip title="No verificado">
                          <UnverifiedIcon color="error" fontSize="small" />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={
                          user.role === "super_admin"
                            ? "Super Administrador"
                            : user.role === "admin"
                            ? "Administrador"
                            : "Usuario"
                        }
                        color={
                          user.role === "super_admin"
                            ? "error"
                            : user.role === "admin"
                            ? "primary"
                            : "default"
                        }
                        size="small"
                      />
                    </TableCell>
                    {companyEnabled && (
                      <TableCell>
                        <Chip
                          label={getCompanyName(user.company_id)}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                    )}
                    <TableCell>{formatDate(user.created_at)}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: "flex", gap: 0.5, justifyContent: "center" }}>
                        <Tooltip title="Cambiar rol">
                          <IconButton
                            size="small"
                            onClick={() => handleEditRole(user)}
                            disabled={currentUser?.id === user.id}
                            color="primary"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {companyEnabled && (
                          <Tooltip title="Asignar company">
                            <IconButton
                              size="small"
                              onClick={() => handleEditCompany(user)}
                              disabled={currentUser?.id === user.id}
                              color="secondary"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Diálogo para cambiar rol */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, user: null, newRole: "user" })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Cambiar rol de usuario</DialogTitle>
        <DialogContent>
          {editDialog.user && (
            <Box sx={{ pt: 2 }}>
              <Typography variant="body1" gutterBottom>
                Usuario: <strong>{editDialog.user.name}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
                {editDialog.user.email}
              </Typography>
              <FormControl fullWidth>
                <InputLabel>Nuevo rol</InputLabel>
                <Select
                  value={editDialog.newRole || "user"}
                  onChange={(e) => {
                    const newRoleValue = e.target.value as "admin" | "user" | "super_admin";
                    console.log("Cambiando rol a:", newRoleValue);
                    setEditDialog({
                      ...editDialog,
                      newRole: newRoleValue,
                    });
                  }}
                  label="Nuevo rol"
                >
                  <MenuItem value="user">Usuario</MenuItem>
                  <MenuItem 
                    value="admin" 
                    disabled={currentUser?.role !== "super_admin" && currentUser?.role !== "admin"}
                  >
                    Administrador
                  </MenuItem>
                  <MenuItem 
                    value="super_admin" 
                    disabled={currentUser?.role !== "super_admin"}
                  >
                    Super Administrador
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditDialog({ open: false, user: null, newRole: "user" })}
            disabled={updating}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSaveRole}
            variant="contained"
            disabled={updating || editDialog.user?.role === editDialog.newRole}
          >
            {updating ? <CircularProgress size={24} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo para asignar company */}
      {companyEnabled && (
        <Dialog
          open={companyDialog.open}
          onClose={() => setCompanyDialog({ open: false, user: null, newCompanyId: null })}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Asignar company a usuario</DialogTitle>
          <DialogContent>
            {companyDialog.user && (
              <Box sx={{ pt: 2 }}>
                <Typography variant="body1" gutterBottom>
                  Usuario: <strong>{companyDialog.user.name}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
                  {companyDialog.user.email}
                </Typography>
                <FormControl fullWidth>
                  <InputLabel>Company</InputLabel>
                  <Select
                    value={companyDialog.newCompanyId || ""}
                    onChange={(e) => {
                      const value = String(e.target.value);
                      setCompanyDialog({
                        ...companyDialog,
                        newCompanyId: value === "" ? null : Number(value),
                      });
                    }}
                    label="Company"
                  >
                    <MenuItem value="">Sin company</MenuItem>
                    {companies.map((company) => (
                      <MenuItem key={company.id} value={company.id}>
                        {company.name} {company.code && `(${company.code})`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setCompanyDialog({ open: false, user: null, newCompanyId: null })}
              disabled={updatingCompany}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCompany}
              variant="contained"
              disabled={updatingCompany}
            >
              {updatingCompany ? <CircularProgress size={24} /> : "Guardar"}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}

