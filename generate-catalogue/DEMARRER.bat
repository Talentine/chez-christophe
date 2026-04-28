@echo off
chcp 65001 >nul 2>&1
title Marchéo — Générateur de catalogues IA

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   Marchéo — Générateur de catalogues IA     ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Vérifier que Node.js est installé
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] Node.js n'est pas installe.
    echo  Telechargez-le sur : https://nodejs.org
    pause
    exit /b 1
)

:: Vérifier que les modules sont installés
if not exist "node_modules" (
    echo  [INFO] Installation des modules Node.js...
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERREUR] Echec de l'installation des modules.
        pause
        exit /b 1
    )
)

:: Créer le .env s'il n'existe pas
if not exist ".env" (
    echo  [CONFIG] Fichier .env non trouve. Configuration initiale...
    echo.
    echo  ┌─────────────────────────────────────────────────┐
    echo  │  Vous avez besoin de 2 cles API :               │
    echo  │                                                  │
    echo  │  1. OpenAI API Key                               │
    echo  │     https://platform.openai.com/api-keys        │
    echo  │     Commencez par : sk-...                       │
    echo  │                                                  │
    echo  │  2. Supabase Service Role Key                    │
    echo  │     https://supabase.com/dashboard/project/     │
    echo  │     epvdzhzwfmtnioedyfgm/settings/api           │
    echo  │     Section "Project API keys" ^> service_role   │
    echo  └─────────────────────────────────────────────────┘
    echo.
    set /p OPENAI_KEY="  Entrez votre cle OpenAI (sk-...) : "
    set /p SUPA_KEY="  Entrez votre Supabase Service Role Key : "
    echo.
    echo OPENAI_API_KEY=%OPENAI_KEY%> .env
    echo SUPABASE_SERVICE_KEY=%SUPA_KEY%>> .env
    echo SUPABASE_URL=https://epvdzhzwfmtnioedyfgm.supabase.co>> .env
    echo  [OK] Fichier .env cree avec succes !
    echo.
)

:: Test de connexion automatique
echo  [INFO] Verification des connexions...
node test-connexion.js
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] La configuration est incomplete. Corrigez le fichier .env
    pause
    exit /b 1
)
echo.

:: Menu de sélection
echo  Quel catalogue voulez-vous generer ?
echo.
echo   [1] Tous les metiers (primeur + boucherie + poissonnerie + fromagerie + boulangerie)
echo   [2] Primeur uniquement
echo   [3] Boucherie uniquement
echo   [4] Poissonnerie uniquement
echo   [5] Fromagerie uniquement
echo   [6] Boulangerie uniquement
echo   [7] Tous — SANS images (test rapide, pas de cout OpenAI image)
echo   [8] Reinitialiser et tout regenerer depuis zero
echo   [Q] Quitter
echo.
set /p CHOIX="  Votre choix [1-8 ou Q] : "

if /i "%CHOIX%"=="Q" exit /b 0
if "%CHOIX%"=="1" (
    echo.
    echo  [INFO] Generation de TOUS les catalogues...
    echo  [INFO] Duree estimee : 60-90 min (images IA incluses)
    echo  [INFO] Couts estimes : ~5-8 euros (DALL-E 3 par produit)
    echo.
    pause
    node generate.js
)
if "%CHOIX%"=="2" node generate.js primeur
if "%CHOIX%"=="3" node generate.js boucherie
if "%CHOIX%"=="4" node generate.js poissonnerie
if "%CHOIX%"=="5" node generate.js fromagerie
if "%CHOIX%"=="6" node generate.js boulangerie
if "%CHOIX%"=="7" (
    echo.
    echo  [INFO] Generation SANS images...
    node generate.js --skip-images
)
if "%CHOIX%"=="8" (
    echo.
    echo  [ATTENTION] Cela va effacer la progression et reinserrer tous les produits.
    set /p CONFIRM="  Confirmer ? [O/N] : "
    if /i "%CONFIRM%"=="O" node generate.js --reset
)

echo.
echo  ════════════════════════════════════════════════
echo   Termine ! Verifiez votre base Supabase :
echo   https://supabase.com/dashboard/project/epvdzhzwfmtnioedyfgm/editor
echo  ════════════════════════════════════════════════
echo.
pause
