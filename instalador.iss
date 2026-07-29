; =====================================================================
; Instalador POS Printer EscalaNET
; Arquitectura: Node.js Portable + node_modules + Drivers WinUSB
; =====================================================================

[Setup]
AppName=POS Printer EscalaNET
AppVersion=1.2.0
AppPublisher=EscalaNET
AppPublisherURL=https://zapinet.escalanet.com.bo/
AppSupportURL=https://zapinet.escalanet.com.bo/
AppUpdatesURL=https://zapinet.escalanet.com.bo/

; --- Metadatos de propiedad intelectual (visibles en Propiedades -> Detalles) ---
VersionInfoVersion=1.2.0.0
VersionInfoCompany=EscalaNET
VersionInfoProductName=POS Printer EscalaNET
VersionInfoProductVersion=1.2.0
VersionInfoDescription=Puente de impresion local ESC/POS para EscalaNET
VersionInfoCopyright=Copyright (C) 2024-2026 EscalaNET. Todos los derechos reservados.

; Donde se instalara
DefaultDirName={autopf}\POS Printer EscalaNET
DisableProgramGroupPage=yes

; Icono del instalador
SetupIconFile=logo-impresion.ico
UninstallDisplayIcon={app}\logo-impresion.ico

; Nombre del archivo instalador final
OutputDir=dist
OutputBaseFilename=Instalar-POS-Printer-EscalaNET

; Compresion maxima para reducir el tamano del .exe instalador
Compression=lzma2
SolidCompression=yes

; Permisos de Administrador (necesario para instalar drivers WinUSB con pnputil)
PrivilegesRequired=admin

; Evitar multiples instancias del instalador
AppMutex=POSPrinterEscalaNet_Setup

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "runonstartup"; Description: "Iniciar el puente de impresion automaticamente al encender la PC (Recomendado)"; GroupDescription: "Opciones de inicio:"; Flags: checkedonce
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; ---- Node.js portable (sin instalar nada globalmente en la PC del cliente) ----
Source: "node-runtime\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion

; ---- Servidor de impresion ----
Source: "server.js"; DestDir: "{app}"; Flags: ignoreversion

; ---- Dependencias Node.js (node_modules con binarios nativos incluidos) ----
Source: "node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs

; ---- Scripts de inicio y recursos ----
Source: "iniciar-oculto.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "logo-impresion.ico"; DestDir: "{app}"; Flags: ignoreversion

; ---- Drivers WinUSB por marca de impresora ----
; Si la carpeta esta vacia (sin .inf), pnputil simplemente no instala nada (sin error)
Source: "drivers-usb\*"; DestDir: "{app}\drivers-usb"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Acceso directo en menu inicio
Name: "{autoprograms}\POS Printer Service"; Filename: "wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""; IconFilename: "{app}\logo-impresion.ico"

; Acceso directo en escritorio (opcional)
Name: "{autodesktop}\POS Printer Service"; Filename: "wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""; Tasks: desktopicon; IconFilename: "{app}\logo-impresion.ico"

; Inicio automatico con Windows (totalmente oculto, si el usuario lo eligio)
Name: "{commonstartup}\POS Printer Service"; Filename: "wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""; Tasks: runonstartup; IconFilename: "{app}\logo-impresion.ico"

[Run]
; ---- Instalar drivers WinUSB por marca (silencioso, falla graciosamente si la carpeta esta vacia) ----
; Windows aplica automaticamente el driver que corresponda al hardware detectado
; Para sistemas de 64 bits
Filename: "{cmd}"; Parameters: "/c if exist ""{app}\drivers-usb\knup\*.inf"" pnputil /add-driver ""{app}\drivers-usb\knup\*.inf"" /install"; Flags: runhidden; StatusMsg: "Instalando driver Knup..."; Check: IsWin64 and DirExists(ExpandConstant('{app}\drivers-usb\knup'))
Filename: "{cmd}"; Parameters: "/c if exist ""{app}\drivers-usb\epson-tm\*.inf"" pnputil /add-driver ""{app}\drivers-usb\epson-tm\*.inf"" /install"; Flags: runhidden; StatusMsg: "Instalando driver Epson..."; Check: IsWin64 and DirExists(ExpandConstant('{app}\drivers-usb\epson-tm'))
; Filename: "{cmd}"; Parameters: "/c if exist ""{app}\drivers-usb\bematech-i9\*.inf"" pnputil /add-driver ""{app}\drivers-usb\bematech-i9\*.inf"" /install"; Flags: runhidden; StatusMsg: "Instalando driver Bematech..."; Check: IsWin64 and DirExists(ExpandConstant('{app}\drivers-usb\bematech-i9'))
Filename: "{cmd}"; Parameters: "/c if exist ""{app}\drivers-usb\logic-controls\*.inf"" pnputil /add-driver ""{app}\drivers-usb\logic-controls\*.inf"" /install"; Flags: runhidden; StatusMsg: "Instalando driver Logic Controls..."; Check: IsWin64 and DirExists(ExpandConstant('{app}\drivers-usb\logic-controls'))

; Para sistemas de 32 bits
Filename: "{cmd}"; Parameters: "/c if exist ""{app}\drivers-usb\knup\*.inf"" pnputil /add-driver ""{app}\drivers-usb\knup\*.inf"" /install"; Flags: runhidden; StatusMsg: "Instalando driver Knup..."; Check: (not IsWin64) and DirExists(ExpandConstant('{app}\drivers-usb\knup'))
Filename: "{cmd}"; Parameters: "/c if exist ""{app}\drivers-usb\epson-tm\*.inf"" pnputil /add-driver ""{app}\drivers-usb\epson-tm\*.inf"" /install"; Flags: runhidden; StatusMsg: "Instalando driver Epson..."; Check: (not IsWin64) and DirExists(ExpandConstant('{app}\drivers-usb\epson-tm'))
; Filename: "{cmd}"; Parameters: "/c if exist ""{app}\drivers-usb\bematech-i9\*.inf"" pnputil /add-driver ""{app}\drivers-usb\bematech-i9\*.inf"" /install"; Flags: runhidden; StatusMsg: "Instalando driver Bematech..."; Check: (not IsWin64) and DirExists(ExpandConstant('{app}\drivers-usb\bematech-i9'))
Filename: "{cmd}"; Parameters: "/c if exist ""{app}\drivers-usb\logic-controls\*.inf"" pnputil /add-driver ""{app}\drivers-usb\logic-controls\*.inf"" /install"; Flags: runhidden; StatusMsg: "Instalando driver Logic Controls..."; Check: (not IsWin64) and DirExists(ExpandConstant('{app}\drivers-usb\logic-controls'))

; ---- Arrancar el servicio de impresion al terminar la instalacion ----
Filename: "wscript.exe"; Parameters: """{app}\iniciar-oculto.vbs"""; Description: "Iniciar el servicio de impresion ahora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Matar el proceso node.exe antes de desinstalar para evitar archivos en uso
Filename: "{cmd}"; Parameters: "/c taskkill /F /IM node.exe /T"; Flags: runhidden
