import { ArgumentsHost, Catch, HttpStatus } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";

interface ZodLikeError {
  name: string;
  issues: { path: PropertyKey[]; message: string }[];
}

/** Reconnaît une erreur Zod sans `instanceof` : l'API et @acg/shared peuvent charger deux copies de zod. */
export function isZodError(err: unknown): err is ZodLikeError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "ZodError" &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

export function validationBody(err: ZodLikeError) {
  return {
    statusCode: HttpStatus.BAD_REQUEST,
    code: "INVALID_BODY",
    message: err.issues.slice(0, 5).map((i) => `${i.path.map(String).join(".") || "corps"} : ${i.message}`),
  };
}

/**
 * Un corps qui ne respecte pas le contrat (schémas Zod de @acg/shared) est une erreur du
 * client : 400 avec les champs en cause, et non une erreur 500 du serveur.
 */
@Catch()
export class ValidationFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (!isZodError(exception)) return super.catch(exception, host);
    const res = host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>();
    res.status(HttpStatus.BAD_REQUEST).json(validationBody(exception));
  }
}
