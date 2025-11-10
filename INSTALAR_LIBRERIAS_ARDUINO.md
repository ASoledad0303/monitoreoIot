# Cómo Instalar las Librerías Necesarias en Arduino IDE

## 📚 Librerías Requeridas

Para compilar el código `ESP32-MQTT-PRINCIPAL.ino` necesitas:

1. **PubSubClient** - Para comunicación MQTT
2. **LiquidCrystal_I2C** - Para el display LCD

## 🔧 Instalación Paso a Paso

### Paso 1: Abrir el Gestor de Librerías

1. Abre **Arduino IDE**
2. Ve al menú: **Herramientas** → **Administrar bibliotecas...**
   - O presiona: `Ctrl + Shift + I` (Windows/Linux) o `Cmd + Shift + I` (Mac)
3. Se abrirá una ventana con el gestor de librerías

### Paso 2: Instalar PubSubClient

1. En el campo de búsqueda, escribe: **PubSubClient**
2. Busca la librería: **PubSubClient** por **Nick O'Leary**
3. Haz clic en **Instalar**
4. Espera a que termine la instalación
5. Verás un mensaje: "Instalado"

### Paso 3: Instalar LiquidCrystal_I2C

1. En el campo de búsqueda, escribe: **LiquidCrystal I2C**
2. Busca: **LiquidCrystal_I2C** por **Frank de Brabander**
3. Haz clic en **Instalar**
4. Espera a que termine la instalación

### Paso 4: Verificar Instalación

1. Ve a: **Sketch** → **Incluir biblioteca**
2. Deberías ver ambas librerías en la lista:
   - ✅ PubSubClient
   - ✅ LiquidCrystal_I2C

## 🎯 Instalación Rápida (URL Directa)

Si el gestor de librerías no funciona, puedes instalar manualmente:

### PubSubClient

1. Ve a: https://github.com/knolleary/pubsubclient/releases
2. Descarga el archivo ZIP más reciente (ej: `pubsubclient-master.zip`)
3. En Arduino IDE:
   - **Proyecto** → **Añadir archivo .ZIP de biblioteca...**
   - Selecciona el archivo ZIP descargado
   - Espera a que se instale

### LiquidCrystal_I2C

1. Ve a: https://github.com/johnrickman/LiquidCrystal_I2C
2. Haz clic en **Code** → **Download ZIP**
3. En Arduino IDE:
   - **Proyecto** → **Añadir archivo .ZIP de biblioteca...**
   - Selecciona el archivo ZIP descargado

## ⚙️ Configuración del ESP32 en Arduino IDE

Antes de compilar, verifica:

1. **Placa seleccionada:**
   - **Herramientas** → **Placa** → **ESP32 Arduino** → **ESP32 Dev Module**

2. **Puerto COM:**
   - **Herramientas** → **Puerto** → Selecciona el puerto donde está conectado tu ESP32

3. **Configuración del ESP32:**
   - **Herramientas** → **CPU Frequency** → **240MHz (WiFi/BT)**
   - **Herramientas** → **Flash Frequency** → **80MHz**
   - **Herramientas** → **Flash Size** → **4MB (32Mb)**
   - **Herramientas** → **Partition Scheme** → **Default 4MB with spiffs**

## 🔍 Verificar que Todo Está Correcto

1. Abre el archivo `ESP32-MQTT-PRINCIPAL.ino`
2. Ve a: **Sketch** → **Verificar/Compilar** (o `Ctrl + R`)
3. Si todo está bien, verás: "Compilación completada"

## ❌ Si Sigue el Error

### Opción 1: Reiniciar Arduino IDE

1. Cierra completamente Arduino IDE
2. Vuelve a abrirlo
3. Intenta compilar de nuevo

### Opción 2: Verificar Ubicación de Librerías

Las librerías se instalan en:
- **Windows**: `C:\Users\<Usuario>\Documents\Arduino\libraries\`
- **Mac**: `~/Documents/Arduino/libraries/`
- **Linux**: `~/Arduino/libraries/`

Verifica que existan las carpetas:
- `PubSubClient`
- `LiquidCrystal_I2C`

### Opción 3: Instalación Manual

Si nada funciona, descarga e instala manualmente:

1. **PubSubClient:**
   - Ve a: https://github.com/knolleary/pubsubclient
   - **Code** → **Download ZIP**
   - Extrae el ZIP
   - Renombra la carpeta a `PubSubClient`
   - Copia la carpeta a `Arduino/libraries/`

2. **LiquidCrystal_I2C:**
   - Ve a: https://github.com/johnrickman/LiquidCrystal_I2C
   - **Code** → **Download ZIP**
   - Extrae el ZIP
   - Renombra la carpeta a `LiquidCrystal_I2C`
   - Copia la carpeta a `Arduino/libraries/`

## 📝 Notas Importantes

- **Versión de Arduino IDE**: Asegúrate de tener la versión 1.8.19 o superior
- **ESP32 Board Manager**: Debes tener instalado el soporte para ESP32:
  - **Archivo** → **Preferencias** → **Gestor de URLs Adicionales de Tarjetas**
  - Agrega: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
  - Luego: **Herramientas** → **Placa** → **Gestor de tarjetas** → Busca "ESP32" → Instala

## ✅ Checklist

Antes de compilar, verifica:

- [ ] PubSubClient instalado
- [ ] LiquidCrystal_I2C instalado
- [ ] Placa ESP32 seleccionada
- [ ] Puerto COM seleccionado
- [ ] Arduino IDE reiniciado (si es necesario)

