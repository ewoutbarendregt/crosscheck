import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthMode = "enterprise" | "public";

export interface BrandingConfig {
  appName: string;
  logoUrl?: string;
  primaryColor?: string;
  backgroundColor?: string;
}

export interface PublicProviderConfig {
  id: string;
  label: string;
  extraQueryParameters?: Record<string, string>;
}

export interface AuthConfig {
  mode: AuthMode;
  clientId: string;
  authority: string;
  issuer: string;
  audience: string;
  scopes: string[];
  apiScope: string;
  roleClaim: string;
  allowedRoles: string[];
  defaultRole: string;
  branding: BrandingConfig;
  publicProviders: PublicProviderConfig[];
}

export interface AuthenticatedUser {
  oid?: string;
  name?: string;
  email?: string;
  roles: string[];
}

const DEFAULT_ALLOWED_ROLES = ["admin", "coordinator", "user"];

const DEFAULT_PUBLIC_PROVIDERS: PublicProviderConfig[] = [
  { id: "microsoft", label: "Microsoft" },
  { id: "google", label: "Google" },
];

const DEFAULT_BRANDING: BrandingConfig = {
  appName: "CrossCheck",
};

export function loadAuthConfig(): AuthConfig {
  const mode = (process.env.AUTH_MODE ?? "enterprise") as AuthMode;

  if (mode !== "enterprise" && mode !== "public") {
    throw new Error(`Unsupported AUTH_MODE: ${mode}`);
  }

  const tenantId =
    mode === "enterprise"
      ? requiredEnv("AUTH_TENANT_ID")
      : requiredEnv("AUTH_PUBLIC_TENANT_ID");

  const clientId =
    mode === "enterprise"
      ? requiredEnv("AUTH_CLIENT_ID")
      : requiredEnv("AUTH_PUBLIC_CLIENT_ID");

  const defaultAuthority =
    mode === "enterprise"
      ? `https://login.microsoftonline.com/${tenantId}`
      : `https://${tenantId}.ciamlogin.com/${tenantId}.onmicrosoft.com`;

  const authority = process.env.AUTH_AUTHORITY ?? defaultAuthority;
  const issuer = process.env.AUTH_ISSUER ?? `${authority}/v2.0`;
  const audience = process.env.AUTH_AUDIENCE ?? clientId;
  const scopes = parseList(process.env.AUTH_SCOPES ?? "openid,profile,email");
  const apiScope =
    process.env.AUTH_API_SCOPE ??
    `api://${audience}/user_impersonation`;
  const roleClaim = process.env.AUTH_ROLE_CLAIM ?? "roles";
  const allowedRoles = parseList(
    process.env.AUTH_ALLOWED_ROLES ?? DEFAULT_ALLOWED_ROLES.join(","),
  );
  const defaultRole = process.env.AUTH_DEFAULT_ROLE ?? "user";

  const branding: BrandingConfig = {
    ...DEFAULT_BRANDING,
    appName: process.env.AUTH_BRANDING_APP_NAME ?? DEFAULT_BRANDING.appName,
    logoUrl: process.env.AUTH_BRANDING_LOGO_URL ?? undefined,
    primaryColor: process.env.AUTH_BRANDING_PRIMARY_COLOR ?? undefined,
    backgroundColor: process.env.AUTH_BRANDING_BACKGROUND_COLOR ?? undefined,
  };

  const publicProviders = parseProviders(
    process.env.AUTH_PUBLIC_PROVIDERS,
  );

  return {
    mode,
    clientId,
    authority,
    issuer,
    audience,
    scopes,
    apiScope,
    roleClaim,
    allowedRoles,
    defaultRole,
    branding,
    publicProviders,
  };
}

export function buildAuthConfigResponse(config: AuthConfig) {
  return {
    mode: config.mode,
    clientId: config.clientId,
    authority: config.authority,
    scopes: config.scopes,
    apiScope: config.apiScope,
    branding: config.branding,
    publicProviders: config.publicProviders,
  };
}

export function buildAuthenticator(config: AuthConfig) {
  const jwks = createRemoteJWKSet(
    new URL(`${config.authority}/discovery/v2.0/keys`),
  );

  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const header = request.headers.authorization;
    if (!header) {
      reply.code(401);
      return reply.send({ error: "Missing Authorization header" });
    }

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      reply.code(401);
      return reply.send({ error: "Invalid Authorization header" });
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
      });

      const roles = extractRoles(payload, config.roleClaim);
      const normalizedRoles = roles.length > 0 ? roles : [config.defaultRole];
      const unknownRoles = normalizedRoles.filter(
        (role) => !config.allowedRoles.includes(role),
      );

      if (unknownRoles.length > 0) {
        reply.code(403);
        return reply.send({ error: "Unauthorized role" });
      }

      request.user = {
        oid: stringValue(payload.oid),
        name: stringValue(payload.name),
        email: stringValue(payload.preferred_username ?? payload.email),
        roles: normalizedRoles,
      };
    } catch (error) {
      request.log.error({ error }, "Failed to verify auth token");
      reply.code(401);
      return reply.send({ error: "Invalid token" });
    }
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseProviders(value?: string): PublicProviderConfig[] {
  if (!value) {
    return DEFAULT_PUBLIC_PROVIDERS;
  }

  try {
    const parsed = JSON.parse(value) as PublicProviderConfig[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to parse AUTH_PUBLIC_PROVIDERS", error);
  }

  return DEFAULT_PUBLIC_PROVIDERS;
}

function extractRoles(payload: Record<string, unknown>, claim: string): string[] {
  const roles = payload[claim];
  if (Array.isArray(roles)) {
    return roles.filter((role): role is string => typeof role === "string");
  }

  if (typeof roles === "string") {
    return [roles];
  }

  return [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
