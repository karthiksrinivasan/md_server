import { AgentRegistry } from './agent-registry';

let instance: AgentRegistry | null = null;
let detected = false;

export async function getAgentRegistry(customConfigPath?: string): Promise<AgentRegistry> {
  if (!instance) {
    instance = new AgentRegistry(customConfigPath);
  }
  if (!detected) {
    await instance.detectAvailable();
    detected = true;
  }
  return instance;
}

export function resetAgentRegistry(): void {
  instance = null;
  detected = false;
}
