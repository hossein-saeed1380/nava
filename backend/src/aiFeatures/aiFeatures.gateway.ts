import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AiFeaturesService } from './aiFeatures.service';
import { Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  port: 3002,
})
export class AiFeaturesGateway {
  constructor(private readonly aiFeaturesService: AiFeaturesService) {}

  @SubscribeMessage('voice')
  async handleAudio(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ): Promise<string> {
    return await this.aiFeaturesService.takeVoice(data, client);
  }

  @SubscribeMessage('text')
  onEvent(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    return this.aiFeaturesService.takeText(data, client);
  }
}
