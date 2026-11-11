import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ImportModule } from '../importers/import.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ShareController } from './share.controller.js';
import { ShareService } from './share.service.js';

@Module({
  imports: [ImportModule, JobsModule, AiModule],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
