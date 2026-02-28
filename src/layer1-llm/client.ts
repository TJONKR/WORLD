import Anthropic from '@anthropic-ai/sdk';
import type { JsonSchema7Type } from 'zod-to-json-schema';
import { blueprintJsonSchema } from './schema.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 16384;
const TOOL_NAME = 'generate_world_blueprint';

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic();
  }
  return clientInstance;
}

export interface CallOptions {
  systemPrompt: string;
  userPrompt: string;
}

export async function callForBlueprint(options: CallOptions): Promise<unknown> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: options.systemPrompt,
    messages: [{ role: 'user', content: options.userPrompt }],
    tools: [
      {
        name: TOOL_NAME,
        description:
          'Generate a structured world blueprint with regions, biomes, and transitions.',
        input_schema: blueprintJsonSchema as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool' as const, name: TOOL_NAME },
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolBlock) {
    throw new Error('No tool_use block in response');
  }

  return toolBlock.input;
}
