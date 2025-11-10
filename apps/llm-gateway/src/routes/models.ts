import { FastifyPluginAsync } from 'fastify';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'models-route' });

export const modelRoutes: FastifyPluginAsync = async (server) => {
  // List all available models from all providers
  server.get('/models', async (request, reply) => {
    try {
      const models = await server.providerRegistry.listAllModels();

      logger.info({ modelCount: models.length }, 'Listed models');

      return {
        models,
        providers: server.providerRegistry.getProviderNames(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to list models');
      throw error;
    }
  });

  // List models for a specific provider
  server.get('/models/:provider', async (request, reply) => {
    const { provider: providerName } = request.params as { provider: string };

    try {
      const provider = server.providerRegistry.getProvider(`${providerName}/dummy`);
      const models = await provider.listModels();

      logger.info({ provider: providerName, modelCount: models.length }, 'Listed provider models');

      return {
        provider: providerName,
        models: models.map((m) => ({
          ...m,
          id: `${providerName}/${m.id}`,
        })),
      };
    } catch (error: any) {
      logger.error({ error, provider: providerName }, 'Failed to list provider models');
      throw error;
    }
  });
};
