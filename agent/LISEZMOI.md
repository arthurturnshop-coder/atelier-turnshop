# FS Impression
Petit programme local (Windows) qui imprime les tickets sans fenetre d'impression.
- Source : agent.ts (Bun). Compilation : `bun build agent/agent.ts --compile --target=bun-windows-x64-baseline --outfile FS-Impression.exe`
- Installation sur un poste : lancer Installer-FS-Impression.bat (copie l'exe dans %LOCALAPPDATA%\FSImpression et le lance au demarrage de Windows).
- Ecoute sur 127.0.0.1:9101. L'app l'utilise pour les tickets (classe "recu") et retombe sur l'impression normale si le programme n'est pas lance.
- Utilise l'imprimante par defaut de Windows, via Chrome ou Edge lance en --kiosk-printing sur un profil temporaire.
