/**
 * The app id bound into the Unlink identity derivation. Lives in its own
 * side-effect-free, non-"use client" module so BOTH the browser client and
 * server routes can import the value: a `"use client"` module's value exports
 * become undefined client-references when imported from a server (RSC) route.
 * Keep stable — changing it changes every derived agent identity.
 */
export const UNLINK_APP_ID = "shade";
