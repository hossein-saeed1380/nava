import { Module } from '@nestjs/common';
import { OpenaiService } from './openai.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { MailService } from 'src/mail/mail.service';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [OpenaiService, MailService],
  exports: [OpenaiService],
})
export class OpenaiModule {}
