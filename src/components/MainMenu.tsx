'use client';

import { useState } from 'react';
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
  Logout as LogoutIcon
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';

export default function MainMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  
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