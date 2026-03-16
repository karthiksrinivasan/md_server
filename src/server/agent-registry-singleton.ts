import { AgentRegistry } from './agent-registry';

let instance: AgentRegistry | null = null;
let detectPromise: Promise<void> | null = null;

export async function getAgentRegistry(customConfigPath?: string): Promise<AgentRegistry> {
  if (!instance) {
    instance = new AgentRegistry(customConfigPath);
  }
  if (!detectPromise) {
    detectPromise = instance.detectAvailable();
  }
  await detectPromise;
  return instance;
}

export function resetAgentRegistry(): void {
  instance = null;
  detectPromise = null;
}
