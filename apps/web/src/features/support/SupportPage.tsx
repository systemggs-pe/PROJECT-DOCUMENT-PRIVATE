import { BookOpen, ClipboardCopy, ExternalLink, LifeBuoy, Mail, Phone, Wrench } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getDiagnosticInfo, getSupportMailto, systemMetadata } from "@/config/system-metadata";

const faqItems = [
  {
    question: "Como genero un documento?",
    answer: "Entra a Generar, selecciona una plantilla, completa los campos requeridos, actualiza la previsualizacion y confirma la generacion cuando el PDF sea correcto.",
  },
  {
    question: "Como cargo una imagen o archivo?",
    answer: "Usa la biblioteca de Archivos o los campos de la plantilla. El sistema valida tipo, peso y ownership antes de permitir la generacion.",
  },
  {
    question: "Como reviso el PDF antes de descargarlo?",
    answer: "La vista de Generar permite actualizar la previsualizacion real del PDF antes de crear el documento final.",
  },
  {
    question: "Que hago si un archivo no carga?",
    answer: "Verifica que el archivo no este danado, que su extension coincida con el formato y que no supere los limites configurados.",
  },
];

export default function SupportPage() {
  const [copyStatus, setCopyStatus] = useState("");
  const mailto = getSupportMailto();
  const hasContact = Boolean(systemMetadata.support.email || systemMetadata.support.phone || systemMetadata.support.websiteUrl);

  async function copyDiagnosticInfo() {
    const diagnosticInfo = getDiagnosticInfo();
    try {
      await navigator.clipboard.writeText(diagnosticInfo);
      setCopyStatus("Informacion del sistema copiada.");
    } catch {
      setCopyStatus("No se pudo copiar automaticamente.");
    }
  }

  return (
    <section className="support-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Soporte</p>
          <h2>Centro de ayuda</h2>
          <p className="page-subtitle">
            Informacion del producto, canales de contacto y datos seguros para reportar problemas.
          </p>
        </div>
      </header>

      <div className="support-grid">
        <article className="support-card support-hero">
          <div className="support-icon">
            <LifeBuoy className="size-5" aria-hidden={true} />
          </div>
          <div>
            <p className="eyebrow">Producto</p>
            <h3>{systemMetadata.productName}</h3>
            <p>{systemMetadata.poweredBy} · {systemMetadata.productFamily}</p>
          </div>
        </article>

        <article className="support-card">
          <div className="support-card-heading">
            <Mail className="size-5" aria-hidden={true} />
            <h3>Contacto</h3>
          </div>
          {hasContact ? (
            <div className="support-list">
              {systemMetadata.support.email ? (
                <a href={mailto} className="support-link">{systemMetadata.support.email}</a>
              ) : null}
              {systemMetadata.support.phone ? (
                <a href={`tel:${systemMetadata.support.phone}`} className="support-link">
                  <Phone className="size-4" aria-hidden={true} />
                  {systemMetadata.support.phone}
                </a>
              ) : null}
              {systemMetadata.support.websiteUrl ? (
                <a href={systemMetadata.support.websiteUrl} className="support-link" target="_blank" rel="noopener noreferrer">
                  Sitio de soporte
                  <ExternalLink className="size-4" aria-hidden={true} />
                </a>
              ) : null}
              {systemMetadata.support.hours ? <p>{systemMetadata.support.hours}</p> : null}
            </div>
          ) : (
            <p className="support-muted">Canal de soporte por configurar.</p>
          )}
        </article>

        <article className="support-card">
          <div className="support-card-heading">
            <BookOpen className="size-5" aria-hidden={true} />
            <h3>Documentacion</h3>
          </div>
          {systemMetadata.support.documentationUrl ? (
            <a href={systemMetadata.support.documentationUrl} className="support-link" target="_blank" rel="noopener noreferrer">
              Abrir documentacion
              <ExternalLink className="size-4" aria-hidden={true} />
            </a>
          ) : (
            <p className="support-muted">Documentacion proximamente.</p>
          )}
        </article>

        <article className="support-card">
          <div className="support-card-heading">
            <Wrench className="size-5" aria-hidden={true} />
            <h3>Informacion del sistema</h3>
          </div>
          <dl className="system-info-list">
            <div><dt>Producto</dt><dd>{systemMetadata.productName}</dd></div>
            <div><dt>Version</dt><dd>v{systemMetadata.version}</dd></div>
            <div><dt>Proveedor</dt><dd>{systemMetadata.productFamily} / {systemMetadata.vendorName}</dd></div>
            {systemMetadata.build ? <div><dt>Build</dt><dd>{systemMetadata.build}</dd></div> : null}
          </dl>
          <Button type="button" variant="ghost" className="support-copy-button" onClick={() => void copyDiagnosticInfo()}>
            <ClipboardCopy className="size-4" aria-hidden={true} />
            Copiar informacion del sistema
          </Button>
          {copyStatus ? <p className="support-copy-status" role="status">{copyStatus}</p> : null}
        </article>
      </div>

      <section className="support-card">
        <div className="support-card-heading">
          <LifeBuoy className="size-5" aria-hidden={true} />
          <h3>Preguntas frecuentes</h3>
        </div>
        <div className="faq-list">
          {faqItems.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="support-card">
        <div className="support-card-heading">
          <ClipboardCopy className="size-5" aria-hidden={true} />
          <h3>Reportar un problema</h3>
        </div>
        <p className="support-muted">
          Incluye que intentabas hacer, el mensaje de error, una captura si aplica y la informacion del sistema copiada desde esta pagina.
        </p>
        {mailto ? (
          <Button asChild>
            <a href={mailto}>Contactar soporte</a>
          </Button>
        ) : null}
      </section>
    </section>
  );
}
