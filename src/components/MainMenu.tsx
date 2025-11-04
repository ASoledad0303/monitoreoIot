'use client';

import { useState, useEffect } from 'react';
import { 
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Box,
  Divider,
  Typography
} from '@mui/material';
import { 
  BarChart as ChartIcon,
  Notifications as AlertIcon,
  Settings as SettingsIcon,
  ShowChart as MonitorIcon,
  Receipt as BillIcon,
  Menu as MenuIcon,
  Logout as LogoutIcon,
  AdminPanelSettings as AdminIcon,
  Business as BusinessIcon
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export default function MainMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  
  useEffect(() => {
    // Cargar información del usuario
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => data && setUser(data))
      .catch(() => {});
  }, []);

  const toggleDrawer = (isOpen: boolean) => () => {
    setOpen(isOpen);
  };

  const handleNavigation = (path: string) => {
    router.push(path);
    setOpen(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    router.push('/login');
    setOpen(false);
  };

  const menuItems = [
    { text: 'Monitoreo en tiempo real', icon: <MonitorIcon />, path: '/' },
    { text: 'Reporte de consumo', icon: <ChartIcon />, path: '/reportes' },
    { text: 'Panel de alertas', icon: <AlertIcon />, path: '/alertas' },
    { text: 'Comparar factura', icon: <BillIcon />, path: '/factura' },
    { text: 'Configuración', icon: <SettingsIcon />, path: '/configuracion' }
  ];

  // Agregar opciones de administración solo para admins
  const adminMenuItems = user?.role === 'admin' 
    ? [
        { text: 'Administración de usuarios', icon: <AdminIcon />, path: '/admin/usuarios' },
        { text: 'Administración de companies', icon: <BusinessIcon />, path: '/admin/companies' }
      ]
    : [];

  return (
    <>
      <IconButton 
        edge="start" 
        color="inherit" 
        aria-label="menu" 
        onClick={toggleDrawer(true)}
        sx={{ mr: 2 }}
      >
        <MenuIcon />
      </IconButton>
      
      <Drawer
        anchor="left"
        open={open}
        onClose={toggleDrawer(false)}
      >
        <Box
          sx={{ width: { xs: 280, sm: 300 } }}
          role="presentation"
        >
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" fontWeight={700}>Sistema IoT</Typography>
            <IconButton size="small" onClick={toggleDrawer(false)}>
              <MenuIcon />
            </IconButton>
          </Box>
          <Divider />
          <List>
            {menuItems.slice(0, 4).map((item) => (
              <ListItem 
                key={item.text} 
                onClick={() => handleNavigation(item.path)}
                sx={{ cursor: 'pointer' }}
              >
                <ListItemIcon>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItem>
            ))}
          </List>
          <Divider />
          <List>
            {menuItems.slice(4).map((item) => (
              <ListItem 
                key={item.text} 
                onClick={() => handleNavigation(item.path)}
                sx={{ cursor: 'pointer' }}
              >
                <ListItemIcon>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItem>
            ))}
            {adminMenuItems.map((item) => (
              <ListItem 
                key={item.text}
                onClick={() => handleNavigation(item.path)}
                sx={{ cursor: 'pointer' }}
              >
                <ListItemIcon>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItem>
            ))}
          </List>
          <Divider />
          <List>
            <ListItem onClick={handleLogout} sx={{ cursor: 'pointer', color: 'error.main' }}>
              <ListItemIcon>
                <LogoutIcon color="error" />
              </ListItemIcon>
              <ListItemText primary="Cerrar sesión" />
            </ListItem>
          </List>
        </Box>
      </Drawer>
    </>
  );
}