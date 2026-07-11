import OpenAI from 'openai';
import {
  ChatCompletionTool,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionFunctionTool,
} from 'openai/resources/chat/completions';

// 1. Konfiguracja klienta OpenAI skierowanego na lokalną Ollamę
const openai = new OpenAI({
  baseURL: 'http://127.0.0.1:1234/v1',
  apiKey: 'ollama',
});

const MODEL_NAME = 'qwen3:7b';

// Interfejs dla narzędzia z własną metodą wykonawczą
interface SmartHomeTool extends ChatCompletionFunctionTool {
  call: (args: any) => Promise<string>;
}

const knownDevices = [
  'light.salon.1',
  'light.salon.2',
  'light.salon.3',
  'light.lazienka',
];

const deviceState: Record<string, string> = {
  'light.salon.1': 'ON',
  'light.salon.2': 'ON',
  'light.salon.3': 'ON',
  'light.lazienka': 'ON',
}

// 2. DEFINICJE NARZĘDZI z ciałem wykonawczym w `call`
const toolsDefinition: SmartHomeTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_device_status',
      description: 'Pobiera aktualny stan wybranego urządzenia w smart home.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'Identyfikator encji, np. light.salon, switch.pompa' }
        },
        required: ['entity_id']
      }
    },
    async call(args: { entity_id: string }) {
      if (!knownDevices.includes(args.entity_id)) {
        const knownDevicesList = knownDevices.length > 0 ? '* ' + knownDevices.join('\n* ') : '';
        return JSON.stringify({ error: `Urządzenie ${args.entity_id} nie zostało rozpoznane. Dostępne urządzenia: \n${knownDevicesList}`});
      }

      return deviceState[args.entity_id];
    }
  },
  {
    type: 'function',
    function: {
      name: 'control_all_devices_in_room',
      description: 'Włącza lub wyłącza wszystkie urządzenia w pokoju.',
      parameters: {
        type: 'object',
        properties: {
          room: { type: 'string', description: 'Identyfikator pokoju np. salon' },
          action: { type: 'string', enum: ['turn_on', 'turn_off'], description: 'Akcja do wykonania' }
        },
        required: ['room', 'action']
      }
    },
    async call(args: { entity_id: string; action: 'turn_on' | 'turn_off' }) {
      return 'pracuję'
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_devices',
      description: 'Lists all known devices, optionally filtered by state (ON/OFF).',
      parameters: {
        type: 'object',
        properties: {
          state_filter: { type: 'string', enum: ['ON', 'OFF'], description: 'Optional filter by device state' }
        },
      }
    },
    async call(args: { state_filter?: 'ON' | 'OFF' }) {
      const entries = Object.entries(deviceState);
      const filtered = args.state_filter ? entries.filter(([_, s]) => s === args.state_filter) : entries;
      return JSON.stringify(filtered.map(([id, state]) => ({ id, state })));
    }
  },
  {
    type: 'function',
    function: {
      name: 'control_device',
      description: 'Włącza lub wyłącza urządzenie (np. światło, przełącznik).',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'Identyfikator encji, np. light.salon' },
          action: { type: 'string', enum: ['turn_on', 'turn_off'], description: 'Akcja do wykonania' }
        },
        required: ['entity_id', 'action']
      }
    },
    async call(args: { entity_id: string; action: 'turn_on' | 'turn_off' }) {
      const entity = args.entity_id as keyof typeof deviceState;
      if (entity in deviceState) {
        deviceState[entity] = args.action === 'turn_on' ? 'ON' : 'OFF';
      } else {
        return JSON.stringify({
          error: true,
          message: 'To urządzenie nie istnieje',
        });
      }

      return JSON.stringify({
        success: true,
        message: `Urządzenie ${args.entity_id} zmieniło stan na ${args.action}`
      });
    }
  }
];

// 3. GŁÓWNA PĘTLA AGENTOWA (Agentic Loop)
async function runAgent(userCommand: string): Promise<string> {
  console.log(`\n\x1b[36m[User]: ${userCommand}\x1b[0m`);

  // Tablica przechowująca historię z zachowaniem odpowiednich typów OpenAI
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are a proactive smart home manager running in a loop.
Always verify that every command actually succeeded by checking device state after executing an action.
If something fails, retry or try an alternative approach.
There is no human-in-the-loop.
Do not ask it any questions (even for permission).
Focus on actions, not conversation.
Do not finish until you have confirmed the task is fully and correctly done.`
    },
    { role: 'user', content: userCommand }
  ];

  const MAX_ITERATIONS = 15;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: messages,
      tools: toolsDefinition as ChatCompletionTool[],
      tool_choice: 'auto',
    });

    const responseMessage = response.choices[0].message;

    // Dodajemy surową odpowiedź asystenta do historii
    messages.push(responseMessage);

    // Jeśli model chce uruchomić toole
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type !== 'function') continue;

        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        const tool = toolsDefinition.find(t => t.function.name === toolName);
        if (!tool) throw new Error(`Nieznane narzędzie: ${toolName}`);

        let toolResult: string;
        try {
          console.log(`\x1b[33m[Tool call]: ${toolName}(${JSON.stringify(toolArgs)})\x1b[0m`);
          toolResult = await tool.call(toolArgs);
        } catch (error: any) {
          toolResult = JSON.stringify({ error: error.message });
        }

        // Dodanie wyniku narzędzia jako roli 'tool' powiązanej z konkretnym wywołaniem
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      // Kontynuuj pętlę, dając modelowi szansę na przeanalizowanie zwrotki z narzędzi
      continue;
    }

    // Jeśli brak wywołań narzędzi -> model sformułował odpowiedź końcową
    console.log(`\n\x1b[32m[Agent]: ${responseMessage.content}\x1b[0m`);
    return responseMessage.content ?? '';
  }

  console.log('\n\x1b[31m[Safety]: Max iterations reached\x1b[0m');
  return 'Sorry, I could not complete the task in the allowed number of steps.';
}

// 4. Uruchomienie deweloperskie
runAgent("wyłącz wszystkie światła w salonie");
