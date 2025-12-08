import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ParseableToolsParams } from 'openai/lib/ResponsesParser.js';
import { ResponseInput } from 'openai/resources/responses/responses.js';
import { from, map } from 'rxjs';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OpenaiService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
  });
  constructor(private prisma: PrismaService) {}

  async speechToText(audio: any) {
    const response = await this.openai.audio.transcriptions.create({
      model: 'gpt-4o-mini',
      file: audio,
    });
    return response.text;
  }

  async textToSpeech(text: string) {
    const response = await this.openai.audio.speech.create({
      input: text,
      model: 'gpt-4o-mini',
      voice: 'alloy',
    });
    return response.blob() || '';
  }

  async textToText(text: string): Promise<any> {
    try {
      const input: ResponseInput = [
        {
          role: 'user',
          content: text,
        },
      ];

      const tools: ParseableToolsParams = [
        {
          type: 'function',
          name: 'get_user_info',
          description:
            'Get user info if provided, info could be firstname, lastname, email, phone, address, city, state, zip, country, etc. you may call this function even if there only is one or two of the info provided.',
          parameters: {
            type: 'object',
            properties: {
              firstname: { type: 'string' },
              lastname: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              address: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              zip: { type: 'string' },
              country: { type: 'string' },
            },
            additionalProperties: false,
          },
          strict: false,
        },
      ];

      const response = this.openai.responses.create({
        model: 'gpt-4.1',
        input: input,
        tools: tools,
        stream: true,
        store: true,
      });

      const getUserInfo = async (params: any) => {
        const parsedParams = JSON.parse(params);
        console.log(parsedParams);
        const userData = await this.prisma.aiFeatures.create({
          data: {
            firstname: parsedParams.firstname,
            lastname: parsedParams.lastname,
            email: parsedParams.email,
            phone: parsedParams.phone,
          },
        });

        return userData;
      };

      const event = 'text';

      const handleFunctionCall = (
        data: OpenAI.Responses.ResponseFunctionToolCall,
      ) => {
        if (data.name == 'get_user_info') {
          getUserInfo(data.arguments);
        }
      };

      return from(await response).pipe(
        map((data) => {
          if (data.type === 'response.function_call_arguments.delta') {
            return null;
          }
          if (
            data.type === 'response.output_item.done' &&
            data.item.type === 'function_call'
          ) {
            handleFunctionCall(data.item);
            return null;
          }
          return { event, data: data };
        }),
      );
    } catch (e: any) {
      console.log(e);
      return e;
    }
  }
}
