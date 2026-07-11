import OpenAI from 'openai';
import { 
  ChatCompletionTool, 
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';

// 1. Konfiguracja klienta OpenAI skierowanego na lokalną Ollamę
const openai = new OpenAI({
  baseURL: 'http://127.0.0.1:1234/v1',
  apiKey: 'ollama', 
});

const MODEL_NAME = 'qwen3:7b';

// Interfejsy dla argumentów naszych funkcji smart home
interface GetStatusArgs {
  entity_id: string;
}

interface ControlDeviceArgs {
  entity_id: string;
  action: 'turn_on' | 'turn_off';
}

// 2. DEFINICJE NARZĘDZI (Ścisłe typowanie z biblioteki OpenAI)
const toolsDefinition: ChatCompletionTool[] = [
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
    }
  }
];

// Silnik wykonawczy wykonujący mockowane operacje
async function executeTool(name: string, args: any): Promise<string> {
  console.log(`\x1b[33m[Wykonuję narzędzie]: ${name} z argumentami: ${JSON.stringify(args)}\x1b[0m`);
  
  switch (name) {
    case 'get_device_status': {
      const typedArgs = args as GetStatusArgs;
      if (typedArgs.entity_id === 'light.salon') {
        return JSON.stringify({ status: 'off', brightness: 0 });
      }
      return JSON.stringify({ error: `Urządzenie ${typedArgs.entity_id} jest offline.` });
    }
    
    case 'control_device': {
      const typedArgs = args as ControlDeviceArgs;
      return JSON.stringify({ 
        success: true, 
        message: `Urządzenie ${typedArgs.entity_id} zmieniło stan na ${typedArgs.action}` 
      });
    }
    
    default:
      throw new Error(`Nieznane narzędzie: ${name}`);
  }
}

// 3. GŁÓWNA PĘTLA AGENTOWA (Agentic Loop)
async function runAgent(userCommand: string): Promise<string> {
  console.log(`\n\x1b[36m[Użytkownik]: ${userCommand}\x1b[0m`);

  // Tablica przechowująca historię z zachowaniem odpowiednich typów OpenAI
  const messages: ChatCompletionMessageParam[] = [
    { 
      role: 'system', 
      content: 'Jesteś autonomicznym zarządcą smart home. Po wykonaniu każdego narzędzia zweryfikuj wynik — jeśli operacja się nie powiodła (np. błąd w odpowiedzi), spróbuj ponownie lub zastosuj alternatywne podejście. Nie kończ dopóki nie potwierdzisz, że zadanie zostało poprawnie wykonane.' 
    },
    { role: 'user', content: userCommand }
  ];

  const MAX_ITERATIONS = 5;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n--- Obieg pętli agenta #${iteration} ---`);

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: messages,
      tools: toolsDefinition,
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
        
        let toolResult: string;
        try {
          toolResult = await executeTool(toolName, toolArgs);
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
    console.log(`\n\x1b[32m[Agent osiągnął sukces]: ${responseMessage.content}\x1b[0m`);
    return responseMessage.content ?? '';
  }

  console.log('\n\x1b[31m[Bezpiecznik]: Osiągnięto limit maksymalnych iteracji.\x1b[0m');
  return 'Przepraszam, nie udało mi się ukończyć zadania w przewidzianej liczbie kroków.';
}

// 4. Uruchomienie deweloperskie
runAgent("wyłącz światło w salonie");
