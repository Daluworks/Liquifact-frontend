/**
 * Centralized constants for the application.
 *
 * This value is the sole allowed destination for wallet installation. Consumers
 * must compare against it before opening an external window; copy content is
 * mutable at runtime and must not become an authorization boundary.
 */
export const TRUSTED_WALLET_INSTALL_URL = "https://www.stellar.org/wallets";
