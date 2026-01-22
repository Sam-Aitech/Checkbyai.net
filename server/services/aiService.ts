import OpenAI from 'openai';

interface AIProvider {
  name: string;
  client: OpenAI;
  model: string;
}

interface StreamResponse {
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  provider: string;
}

const providers: AIProvider[] = [];

// Initialize OpenAI (primary)
if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  providers.push({
    name: 'OpenAI',
    client: new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    }),
    model: 'gpt-4.1-mini',
  });
}

// Initialize Anthropic/Claude (backup)
if (process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
  providers.push({
    name: 'Claude',
    client: new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    }),
    model: 'claude-sonnet-4-5',
  });
}

// Initialize OpenRouter/DeepSeek (fallback)
if (process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY) {
  providers.push({
    name: 'DeepSeek',
    client: new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
    }),
    model: 'deepseek/deepseek-chat',
  });
}

export async function createChatCompletionWithFallback(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options: { maxTokens?: number; stream?: boolean } = {}
): Promise<StreamResponse> {
  const { maxTokens = 2000, stream = true } = options;
  
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      console.log(`[AI Service] Attempting ${provider.name}...`);
      
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages,
        stream: true,
        max_tokens: maxTokens,
      });

      console.log(`[AI Service] Successfully connected to ${provider.name}`);
      return { stream: response, provider: provider.name };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name}: ${errorMsg}`);
      console.error(`[AI Service] ${provider.name} failed:`, errorMsg);
      continue;
    }
  }

  throw new Error(`All AI providers failed: ${errors.join('; ')}`);
}

export async function createChatCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options: { maxTokens?: number } = {}
): Promise<{ content: string; provider: string }> {
  const { maxTokens = 2000 } = options;
  
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      console.log(`[AI Service] Attempting ${provider.name}...`);
      
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages,
        max_tokens: maxTokens,
      });

      const content = response.choices[0]?.message?.content || '';
      console.log(`[AI Service] Successfully got response from ${provider.name}`);
      return { content, provider: provider.name };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name}: ${errorMsg}`);
      console.error(`[AI Service] ${provider.name} failed:`, errorMsg);
      continue;
    }
  }

  throw new Error(`All AI providers failed: ${errors.join('; ')}`);
}

export function getAvailableProviders(): string[] {
  return providers.map(p => p.name);
}

export function hasAnyProvider(): boolean {
  return providers.length > 0;
}
