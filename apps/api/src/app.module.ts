import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./auth/guards.js";
import { AuthController } from "./auth/auth.controller.js";
import { EvaluateController } from "./evaluate/evaluate.controller.js";
import { EvaluateService } from "./evaluate/evaluate.service.js";
import { PoliciesController } from "./policies/policies.controller.js";
import { EventsController } from "./events/events.controller.js";
import { AnalyticsController } from "./analytics/analytics.controller.js";
import { AgentsController } from "./agents/agents.controller.js";
import { FrameworksController } from "./frameworks/frameworks.controller.js";
import { AiServicesController } from "./ai-services/ai-services.controller.js";
import { UsersController } from "./users/users.controller.js";
import { HeartbeatMonitor } from "./heartbeat.monitor.js";
import { ModelsController } from "./models/models.controller.js";

@Module({
  controllers: [
    AuthController,
    EvaluateController,
    PoliciesController,
    EventsController,
    AnalyticsController,
    AgentsController,
    FrameworksController,
    AiServicesController,
    UsersController,
    ModelsController,
  ],
  providers: [EvaluateService, HeartbeatMonitor, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
