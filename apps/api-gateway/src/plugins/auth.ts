import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthenticationError, AuthorizationError, type Role } from '@phalanx/shared';

export interface UserPayload {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  roles: Role[];
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: UserPayload;
  }
}

export const authPlugin: FastifyPluginAsync = async (server) => {
  const jwtSecret = process.env.JWT_SECRET || 'change-me-in-production';
  const oidcIssuer = process.env.OIDC_ISSUER_URL;
  const oidcAudience = process.env.OIDC_AUDIENCE;

  // Register JWT plugin for local token verification
  await server.register(fastifyJwt, {
    secret: jwtSecret,
  });

  // OIDC verification
  let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  if (oidcIssuer) {
    const jwksUrl = new URL('/.well-known/jwks.json', oidcIssuer);
    jwks = createRemoteJWKSet(jwksUrl);
  }

  // Authentication decorator
  server.decorate('authenticate', async function (request, reply) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    try {
      let payload: any;

      // Try OIDC verification first if configured
      if (jwks && oidcIssuer) {
        const { payload: oidcPayload } = await jwtVerify(token, jwks, {
          issuer: oidcIssuer,
          audience: oidcAudience,
        });
        payload = oidcPayload;
      } else {
        // Fall back to local JWT verification
        payload = await request.jwtVerify();
      }

      // Extract user information
      request.user = {
        sub: payload.sub || payload.user_id,
        email: payload.email,
        name: payload.name || payload.preferred_username,
        tenantId: payload.tenant_id || payload.tid || 'default',
        roles: payload.roles || ['viewer'],
      };
    } catch (err) {
      throw new AuthenticationError('Invalid or expired token', { error: err });
    }
  });

  // Authorization decorator
  server.decorate('authorize', function (requiredRoles: Role[]) {
    return async function (request, reply) {
      if (!request.user) {
        throw new AuthenticationError('User not authenticated');
      }

      const hasRequiredRole = requiredRoles.some((role) => request.user!.roles.includes(role));

      if (!hasRequiredRole) {
        throw new AuthorizationError(`Requires one of roles: ${requiredRoles.join(', ')}`, {
          requiredRoles,
          userRoles: request.user.roles,
        });
      }
    };
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    authorize: (roles: Role[]) => (request: any, reply: any) => Promise<void>;
  }
}

export default fp(authPlugin, {
  name: 'auth',
});
