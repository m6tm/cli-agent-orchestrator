import { sign, verify, SignOptions } from "jsonwebtoken";
import { Agent } from "../types/index.js";

/**
 * Security Service
 * Handles JWT generation, verification, and secret management
 */

export interface JwtConfig {
  secret: string;
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
}

export interface AgentTokenPayload {
  sub: string; // agent ID
  companyId: string;
  agentId: string;
  runId: string;
  type: "agent";
  iat: number;
  exp: number;
}

export class SecurityService {
  private config: JwtConfig;

  constructor(config: JwtConfig) {
    if (!config.secret || config.secret.length < 32) {
      throw new Error("JWT secret must be at least 32 characters long");
    }
    this.config = {
      expiresIn: "1h",
      issuer: "cli-agent-orchestrator",
      audience: "agent-cli",
      ...config,
    };
  }

  /**
   * Generate a temporary JWT for an agent run
   */
  generateAgentToken(agent: Agent, runId: string): string {
    const payload = {
      sub: agent.id,
      companyId: agent.companyId,
      agentId: agent.id,
      runId,
      type: "agent" as const,
    };

    const options: SignOptions = {
      expiresIn: (this.config.expiresIn ?? "1h") as any,
      issuer: this.config.issuer,
      audience: this.config.audience,
    };

    return sign(payload, this.config.secret, options);
  }

  /**
   * Verify and decode an agent token
   */
  verifyAgentToken(token: string): AgentTokenPayload {
    try {
      const decoded = verify(token, this.config.secret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      }) as AgentTokenPayload;

      if (decoded.type !== "agent") {
        throw new Error("Invalid token type");
      }

      return decoded;
    } catch (err) {
      throw new Error(`Token verification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Check if a token is expired (without verifying signature)
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      return decoded.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }

  /**
   * Redact sensitive values from environment variables for logging
   */
  static redactSecrets(env: Record<string, string>): Record<string, string> {
    const redacted = { ...env };
    const sensitiveKeys = ["api_key", "token", "secret", "password", "auth"];

    for (const key of Object.keys(redacted)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        redacted[key] = "***REDACTED***";
      }
    }

    return redacted;
  }
}

// Factory for creating with env-based config
export function createSecurityServiceFromEnv(): SecurityService {
  const secret = process.env.ORCHESTRATOR_JWT_SECRET;
  if (!secret) {
    throw new Error("ORCHESTRATOR_JWT_SECRET environment variable is required");
  }

  return new SecurityService({
    secret,
    expiresIn: process.env.ORCHESTRATOR_JWT_EXPIRES_IN || "1h",
    issuer: process.env.ORCHESTRATOR_JWT_ISSUER || "cli-agent-orchestrator",
    audience: process.env.ORCHESTRATOR_JWT_AUDIENCE || "agent-cli",
  });
}
