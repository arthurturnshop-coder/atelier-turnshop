# FS Impression
Petit programme local (Windows) qui imprime les tickets sans fenetre d'impression.
- Source : agent.ts (Bun). Compilation : `bun build agent/agent.ts --compile --target=bun-windows-x64-baseline --outfile FS-Impression.exe`
- Installation sur un poste : lancer Installer-FS-Impression.bat (copie l'exe dans %LOCALAPPDATA%\FSImpression et le lance au demarrage de Windows).
- Ecoute sur 127.0.0.1:9101. L'app l'utilise pour les tickets (classe "recu") et retombe sur l'impression normale si le programme n'est pas lance.
- Utilise l'imprimante par defaut de Windows, via Chrome ou Edge lance en --kiosk-printing sur un profil temporaire.

## Mac (version 2.3)
- Installation : `cd ~/atelier-turnshop && git pull && bash agent/installer-mac.sh` (installe Bun si besoin, lance le programme a chaque ouverture de session).
- Prerequis : Google Chrome (ou Edge/Brave) installe, imprimantes ajoutees dans Reglages Systeme > Imprimantes et scanners. Ticket 80 mm : imprimante par defaut du Mac, envoi ESC/POS brut via `lp -o raw`. Etiquettes : imprimante dont le nom contient "Brother" ou "QL", envoi d'une image par etiquette via `lp` (taille personnalisee).
- A utiliser depuis Chrome (Safari bloque l'acces a 127.0.0.1 depuis une page https).
- Diagnostic : http://127.0.0.1:9101/log et /tmp/fsimpression.log.
