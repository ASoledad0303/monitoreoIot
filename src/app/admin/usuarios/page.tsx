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
  role: "admin" | "user";
  email_verified: boolean;
  created_at: string;
}

interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
}

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    user: User | null;
    newRole: "admin" | "user";
  }>({
    open: false,
    user: null,
    newRole: "user",
  });
  const [updating, setUpdating] = useState(false);
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
          // Verificar que es admin
          if (data.role !== "admin") {
            setError("No tienes permisos para acceder a esta página");
            setLoading(false);
            return;
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
      setEditDialog({ open: false, user: null, newRole: "user" });
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
                <TableCell>Fecha de registro</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No hay usuarios registrados
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {user.role === "admin" ? (
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
                        label={user.role === "admin" ? "Administrador" : "Usuario"}
                        color={user.role === "admin" ? "primary" : "default"}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{formatDate(user.created_at)}</TableCell>
                    <TableCell align="center">
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
                  value={editDialog.newRole}
                  onChange={(e) =>
                    setEditDialog({
                      ...editDialog,
                      newRole: e.target.value as "admin" | "user",
                    })
                  }
                  label="Nuevo rol"
                >
                  <MenuItem value="user">Usuario</MenuItem>
                  <MenuItem value="admin">Administrador</MenuItem>
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
    </Box>
  );
}

