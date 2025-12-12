import { Injectable, Scope } from '@nestjs/common';
import { OpenaiService } from 'src/openai/openai.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Socket } from 'socket.io';

@Injectable({ scope: Scope.TRANSIENT })
export class AiFeaturesService {
  constructor(
    private prisma: PrismaService,
    private openaiService: OpenaiService,
  ) {}

  async takeVoice(audio: any, client: Socket) {
    const text = await this.openaiService.speechToText(audio);

    const newGeneratedText = await this.openaiService.textToText(text, client);

    const speech = await this.openaiService.textToSpeech(newGeneratedText);

    return '';
  }

  takeText(data: any, client: Socket) {
    return this.openaiService.textToText(data, client);
  }
}
