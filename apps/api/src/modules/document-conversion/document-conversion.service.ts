import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class DocumentConversionService {
  constructor(@Inject(ConfigService) _config: ConfigService) { void _config; }

  async convertToPdf(_file: { data: Buffer; originalName: string; mimeType: string }): Promise<Buffer> {
    void _file;
    throw new BadRequestException("La conversion de Word esta desactivada. Sustituye el archivo historico por un PDF.");
  }
}
