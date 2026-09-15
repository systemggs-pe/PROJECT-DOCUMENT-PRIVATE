import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class StorageService {
  readonly bucket: string;
  private readonly client: SupabaseClient;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const url = configService.get<string>("SUPABASE_URL")?.trim();
    const serviceRoleKey = configService.get<string>("SUPABASE_SERVICE_ROLE_KEY")?.trim();

    if (!url || !serviceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage.");
    }

    this.bucket = configService.get<string>("STORAGE_BUCKET")?.trim() || "ggs-documents";
    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async put(path: string, content: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(path, content, {
      contentType,
      upsert: false,
    });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }

  async read(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);

    if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? "file not found"}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async sign(path: string, expiresIn = 300): Promise<string> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) throw new Error(`Storage signed URL failed: ${error?.message ?? "URL not created"}`);
    return data.signedUrl;
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([path]);

    if (error) throw new Error(`Storage deletion failed: ${error.message}`);
  }
}
