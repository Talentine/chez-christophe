@echo off
title Marcheo - Generateur de catalogues IA
cls

:: Chemin Node.js (ajuste si different sur votre machine)
set NODE="C:\Program Files\nodejs\node.exe"
set NPM="C:\Program Files\nodejs\npm.cmd"

:: Fallback : essayer sans chemin complet si les precedents echouent
%NODE% --version >nul 2>&1
if %errorlevel% neq 0 (
    set NODE=node
    set NPM=npm
)

echo.
echo  ================================================
echo   Marcheo -- Generateur de catalogues produits
echo  ================================================
echo.

:: Verifier que Node.js est accessible
%NODE% --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERREUR : Node.js introuvable.
    echo  Verifiez que le chemin est correct dans DEMARRER.bat
    echo  Chemin actuel : %NODE%
    echo  Telechargez Node.js sur : https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('%NODE% --version') do set NODEVER=%%v
echo  Node.js %NODEVER% detecte.
echo.

:: Installer les modules si besoin
if not exist "node_modules\" (
    echo  Installation des modules Node.js...
    call %NPM% install
    if %errorlevel% neq 0 (
        echo  ERREUR : echec npm install
        pause
        exit /b 1
    )
    echo.
)

:: Creer le .env s'il n'existe pas
if not exist ".env" (
    echo  CONFIGURATION INITIALE
    echo  ------------------------------------------------
    echo  Vous avez besoin de 2 cles API :
    echo.
    echo  1. OpenAI API Key
    echo     https://platform.openai.com/api-keys
    echo     Elle commence par : sk-...
    echo.
    echo  2. Supabase Service Role Key
    echo     https://supabase.com/dashboard/project/
    echo     epvdzhzwfmtnioedyfgm/settings/api
    echo     Section "Project API keys" puis "service_role"
    echo.
    echo  ------------------------------------------------
    echo.
    set /p OPENAI_KEY="  Cle OpenAI (sk-...) : "
    set /p SUPA_KEY="  Supabase Service Role Key : "
    echo.
    %NODE% -e "require('fs').writeFileSync('.env', 'OPENAI_API_KEY=' + process.argv[1] + '\nSUPABASE_SERVICE_KEY=' + process.argv[2] + '\nSUPABASE_URL=https://epvdzhzwfmtnioedyfgm.supabase.co\n')" "%OPENAI_KEY%" "%SUPA_KEY%"
    echo  Fichier .env cree !
    echo.
)

:: Test de connexion
echo  Verification des connexions...
echo.
%NODE% test-connexion.js
if %errorlevel% neq 0 (
    echo.
    echo  ERREUR : La configuration est incomplete.
    echo  Verifiez votre fichier .env
    echo.
    pause
    exit /b 1
)

echo.
echo  ================================================
echo   Que voulez-vous generer ?
echo  ================================================
echo.
echo   1  Tous les metiers  (duree : ~60-90 min, cout : ~8-10 USD)
echo   2  Primeur uniquement
echo   3  Boucherie uniquement
echo   4  Poissonnerie uniquement
echo   5  Fromagerie uniquement
echo   6  Boulangerie uniquement
echo   7  Tous -- SANS images  (test gratuit, donnees seules)
echo   8  Reinitialiser et tout regenerer depuis zero
echo   Q  Quitter
echo.
set /p CHOIX="  Votre choix : "
echo.

if /i "%CHOIX%"=="Q" goto :fin
if "%CHOIX%"=="1" goto :tous
if "%CHOIX%"=="2" goto :primeur
if "%CHOIX%"=="3" goto :boucherie
if "%CHOIX%"=="4" goto :poissonnerie
if "%CHOIX%"=="5" goto :fromagerie
if "%CHOIX%"=="6" goto :boulangerie
if "%CHOIX%"=="7" goto :sans_images
if "%CHOIX%"=="8" goto :reset

echo  Choix invalide. Relancez le script.
goto :fin

:tous
echo  Generation de TOUS les catalogues...
echo  Appuyez sur une touche pour confirmer (fermez pour annuler)
pause
%NODE% generate.js
goto :termine

:primeur
echo  Generation du catalogue Primeur...
%NODE% generate.js primeur
goto :termine

:boucherie
echo  Generation du catalogue Boucherie...
%NODE% generate.js boucherie
goto :termine

:poissonnerie
echo  Generation du catalogue Poissonnerie...
%NODE% generate.js poissonnerie
goto :termine

:fromagerie
echo  Generation du catalogue Fromagerie...
%NODE% generate.js fromagerie
goto :termine

:boulangerie
echo  Generation du catalogue Boulangerie...
%NODE% generate.js boulangerie
goto :termine

:sans_images
echo  Generation SANS images (donnees seules, gratuit)...
%NODE% generate.js --skip-images
goto :termine

:reset
set /p CONFIRM="  Effacer la progression et tout regenerer ? (O/N) : "
if /i "%CONFIRM%"=="O" (
    %NODE% generate.js --reset
)
goto :termine

:termine
echo.
echo  ================================================
echo   Termine ! Verifiez votre base Supabase :
echo   https://supabase.com/dashboard/project/
echo   epvdzhzwfmtnioedyfgm/editor
echo  ================================================
echo.

:fin
pause
