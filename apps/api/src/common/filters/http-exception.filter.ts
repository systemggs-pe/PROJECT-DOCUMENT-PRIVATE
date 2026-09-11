import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
  path: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;

    response.status(status).json({
      success: false,
      error: {
        code: this.resolveErrorCode(exceptionResponse, status),
        message: this.resolveErrorMessage(exceptionResponse, status),
      },
      path: request.url,
      timestamp: new Date().toISOString(),
    } satisfies ErrorResponseBody);
  }

  private resolveErrorCode(exceptionResponse: unknown, status: number): string {
    if (isRecord(exceptionResponse) && typeof exceptionResponse.error === "string") {
      return normalizeCode(exceptionResponse.error);
    }

    return status === HttpStatus.INTERNAL_SERVER_ERROR ? "INTERNAL_SERVER_ERROR" : `HTTP_${status}`;
  }

  private resolveErrorMessage(exceptionResponse: unknown, status: number): string {
    if (typeof exceptionResponse === "string") {
      return exceptionResponse;
    }

    if (isRecord(exceptionResponse)) {
      const message = exceptionResponse.message;
      if (typeof message === "string") {
        return message;
      }

      if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
        return message.join("; ");
      }
    }

    return status === HttpStatus.INTERNAL_SERVER_ERROR
      ? "Unexpected server error"
      : "Request could not be processed";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCode(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}
