import path from 'node:path';
import { AgentRegistry } from './agent-registry';
import { getConfig } from './config';

let instance: AgentRegistry | null = null;
let detectPromise: Promise<void> | null = null;

export async function getAgentRegistry(): Promise<AgentRegistry> {
  if (!instance) {
    const config = getConfig();
    const customConfigPath = path.join(config.rootDir, '.md_server', 'agents.json');
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
