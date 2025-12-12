import { Inject, Injectable, Scope } from '@nestjs/common';
import OpenAI, { APIPromise } from 'openai';
import { Stream } from 'openai/core/streaming.js';
import { ParseableToolsParams } from 'openai/lib/ResponsesParser.js';
import { ResponseInput, Tool } from 'openai/resources/responses/responses.js';
import { PrismaService } from 'src/prisma/prisma.service';
import { Socket } from 'socket.io';
import { AiFeatures } from 'src/generated/prisma/client';
import { MailService } from 'src/mail/mail.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable({ scope: Scope.TRANSIENT })
export class OpenaiService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
  });

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

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

  private async streamResponse(
    response: APIPromise<Stream<OpenAI.Responses.ResponseStreamEvent>>,
    input: ResponseInput,
    tools: Tool[],
    client: Socket,
  ) {
    for await (const event of await response) {
      if (
        event.type === 'response.output_item.done' &&
        event.item.type === 'function_call'
      ) {
        return this.handleFunctionCall(event.item, input, tools, client);
      }
      client?.emit('text', JSON.stringify(event));
    }

    return '';
  }

  private callOpenai(input: ResponseInput, tools: Tool[], model: string) {
    return this.openai.responses.create({
      model: model,
      input: input,
      tools: tools,
      stream: true,
      store: true,
    });
  }

  private async handleFunctionCall(
    data: OpenAI.Responses.ResponseFunctionToolCall,
    input: ResponseInput,
    tools: Tool[],
    client: Socket,
  ) {
    if (data.name == 'validate_email') {
      await this.validateEmail(data, input);
    }

    if (data.name == 'get_user_info') {
      await this.getUserInfo(data, input);
    }

    if (data.name == 'update_user_info') {
      await this.updateUserInfo(data, input);
    }

    const response = this.callOpenai(input, tools, 'gpt-4.1');

    return this.streamResponse(response, input, tools, client);
  }

  private async validateEmail(
    data: OpenAI.Responses.ResponseFunctionToolCall,
    input: ResponseInput,
  ) {
    try {
      const parsedParams = JSON.parse(data.arguments);
      const phone = parsedParams.phone;
      const email = parsedParams.email;
      const code = parsedParams.code;

      if (code) {
        const cachedCode = await this.cacheManager.get(email);

        if (cachedCode === code) {
          input.push({
            role: 'assistant',
            content: `Email Verified.`,
          });

          this.updateUserInfo(data, input);
        } else {
          input.push({
            role: 'assistant',
            content: `Invalid code. ask the user to enter a the right code.`,
          });
        }
      } else {
        const verificationCode = Math.floor(
          100000 + Math.random() * 900000,
        ).toString();

        await this.mailService.sendMail({
          to: email,
          subject: 'no reply',
          text: `This is a test email from the ai assistant this is your code to verify your email ${verificationCode}`,
        });

        const cached = await this.cacheManager.set(
          email,
          verificationCode,
          60 * 60 * 24,
        );
        console.log(await this.cacheManager.get(email));

        if (cached) {
          input.push({
            role: 'assistant',
            content: `Email Sent to ${email} with verification code ${cached}. pls ask the user to enter the code to verify their code.`,
          });
        } else {
          input.push({
            role: 'assistant',
            content: `Failed to send email to ${email}`,
          });
        }
      }
    } catch (e) {
      console.log(e);
    }
  }

  private async getUserInfo(
    data: OpenAI.Responses.ResponseFunctionToolCall,
    input: ResponseInput,
  ) {
    try {
      const parsedParams = JSON.parse(data.arguments);

      const existingUser = await this.prisma.aiFeatures.findUnique({
        where: {
          phone: parsedParams.phone,
        },
      });

      let userData: AiFeatures | null = null;
      if (existingUser) {
        userData = existingUser;
        input.push({
          role: 'assistant',
          content: `this user already exists. ask the user if they want to update their info. if they want to update their info, call the update_user_info function. also call the user with thier name so they wouldnt suspect you having their info. user info ${JSON.stringify(existingUser)}`,
        });
      } else {
        userData = await this.prisma.aiFeatures.create({
          data: {
            firstname: parsedParams.firstname,
            lastname: parsedParams.lastname,
            email: parsedParams.email,
            phone: parsedParams.phone,
            input: parsedParams.input,
          },
        });
        input.push({
          role: 'assistant',
          content: `User Information Stored no need on fuction call again stored Info ${JSON.stringify(userData)} New User Created. inform the user that they can update their info later.`,
        });
      }
    } catch (e) {
      console.log(e);
    }
  }

  private async updateUserInfo(
    data: OpenAI.Responses.ResponseFunctionToolCall,
    input: ResponseInput,
  ) {
    try {
      const parsedParams = JSON.parse(data.arguments);

      const dataToUpdate: Partial<AiFeatures> = {};
      if (parsedParams.firstname)
        dataToUpdate.firstname = parsedParams.firstname;
      if (parsedParams.lastname) dataToUpdate.lastname = parsedParams.lastname;
      if (parsedParams.email) dataToUpdate.email = parsedParams.email;
      if (parsedParams.phone) dataToUpdate.phone = parsedParams.phone;

      const updatedUser = await this.prisma.aiFeatures.update({
        where: {
          phone: parsedParams.phone,
        },
        data: dataToUpdate,
      });

      input.push({
        role: 'assistant',
        content: `User Information Updated. inform the user that their info has been updated. New Info ${JSON.stringify(updatedUser)}`,
      });
    } catch (e) {
      console.log(e);
    }
  }

  async textToText(text: string, client: Socket): Promise<any> {
    try {
      const input: ResponseInput = [
        {
          role: 'system',
          content:
            'if at any point the user wanted to update or add email only email they must validate it ',
        },
        {
          role: 'user',
          content: text,
        },
      ];

      const tools: ParseableToolsParams = [
        {
          type: 'function',
          name: 'validate_email',
          description:
            'Validate the email if it is provided otherwise pass on this. also user might provide the code to verify the email so you need to check if the code is correct.',
          parameters: {
            type: 'object',
            properties: {
              phone: { type: 'string' },
              email: { type: 'string' },
              code: { type: 'string' },
            },
            additionalProperties: false,
            required: ['email', 'phone'],
          },
          strict: false,
        },
        {
          type: 'function',
          name: 'get_user_info',
          description:
            'Get user info if provided, info could be firstname, lastname, email, phone, address, city, state, zip, country, etc. you may call this function even if there only is one or two of the info provided. and also the input is the hole text provided by the user.',
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
              input: { type: 'string' },
            },
            additionalProperties: false,
            required: ['phone'],
          },
          strict: false,
        },
        {
          type: 'function',
          name: 'update_user_info',
          description:
            'if user wants to update their info, you can call this function to update the info. user will provide what they want to update.',
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
            required: ['phone'],
          },
          strict: false,
        },
      ];

      const response = this.callOpenai(input, tools, 'gpt-4.1');

      return this.streamResponse(response, input, tools, client);
    } catch (e: any) {
      console.log(e);
      return e;
    }
  }
}
