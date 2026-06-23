import { describe, it, expect, beforeEach } from "vitest";
import { SecurityService } from "../../src/security/jwt.js";
import { Agent } from "../../src/types/index.js";

describe("SecurityService", () => {
  const validSecret = "a".repeat(32);
  let service: SecurityService;

  const mockAgent: Agent = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    companyId: "550e8400-e29b-41d4-a716-446655440001",
    name: "Test Agent",
    adapterType: "generic",
    adapterConfig: {},
  };

  beforeEach(() => {
    service = new SecurityService({ secret: validSecret });
  });

  it("should throw for short secret", () => {
    expect(() => new SecurityService({ secret: "short" })).toThrow("at least 32 characters");
  });

  it("should generate a valid token", () => {
    const token = service.generateAgentToken(mockAgent, "run-123");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("should verify a valid token", () => {
    const token = service.generateAgentToken(mockAgent, "run-123");
    const payload = service.verifyAgentToken(token);
    expect(payload.agentId).toBe(mockAgent.id);
    expect(payload.companyId).toBe(mockAgent.companyId);
    expect(payload.runId).toBe("run-123");
    expect(payload.type).toBe("agent");
  });

  it("should reject invalid token", () => {
    expect(() => service.verifyAgentToken("invalid.token.here")).toThrow("Token verification failed");
  });

  it("should reject expired token", () => {
    const expiredService = new SecurityService({ secret: validSecret, expiresIn: "-1h" });
    const token = expiredService.generateAgentToken(mockAgent, "run-123");
    expect(() => service.verifyAgentToken(token)).toThrow("Token verification failed");
  });

  it("should detect expired token", () => {
    const expiredService = new SecurityService({ secret: validSecret, expiresIn: "-1h" });
    const token = expiredService.generateAgentToken(mockAgent, "run-123");
    expect(service.isTokenExpired(token)).toBe(true);
  });

  it("should not detect valid token as expired", () => {
    const token = service.generateAgentToken(mockAgent, "run-123");
    expect(service.isTokenExpired(token)).toBe(false);
  });

  it("should redact secrets in env", () => {
    const env = {
      ORCHESTRATOR_API_KEY: "secret123",
      NORMAL_VAR: "visible",
      PASSWORD: "hunter2",
      SOME_TOKEN: "tok123",
    };
    const redacted = SecurityService.redactSecrets(env);
    expect(redacted.ORCHESTRATOR_API_KEY).toBe("***REDACTED***");
    expect(redacted.NORMAL_VAR).toBe("visible");
    expect(redacted.PASSWORD).toBe("***REDACTED***");
    expect(redacted.SOME_TOKEN).toBe("***REDACTED***");
  });
});
