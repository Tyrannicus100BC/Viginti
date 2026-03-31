/**
 * Simple client for local Ollama API
 */

export interface OllamaResponse {
    reasoning: string;
    actionIndex: number;
}

export async function queryOllama(
    model: string, 
    prompt: string, 
    systemPrompt?: string
): Promise<OllamaResponse> {
    const url = 'http://localhost:11434/api/generate';
    
    const body = {
        model,
        prompt,
        system: systemPrompt,
        stream: false,
        format: 'json',
        options: {
            temperature: 0, // Deterministic for simulations
            num_predict: 256, // Limit response length to save time
            top_k: 20,
            top_p: 0.9,
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const parsedResponse = JSON.parse(data.response);
        
        if (typeof parsedResponse.actionIndex !== 'number') {
            throw new Error(`Invalid model response format: ${data.response}`);
        }
        
        return parsedResponse as OllamaResponse;
    } catch (error) {
        console.error('Error querying Ollama:', error);
        throw error;
    }
}
