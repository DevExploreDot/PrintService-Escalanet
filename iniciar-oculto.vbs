' =====================================================================
' POS Printer EscalaNET - Iniciador oculto
' Lanza node.exe server.js sin ventana visible.
' Evita duplicados y valida que los archivos existan antes de lanzar.
' =====================================================================

Dim fso, WshShell, scriptDir, nodeExe, serverJs

Set fso      = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' Carpeta donde esta instalado el programa (donde vive este .vbs)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
nodeExe   = scriptDir & "\node\node.exe"
serverJs  = scriptDir & "\server.js"

' --- Verificar que los archivos existan antes de lanzar ---
If Not fso.FileExists(nodeExe) Then
  MsgBox "No se encontro node.exe en:" & vbCrLf & nodeExe & vbCrLf & vbCrLf & _
         "Reinstale el programa.", vbCritical, "POS Printer EscalaNET"
  WScript.Quit 1
End If

If Not fso.FileExists(serverJs) Then
  MsgBox "No se encontro server.js en:" & vbCrLf & serverJs & vbCrLf & vbCrLf & _
         "Reinstale el programa.", vbCritical, "POS Printer EscalaNET"
  WScript.Quit 1
End If

' --- Verificar si ya hay una instancia corriendo (evitar duplicados) ---
' Busca procesos node.exe que tengan server.js en su linea de comandos
Dim objWMI, colProc, objProc, yaEjecutando
yaEjecutando = False

Set objWMI  = GetObject("winmgmts:\\.\root\cimv2")
Set colProc = objWMI.ExecQuery("SELECT * FROM Win32_Process WHERE Name='node.exe'")

For Each objProc In colProc
  Dim cmdLine
  cmdLine = ""
  On Error Resume Next
  cmdLine = objProc.CommandLine
  On Error GoTo 0
  If InStr(LCase(cmdLine), LCase("server.js")) > 0 Then
    yaEjecutando = True
    Exit For
  End If
Next

If yaEjecutando Then
  ' Ya esta corriendo, no levantamos otra instancia
  WScript.Quit 0
End If

' --- Lanzar node.exe server.js completamente oculto (WindowStyle = 0) ---
' bWaitOnReturn = False para no bloquear el inicio de Windows
Dim comando
comando = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & serverJs & Chr(34)

WshShell.Run comando, 0, False

' --- Limpiar objetos ---
Set colProc = Nothing
Set objWMI  = Nothing
Set WshShell = Nothing
Set fso      = Nothing
