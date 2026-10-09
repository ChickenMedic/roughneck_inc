@echo off
title Wildcat CEO - tests
cd /d "%~dp0"
echo === smoke test ===
node test\smoke.mjs
echo.
echo === era tables ===
node test\eratest.mjs
echo.
echo === geography ===
node test\geotest.mjs
echo.
echo === approach Monte Carlo ===
node test\approachtest.mjs
echo.
echo === pool depletion ===
node test\pooltest.mjs
echo.
echo === well health ===
node test\healthtest.mjs
echo.
echo === founding phase ===
node test\foundtest.mjs
echo.
echo === headless bot (seed 42, 30 years) ===
node test\headless.mjs 42 30
echo.
pause
