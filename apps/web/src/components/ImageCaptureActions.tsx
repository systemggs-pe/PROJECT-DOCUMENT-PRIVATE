import { Camera, ImagePlus } from "lucide-react";

interface ImageCaptureActionsProps {
  fileLabel?: string;
  cameraLabel?: string;
  disabled?: boolean;
  onSelect: (file: File) => void;
}

const imageAccept = "image/jpeg,image/png,image/webp";

export function ImageCaptureActions({
  fileLabel = "Elegir de galeria",
  cameraLabel = "Tomar foto",
  disabled = false,
  onSelect,
}: ImageCaptureActionsProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) onSelect(file);
  }

  return (
    <div className="image-capture-actions">
      <label className={`image-capture-button ${disabled ? "is-disabled" : ""}`}>
        <ImagePlus className="size-4" aria-hidden={true} />
        <span>{fileLabel}</span>
        <input type="file" accept={imageAccept} disabled={disabled} onChange={handleChange} />
      </label>
      <label className={`image-capture-button ${disabled ? "is-disabled" : ""}`}>
        <Camera className="size-4" aria-hidden={true} />
        <span>{cameraLabel}</span>
        <input type="file" accept={imageAccept} capture="environment" disabled={disabled} onChange={handleChange} />
      </label>
    </div>
  );
}
