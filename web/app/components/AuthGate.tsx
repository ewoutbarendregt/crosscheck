"use client";

import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
} from "@azure/msal-browser";
import { useEffect, useMemo, useState } from "react";

interface BrandingConfig {
  appName: string;
  logoUrl?: string;
  primaryColor?: string;
  backgroundColor?: string;
}

interface PublicProviderConfig {
  id: string;
  label: string;
  extraQueryParameters?: Record<string, string>;
}

interface AuthConfigResponse {
  mode: "enterprise" | "public";
  clientId: string;
  authority: string;
  scopes: string[];
  apiScope: string;
  branding: BrandingConfig;
  publicProviders: PublicProviderConfig[];
}

interface AuthenticatedUser {
  name?: string;
  email?: string;
  roles: string[];
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function AuthGate() {
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [userProfile, setUserProfile] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const msalInstance = useMemo(() => {
    if (!config) {
      return null;
    }

    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        authority: config.authority,
        redirectUri: typeof window === "undefined" ? undefined : window.location.origin,
      },
      cache: {
        cacheLocation: "localStorage",
      },
    };

    return new PublicClientApplication(msalConfig);
  }, [config]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/config`);
        if (!response.ok) {
          throw new Error(`Failed to load auth config (${response.status})`);
        }
        const data = (await response.json()) as AuthConfigResponse;
        setConfig(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load auth config");
      }
    };

    loadConfig();
  }, []);

  useEffect(() => {
    if (!msalInstance || !config) {
      return;
    }

    const handleRedirect = async () => {
      try {
        const response = await msalInstance.handleRedirectPromise();
        const activeAccount =
          response?.account ?? msalInstance.getActiveAccount();

        if (!activeAccount) {
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
            setAccount(accounts[0]);
          } else if (config.mode === "enterprise") {
            await attemptSilentEnterpriseSignIn(msalInstance, config);
          }
        } else {
          msalInstance.setActiveAccount(activeAccount);
          setAccount(activeAccount);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Authentication error");
      }
    };

    handleRedirect();
  }, [config, msalInstance]);

  useEffect(() => {
    if (!msalInstance || !account || !config) {
      return;
    }

    const loadProfile = async () => {
      try {
        const tokenResponse = await msalInstance.acquireTokenSilent({
          account,
          scopes: [config.apiScope, ...config.scopes],
        });
        const response = await fetch(`${API_BASE_URL}/me`, {
          headers: {
            Authorization: `Bearer ${tokenResponse.accessToken}`,
          },
        });
        if (!response.ok) {
          throw new Error("Failed to fetch user profile");
        }
        setUserProfile((await response.json()) as AuthenticatedUser);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load profile");
      }
    };

    loadProfile();
  }, [account, config, msalInstance]);

  const handleLogin = async (provider?: PublicProviderConfig) => {
    if (!msalInstance || !config) {
      return;
    }

    try {
      await msalInstance.loginRedirect({
        scopes: [config.apiScope, ...config.scopes],
        extraQueryParameters: provider?.extraQueryParameters,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  const handleLogout = async () => {
    if (!msalInstance) {
      return;
    }

    await msalInstance.logoutRedirect();
  };

  if (error) {
    return (
      <section>
        <h2>Authentication error</h2>
        <p>{error}</p>
      </section>
    );
  }

  if (!config) {
    return <p>Loading authentication settings…</p>;
  }

  return (
    <section style={buildBrandingStyle(config.branding)}>
      <header style={styles.header}>
        {config.branding.logoUrl ? (
          <img
            src={config.branding.logoUrl}
            alt={`${config.branding.appName} logo`}
            style={styles.logo}
          />
        ) : null}
        <div>
          <h1 style={styles.title}>{config.branding.appName}</h1>
          <p style={styles.subtitle}>
            {config.mode === "enterprise"
              ? "Signing you in with your organization account"
              : "Sign in to continue"}
          </p>
        </div>
      </header>

      {account ? (
        <div style={styles.card}>
          <p>
            Signed in as <strong>{account.name ?? account.username}</strong>
          </p>
          {userProfile ? (
            <p>Roles: {userProfile.roles.join(", ")}</p>
          ) : (
            <p>Loading profile…</p>
          )}
          <button onClick={handleLogout} style={styles.primaryButton}>
            Sign out
          </button>
        </div>
      ) : config.mode === "public" ? (
        <div style={styles.card}>
          <p>Select a login provider:</p>
          <div style={styles.buttonGroup}>
            {config.publicProviders.map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleLogin(provider)}
                style={styles.primaryButton}
              >
                Continue with {provider.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <p>Attempting single sign-on…</p>
          <button onClick={() => handleLogin()} style={styles.secondaryButton}>
            Use another account
          </button>
        </div>
      )}
    </section>
  );
}

async function attemptSilentEnterpriseSignIn(
  msalInstance: PublicClientApplication,
  config: AuthConfigResponse,
) {
  try {
    const response = await msalInstance.ssoSilent({
      scopes: [config.apiScope, ...config.scopes],
    });
    msalInstance.setActiveAccount(response.account);
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await msalInstance.loginRedirect({
        scopes: [config.apiScope, ...config.scopes],
        prompt: "none",
      });
      return;
    }
    throw err;
  }
}

function buildBrandingStyle(branding: BrandingConfig) {
  return {
    ...styles.container,
    color: branding.primaryColor ?? styles.container.color,
    background: branding.backgroundColor ?? styles.container.background,
  } as const;
}

const styles = {
  container: {
    minHeight: "100vh",
    padding: "2.5rem",
    fontFamily: "system-ui, sans-serif",
    background: "#f7f9fb",
    color: "#111827",
  },
  header: {
    display: "flex",
    gap: "1rem",
    alignItems: "center",
    marginBottom: "2rem",
  },
  logo: {
    width: "56px",
    height: "56px",
    objectFit: "contain" as const,
  },
  title: {
    margin: 0,
  },
  subtitle: {
    margin: "0.25rem 0 0",
    color: "#4b5563",
  },
  card: {
    padding: "1.5rem",
    borderRadius: "12px",
    background: "#ffffff",
    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
    maxWidth: "420px",
  },
  buttonGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
    marginTop: "1rem",
  },
  primaryButton: {
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    border: "none",
    background: "#2563eb",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "0.95rem",
  },
  secondaryButton: {
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    border: "1px solid #cbd5f5",
    background: "#ffffff",
    color: "#1e3a8a",
    cursor: "pointer",
    fontSize: "0.95rem",
    marginTop: "1rem",
  },
};
