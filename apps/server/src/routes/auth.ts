import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { createMagicToken, consumeMagicToken } from "../auth/magicLink";
import { sendMagicLinkEmail } from "../auth/email";
import { findUserByEmail, findUserById, createUser } from "../auth/userStore";
import { createSession, findSession, deleteSession } from "../auth/sessions";

const SESSION_COOKIE = "agentcolony_session";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/auth/magic-link
   * Body: { email: string }
   * Sends a magic link to the given email address.
   */
  fastify.post(
    "/api/auth/magic-link",
    {
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { email: string } }>, reply: FastifyReply) => {
      const { email } = request.body;
      const normalised = email.toLowerCase().trim();

      const token = await createMagicToken(normalised);
      const magicUrl = `${BASE_URL}/api/auth/callback?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalised)}`;

      try {
        await sendMagicLinkEmail(normalised, magicUrl);
      } catch (err) {
        fastify.log.warn({ err, email: normalised }, "Failed to send magic link email");
        // Don't leak the error — still return 200 to prevent email enumeration
      }

      return reply.send({ ok: true, message: "If that email exists, a magic link has been sent." });
    }
  );

  /**
   * GET /api/auth/callback?token=...&email=...
   * Validates the magic link token and creates a session.
   * Redirects to the frontend with the session cookie set.
   */
  fastify.get(
    "/api/auth/callback",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["token", "email"],
          properties: {
            token: { type: "string" },
            email: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { token: string; email: string } }>,
      reply: FastifyReply
    ) => {
      const { token, email } = request.query;

      let verifiedEmail: string;
      try {
        verifiedEmail = await consumeMagicToken(token);
      } catch (err) {
        return reply.code(400).send({ error: "Invalid or expired magic link." });
      }

      if (verifiedEmail !== email.toLowerCase().trim()) {
        return reply.code(400).send({ error: "Token/email mismatch." });
      }

      // Upsert user
      const user = await (findUserByEmail(verifiedEmail).then(
        (u) => u ?? createUser(verifiedEmail)
      ));

      const session = await createSession(user.id);

      const frontendUrl = process.env.CORS_ORIGIN ?? "http://localhost:5173";

      return reply
        .setCookie(SESSION_COOKIE, session.sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          expires: session.expires,
        })
        .redirect(`${frontendUrl}/dashboard`);
    }
  );

  /**
   * GET /api/auth/session
   * Returns the current session and user, or 401.
   */
  fastify.get("/api/auth/session", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) return reply.code(401).send({ error: "Not authenticated" });

    const session = await findSession(token);
    if (!session) return reply.code(401).send({ error: "Session expired" });

    const user = await findUserById(session.userId);
    if (!user) return reply.code(401).send({ error: "User not found" });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        walletAddress: user.walletAddress,
        subscription: user.subscription,
        bridgeInstalled: user.bridgeInstalled,
        totalContributedToCommons: user.totalContributedToCommons,
      },
      expires: session.expires,
    });
  });

  /**
   * POST /api/auth/signout
   * Clears the session cookie and deletes the server-side session.
   */
  fastify.post("/api/auth/signout", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) {
      await deleteSession(token).catch(() => {/* ignore */});
    }

    return reply
      .clearCookie(SESSION_COOKIE, { path: "/" })
      .send({ ok: true });
  });
};
