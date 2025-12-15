import { FastifyInstance } from 'fastify';
import {
  getAllInstances,
  getInstanceById,
  createInstance,
  updateInstance,
  deleteInstance,
  CreateInstanceInput,
  UpdateInstanceInput,
} from '../db/instance-repository.js';

interface InstanceParams {
  id: string;
}

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  // Get all instances
  app.get('/', async () => {
    const instances = getAllInstances();
    return { instances };
  });
  
  // Get instance by ID
  app.get<{ Params: InstanceParams }>('/:id', async (request, reply) => {
    const instance = getInstanceById(request.params.id);
    
    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' });
    }
    
    return { instance };
  });
  
  // Create instance
  app.post<{ Body: CreateInstanceInput }>('/', async (request, reply) => {
    const { name, apiUrl, apiKey } = request.body;
    
    if (!name || !apiUrl) {
      return reply.status(400).send({ error: 'Name and apiUrl are required' });
    }
    
    const instance = createInstance({ name, apiUrl, apiKey });
    return reply.status(201).send({ instance });
  });
  
  // Update instance
  app.put<{ Params: InstanceParams; Body: UpdateInstanceInput }>('/:id', async (request, reply) => {
    const instance = updateInstance(request.params.id, request.body);
    
    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' });
    }
    
    return { instance };
  });
  
  // Delete instance
  app.delete<{ Params: InstanceParams }>('/:id', async (request, reply) => {
    const deleted = deleteInstance(request.params.id);
    
    if (!deleted) {
      return reply.status(404).send({ error: 'Instance not found' });
    }
    
    return { success: true };
  });
  
  // Check instance health
  app.get<{ Params: InstanceParams }>('/:id/health', async (request, reply) => {
    const instance = getInstanceById(request.params.id);
    
    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' });
    }
    
    try {
      const response = await fetch(`${instance.apiUrl.replace(/\/api\/webhook\/email$/, '')}/health`, {
        method: 'GET',
        headers: instance.apiKey ? { 'Authorization': `Bearer ${instance.apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        // Update status to active if it was in error state
        if (instance.status === 'error') {
          updateInstance(instance.id, { status: 'active' });
        }
        return { healthy: true, status: 'active' };
      } else {
        updateInstance(instance.id, { status: 'error' });
        return { healthy: false, status: 'error', message: `HTTP ${response.status}` };
      }
    } catch (error) {
      updateInstance(instance.id, { status: 'error' });
      return { healthy: false, status: 'error', message: (error as Error).message };
    }
  });
}
