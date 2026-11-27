import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import {
  createExtensionRuntime, defineTool, loadSkillsFromDir, type ResourceLoader, type Skill, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { agentContentDirectory, agentInstructions, toolMetadata } from './content.js';

const skillsDirectory = fileURLToPath(new URL('skills/', agentContentDirectory));

function readCollectionSkill(skill: Skill) {
  const metadata = toolMetadata('read_skill');
  return defineTool({
    ...metadata,
    parameters: Type.Object({ name: Type.Literal(skill.name) }),
    async execute() {
      const text = await readFile(skill.filePath, 'utf8');
      return { content: [{ type: 'text', text }], details: { label: metadata.label, summary: '已加载信息采集工作流' } };
    },
  });
}

export function createCreatorResources(tools: ToolDefinition[]) {
  // 采集会话通过专用工具读取已加载的 Skill。
  const collectionResearch = tools.some(tool => tool.name === 'search_x_posts');
  const skills = collectionResearch
    ? loadSkillsFromDir({ dir: skillsDirectory, source: 'creator-studio' })
    : { skills: [], diagnostics: [] };
  const skill = skills.skills.find(candidate => candidate.name === 'collection-research');
  const sessionTools = skill ? [...tools, readCollectionSkill(skill)] : tools;
  const runtime = createExtensionRuntime();
  const resourceLoader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime }),
    getSkills: () => skills,
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => agentInstructions,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
  return { resourceLoader, sessionTools };
}
