import { FastifyInstance } from 'fastify';
import { getAllInstances, getInstanceById } from '../db/instance-repository.js';

interface InstanceParams {
  id: string;
}

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  // Get aggregated stats from all instances
  app.get('/', async () => {
    const instances = getAllInstances();
    const stats: any[] = [];
    
    for (const instance of instances) {
      if (instance.status !== 'active') continue;
      
      try {
        const baseUrl = instance.apiUrl.replace(/\/api\/webhook\/email$/, '');
        const response = await fetch(`${baseUrl}/api/stats`, {
          method: 'GET',
          headers: instance.apiKey ? { 'Authorization': `Bearer ${instance.apiKey}` } : {},
          signal: AbortSignal.timeout(5000),
        });
        
        if (response.ok) {
          const data = await response.json() as Record<string, unknown>;
          stats.push({
            instanceId: instance.id,
            instanceName: instance.name,
            ...data,
          });
        }
      } catch (error) {
        // Skip failed instances
      }
    }
    
    return { stats };
  });
  
  // Get stats from specific instance
  app.get<{ Params: InstanceParams }>('/:id', async (request, reply) => {
    const instance = getInstanceById(request.params.id);
    
    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' });
    }
    
    try {
      const baseUrl = instance.apiUrl.replace(/\/api\/webhook\/email$/, '');
      const response = await fetch(`${baseUrl}/api/stats`, {
        method: 'GET',
        headers: instance.apiKey ? { 'Authorization': `Bearer ${instance.apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>;
        return {
          instanceId: instance.id,
          instanceName: instance.name,
          ...data,
        };
      } else {
        return reply.status(502).send({ error: 'Failed to fetch stats from instance' });
      }
    } catch (error) {
      return reply.status(502).send({ error: 'Failed to connect to instance' });
    }
  });
}
