import { IsString, IsNumber, validateSync } from 'class-validator';
import { plainToClass } from 'class-transformer';

class EnvironmentVariables {
  @IsString()
  HF_API_KEY: string;

  @IsString()
  FLASK_IP: string;

  @IsNumber()
  PORT: number = 3000;

  @IsString()
  REDIS_URL: string;
}

function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.toString()}`);
  }

  return validatedConfig;
}

export const environmentConfig = {
  validate,
};