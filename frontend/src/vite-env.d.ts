/**
 * Vite's ambient module declarations - notably the side-effect CSS imports used
 * by src/index.ts (`import './styles/main.css'`).
 *
 * TypeScript 5 tolerated an untyped side-effect import silently; TS 6 reports it
 * as TS2882, so declare it properly rather than relying on that leniency.
 */
/// <reference types="vite/client" />
